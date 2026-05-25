import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recalculateLotStatus } from '@/lib/status-helper'
import { trashFolder } from '@/lib/drive'

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

    if (!['lot_documents', 'dispatch_documents', 'client_documents', 'temperature_documents'].includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    // Obtener info del documento antes de borrar para limpiar storage y Drive
    const { data: doc, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 })
    }

    // 1. Eliminar de Google Drive si tiene drive_file_id
    if (doc.drive_file_id) {
      try {
        await trashFolder(doc.drive_file_id)
      } catch (driveErr: any) {
        console.error(`AVISO: Error al mover archivo de Drive a la papelera (ID: ${doc.drive_file_id}):`, driveErr.message)
      }
    }

    // 2. Borrar de la base de datos
    const { error: dbError } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('id', id)

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    // 3. Borrar del storage si existe path
    if (doc.storage_path) {
      await supabaseAdmin.storage.from('documentos').remove([doc.storage_path])
    }

    // 4. Actualizar contadores y recalcular estado general según la tabla
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
      // Recalcular estados de lote de forma inteligente tras eliminación
      await recalculateLotStatus(doc.lot_id)
    } else if (table === 'temperature_documents') {
      // Si se elimina un daily_report de temperatura, verificar si quedan más daily_reports.
      // Si no quedan, revertir el estado del reporte de temperatura a 'pending'.
      if (doc.document_type === 'daily_report') {
        const { data: remainingDocs } = await supabaseAdmin
          .from('temperature_documents')
          .select('id')
          .eq('temperature_report_id', doc.temperature_report_id)
          .eq('document_type', 'daily_report')
          .neq('id', id)

        if (!remainingDocs || remainingDocs.length === 0) {
          await supabaseAdmin
            .from('temperature_reports')
            .update({ status: 'pending' })
            .eq('id', doc.temperature_report_id)
        }
      }
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: headersList.get('x-user-id') || null,
      action: 'DELETE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: { 
        document_type: doc.document_type || 'client_document', 
        file_name: doc.original_file_name,
        drive_file_id: doc.drive_file_id,
        storage_path: doc.storage_path
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error(`DELETE /api/documentos/[table]/[id] error:`, err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
