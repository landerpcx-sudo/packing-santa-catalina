import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

// DELETE /api/documentos/[table]/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const { table, id } = await params
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')

    // Solo admin puede borrar
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No tienes permisos para eliminar documentos.' }, { status: 403 })
    }

    if (!['lot_documents', 'dispatch_documents'].includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    // Obtener info del documento antes de borrar para limpiar storage
    const { data: doc, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 })
    }

    // 1. Borrar de la base de datos
    const { error: dbError } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('id', id)

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    // 2. Borrar del storage si existe path
    if (doc.storage_path) {
      await supabaseAdmin.storage.from('documentos').remove([doc.storage_path])
    }

    // 3. Actualizar contadores y recalcular estado general según la tabla
    if (table === 'dispatch_documents') {
      const fieldName = doc.document_type === 'pata_pata_photo' 
        ? 'pata_pata_photos_count' 
        : doc.document_type === 'thermograph_photo' 
          ? 'thermograph_photos_count' 
          : null

      const { data: dispatch } = await supabaseAdmin.from('dispatches').select('*').eq('id', doc.dispatch_id).single()
      
      if (dispatch) {
        const updates: any = {}
        
        if (fieldName) {
          const currentCount = (dispatch as any)?.[fieldName]
          if (currentCount > 0) {
            updates[fieldName] = currentCount - 1
          }
        } else if (doc.document_type === 'pack_list') {
          updates.pack_list_status = 'pending'
        }

        // Recalcular overall_status
        const packListStatus = updates.pack_list_status || dispatch.pack_list_status
        const pataCount = updates.pata_pata_photos_count !== undefined ? updates.pata_pata_photos_count : dispatch.pata_pata_photos_count
        const thermoCount = updates.thermograph_photos_count !== undefined ? updates.thermograph_photos_count : dispatch.thermograph_photos_count
        const minPata = Math.ceil((dispatch.expected_pallets || 0) / 2)

        const isComplete = packListStatus === 'validated' && pataCount >= minPata && thermoCount >= 2
        updates.overall_status = isComplete ? 'complete' : (packListStatus !== 'pending' || pataCount > 0 || thermoCount > 0 ? 'uploaded' : 'pending')
        
        await supabaseAdmin.from('dispatches').update(updates).eq('id', doc.dispatch_id)
      }
    } else if (table === 'lot_documents') {
      const stageFieldMap: Record<string, string> = {
        reception: 'reception_status',
        quality: 'quality_status',
        process: 'process_status',
      }
      const field = stageFieldMap[doc.document_type]
      if (field) {
        // Verificar si quedan otros documentos del mismo tipo antes de volver a pending
        const { count } = await supabaseAdmin
          .from('lot_documents')
          .select('*', { count: 'exact', head: true })
          .eq('lot_id', doc.lot_id)
          .eq('document_type', doc.document_type)

        if (count === 0) {
          // Si ya no quedan documentos de este tipo, la etapa vuelve a pending
          const { data: lot } = await supabaseAdmin.from('lots').select('*').eq('id', doc.lot_id).single()
          if (lot) {
            const updates: any = { [field]: 'pending' }
            
            // Recalcular overall_status
            const s1 = updates.reception_status || lot.reception_status
            const s2 = updates.quality_status || lot.quality_status
            const s3 = updates.process_status || lot.process_status

            if (s1 === 'validated' && s2 === 'validated' && s3 === 'validated') {
              updates.overall_status = 'complete'
            } else if (s1 === 'pending' && s2 === 'pending' && s3 === 'pending') {
              updates.overall_status = 'pending'
            } else {
              updates.overall_status = 'uploaded'
            }

            await supabaseAdmin.from('lots').update(updates).eq('id', doc.lot_id)
          }
        }
      }
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: headersList.get('x-user-id') || null,
      action: 'DELETE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: { document_type: doc.document_type, file_name: doc.original_file_name },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error(`DELETE /api/documentos/[table]/[id] error:`, err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
