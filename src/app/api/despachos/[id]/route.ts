import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: dispatch, error } = await supabaseAdmin
      .from('dispatches')
      .select(`
        *,
        created_by_user:users_app!created_by(display_name),
        dispatch_documents(*)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    if (!dispatch) return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })

    // Los documentos en la papelera no se muestran (el archivo sigue guardado).
    const data = {
      ...dispatch,
      dispatch_documents: (dispatch.dispatch_documents || []).filter((d: any) => !d.deleted_at),
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('GET /api/despachos/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData: any = { ...body }

    if ('advance_payments' in updateData) {
      if (Array.isArray(updateData.advance_payments)) {
        const sum = updateData.advance_payments.reduce((acc: number, p: any) => acc + (Number(p?.amount) || 0), 0)
        updateData.advance_amount = sum
      } else if (updateData.advance_payments === null) {
        updateData.advance_payments = []
        updateData.advance_amount = 0
      }
    }

    const numericFields = ['invoice_amount', 'advance_amount', 'expected_pallets']
    for (const field of numericFields) {
      if (field in updateData) {
        if (updateData[field] === '' || updateData[field] === undefined || updateData[field] === null || isNaN(Number(updateData[field]))) {
          updateData[field] = null
        } else {
          updateData[field] = Number(updateData[field])
        }
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('dispatches')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sincronizar montos con dispatch_liquidations si se actualizaron invoice_amount o advance_amount
    if ('invoice_amount' in updateData || 'advance_amount' in updateData) {
      const liqUpdate: any = {}
      if ('invoice_amount' in updateData) {
        liqUpdate.advance_amount = updateData.invoice_amount
      }
      if ('advance_amount' in updateData) {
        liqUpdate.abonos_amount = updateData.advance_amount
      }
      if (Object.keys(liqUpdate).length > 0) {
        await supabaseAdmin
          .from('dispatch_liquidations')
          .update(liqUpdate)
          .eq('dispatch_id', id)
      }
    }

    // Recalcular Estado General (por si cambió expected_pallets)
    const minPata = Math.ceil((updated.expected_pallets || 0) / 2)
    const isComplete = updated.pack_list_status !== 'pending' && 
                       updated.pata_pata_photos_count >= minPata && 
                       updated.thermograph_photos_count >= 2
    
    const { data: final } = await supabaseAdmin
      .from('dispatches')
      .update({ overall_status: isComplete ? 'complete' : 'pending' })
      .eq('id', id)
      .select()
      .single()

    return NextResponse.json({ data: final || updated })
  } catch (err: any) {
    console.error('PATCH /api/despachos/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}

// DELETE - Eliminar un despacho completo (Solo Admin)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')

    // 1. Verificación de seguridad estricta
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado. Solo administradores pueden eliminar despachos.' }, { status: 403 })
    }

    // 2. Obtener datos antes de borrar
    const { data: dispatch, error: fetchError } = await supabaseAdmin
      .from('dispatches')
      .select('drive_folder_id, internal_code')
      .eq('id', id)
      .single()

    if (fetchError || !dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    // 3. Eliminar archivos de Supabase Storage
    const { data: docs } = await supabaseAdmin
      .from('dispatch_documents')
      .select('storage_path')
      .eq('dispatch_id', id)
    
    if (docs && docs.length > 0) {
      const pathsToDelete = docs.map(d => d.storage_path).filter(Boolean) as string[]
      if (pathsToDelete.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage.from('documentos').remove(pathsToDelete)
        if (storageError) console.error('Error limpiando storage de Supabase (despachos):', storageError)
      }
    }

    // 4. Mover carpeta de Google Drive a la Papelera
    if (dispatch.drive_folder_id) {
      try {
        const { trashFolder } = await import('@/lib/drive')
        await trashFolder(dispatch.drive_folder_id)
      } catch (driveErr) {
        console.error('Error moviendo carpeta de Drive a papelera (despachos):', driveErr)
      }
    }

    // 5. Eliminar el despacho de la base de datos
    await supabaseAdmin.from('dispatch_documents').delete().eq('dispatch_id', id)
    
    const { error: deleteError } = await supabaseAdmin
      .from('dispatches')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Auditoría
    const userId = headersList.get('x-user-id')
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'DELETE_DISPATCH',
      entity_type: 'dispatches',
      entity_id: id,
      details: { internal_code: dispatch.internal_code, deleted_at: new Date().toISOString() },
    })

    return NextResponse.json({ success: true, message: 'Despacho eliminado permanentemente.' })

  } catch (err: any) {
    console.error('DELETE /api/despachos/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno al eliminar despacho' }, { status: 500 })
  }
}
