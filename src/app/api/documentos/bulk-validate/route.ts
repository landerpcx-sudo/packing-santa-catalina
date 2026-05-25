import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recalculateLotStatus } from '@/lib/status-helper'

// POST /api/documentos/bulk-validate
// Body: { docs: [{ id: string, table: 'lot_documents' | 'dispatch_documents' }] }
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Solo admin o usuarios con permiso pueden validar
    if (userRole !== 'admin') {
      const { data: userRecord } = await supabaseAdmin
        .from('users_app')
        .select('can_validate')
        .eq('id', userId)
        .single()
      if (!userRecord?.can_validate) {
        return NextResponse.json({ error: 'No tienes permisos para validar documentos.' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { docs } = body as { docs: { id: string; table: string }[] }

    if (!docs || !Array.isArray(docs) || docs.length === 0) {
      return NextResponse.json({ error: 'No se enviaron documentos.' }, { status: 400 })
    }

    const validTables = ['lot_documents', 'dispatch_documents']
    const invalidTable = docs.find(d => !validTables.includes(d.table))
    if (invalidTable) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const results: { id: string; ok: boolean; error?: string }[] = []

    // Separar por tabla para hacer updates agrupados
    const lotDocIds = docs.filter(d => d.table === 'lot_documents').map(d => d.id)
    const dispatchDocIds = docs.filter(d => d.table === 'dispatch_documents').map(d => d.id)

    // ── Validar lot_documents ──
    if (lotDocIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('lot_documents')
        .update({
          status: 'validated',
          validation_status: 'validated',
          observation: null,
          validated_by: userId || null,
          validated_at: now,
        })
        .in('id', lotDocIds)

      if (error) {
        lotDocIds.forEach(id => results.push({ id, ok: false, error: error.message }))
      } else {
        lotDocIds.forEach(id => results.push({ id, ok: true }))

        // Re-calcular estados individuales y overall_status de los lotes afectados de forma inteligente
        const { data: updatedDocs } = await supabaseAdmin
          .from('lot_documents')
          .select('lot_id')
          .in('id', lotDocIds)

        const lotIds = [...new Set(updatedDocs?.map(d => d.lot_id) || [])]
        for (const lotId of lotIds) {
          await recalculateLotStatus(lotId)
        }
      }
    }

    // ── Validar dispatch_documents ──
    if (dispatchDocIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('dispatch_documents')
        .update({
          status: 'validated',
          validation_status: 'validated',
          observation: null,
          validated_by: userId || null,
          validated_at: now,
        })
        .in('id', dispatchDocIds)

      if (error) {
        dispatchDocIds.forEach(id => results.push({ id, ok: false, error: error.message }))
      } else {
        dispatchDocIds.forEach(id => results.push({ id, ok: true }))

        // Re-calcular overall_status de los despachos afectados
        const { data: updatedDocs } = await supabaseAdmin
          .from('dispatch_documents')
          .select('dispatch_id')
          .in('id', dispatchDocIds)

        const dispatchIds = [...new Set(updatedDocs?.map(d => d.dispatch_id) || [])]
        for (const dispatchId of dispatchIds) {
          // Releer el despacho DESPUÉS del update para tener pack_list_status actualizado
          const { data: dispatch } = await supabaseAdmin
            .from('dispatches')
            .select('pack_list_status, pata_pata_photos_count, thermograph_photos_count, expected_pallets')
            .eq('id', dispatchId)
            .single()
          if (!dispatch) continue

          const { data: allDocs } = await supabaseAdmin
            .from('dispatch_documents')
            .select('status, document_type')
            .eq('dispatch_id', dispatchId)

          const anyObserved = allDocs?.some(d => d.status === 'observed')
          const minPata = Math.ceil((dispatch.expected_pallets || 0) / 2)

          // Si se validó algún pack_list en este batch, su nuevo status es 'validated'
          const hasPackListValidated = allDocs?.some(d => d.document_type === 'pack_list' && d.status === 'validated')
          const effectivePackListStatus = hasPackListValidated ? 'validated' : dispatch.pack_list_status

          const meetsRequirements =
            effectivePackListStatus === 'validated' &&
            dispatch.pata_pata_photos_count >= minPata &&
            dispatch.thermograph_photos_count >= 2

          let overall = 'uploaded'
          if (anyObserved) overall = 'observed'
          else if (meetsRequirements) overall = 'complete'

          const dispatchUpdates: any = { overall_status: overall }
          if (hasPackListValidated) dispatchUpdates.pack_list_status = 'validated'

          await supabaseAdmin.from('dispatches').update(dispatchUpdates).eq('id', dispatchId)
        }
      }
    }

    // Auditoría
    const auditRows = docs.map(d => ({
      user_id: userId || null,
      action: 'VALIDATE_DOCUMENT',
      entity_type: d.table,
      entity_id: d.id,
      details: { bulk: true },
    }))
    await supabaseAdmin.from('audit_log').insert(auditRows)

    const totalOk = results.filter(r => r.ok).length
    return NextResponse.json({
      ok: true,
      validated: totalOk,
      failed: results.length - totalOk,
      results,
    })
  } catch (err: any) {
    console.error('POST /api/documentos/bulk-validate error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
