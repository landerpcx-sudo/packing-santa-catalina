import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncDocsToDrive } from '@/lib/drive-sync'
import { recalculateLotStatus } from '@/lib/status-helper'
import { recalcularDespacho } from '@/lib/papelera'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    const body = await request.json()
    const { entity, entityId, documentType, storagePath, sanitizedName, versionNumber = 1, fileHash } = body

    if (!entity || !entityId || !documentType || !storagePath || !sanitizedName) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos para confirmar la subida.' }, { status: 400 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('documentos').getPublicUrl(storagePath)
    const fileUrl = publicUrlData.publicUrl

    let docRecord: any = null

    if (entity === 'despachos') {
      const { data: dispatchRecord, error: dispatchErr } = await supabaseAdmin
        .from('dispatches')
        .select('id, internal_code, expected_pallets, pack_list_status, pata_pata_photos_count, thermograph_photos_count')
        .eq('id', entityId)
        .single()

      if (dispatchErr || !dispatchRecord) {
        return NextResponse.json({ error: 'Despacho no encontrado.' }, { status: 404 })
      }

      const { data: inserted, error: dbError } = await supabaseAdmin
        .from('dispatch_documents')
        .insert({
          dispatch_id: entityId,
          document_type: documentType,
          original_file_name: sanitizedName,
          drive_file_id: null,
          drive_file_url: null,
          storage_path: storagePath,
          storage_url: fileUrl,
          uploaded_by: userId || null,
          version_number: versionNumber,
          is_correction: versionNumber > 1,
          status: 'uploaded',
          file_hash: fileHash || null,
        })
        .select()
        .single()

      if (dbError) {
        await supabaseAdmin.storage.from('documentos').remove([storagePath])
        return NextResponse.json({ error: dbError.message }, { status: 500 })
      }
      docRecord = inserted

      // Contadores y estado general: se recuentan los documentos vivos en vez de
      // sumar a ciegas sobre el contador guardado, que se desincronizaba en
      // cuanto una subida o un borrado fallaban a mitad de camino.
      await recalcularDespacho(entityId)

      after(async () => {
        try {
          await syncDocsToDrive({ table: 'dispatch_documents', docId: docRecord.id })
        } catch (e: any) {
          console.error('[CONFIRM-DESPACHO] Sync a Drive en segundo plano falló:', e.message)
        }
        await supabaseAdmin.from('audit_log').insert({
          user_id: userId || null,
          action: 'UPLOAD_DISPATCH_DOCUMENT',
          entity_type: 'dispatch_documents',
          entity_id: docRecord.id,
          details: { dispatch_id: entityId, document_type: documentType, file_name: sanitizedName },
        })
      })

    } else if (entity === 'lotes') {
      const { data: inserted, error: dbError } = await supabaseAdmin
        .from('lot_documents')
        .insert({
          lot_id: entityId,
          document_type: documentType,
          original_file_name: sanitizedName,
          drive_file_id: null,
          drive_file_url: null,
          storage_path: storagePath,
          storage_url: fileUrl,
          uploaded_by: userId || null,
          version_number: versionNumber,
          is_correction: versionNumber > 1,
          status: 'uploaded',
          validation_status: 'pending',
          file_hash: fileHash || null,
        })
        .select()
        .single()

      if (dbError) {
        await supabaseAdmin.storage.from('documentos').remove([storagePath])
        return NextResponse.json({ error: dbError.message }, { status: 500 })
      }
      docRecord = inserted

      const statusFieldMap: Record<string, string> = {
        reception: 'reception_status',
        quality: 'quality_status',
        process: 'process_status',
      }
      if (statusFieldMap[documentType]) {
        await recalculateLotStatus(entityId)
      }

      after(async () => {
        try {
          await syncDocsToDrive({ table: 'lot_documents', docId: docRecord.id })
        } catch (e: any) {
          console.error('[CONFIRM-LOTE] Sync a Drive en segundo plano falló:', e.message)
        }
        await supabaseAdmin.from('audit_log').insert({
          user_id: userId || null,
          action: 'UPLOAD_DOCUMENT',
          entity_type: 'lot_documents',
          entity_id: docRecord.id,
          details: { lot_id: entityId, document_type: documentType, file_name: sanitizedName },
        })
      })

    } else if (entity === 'temperaturas') {
      const { data: inserted, error: dbError } = await supabaseAdmin
        .from('temperature_documents')
        .insert({
          temperature_report_id: entityId,
          document_type: documentType,
          original_file_name: sanitizedName,
          drive_file_id: null,
          drive_file_url: null,
          storage_path: storagePath,
          storage_url: fileUrl,
          uploaded_by: userId || null,
          status: 'uploaded',
          file_hash: fileHash || null,
        })
        .select()
        .single()

      if (dbError) {
        await supabaseAdmin.storage.from('documentos').remove([storagePath])
        return NextResponse.json({ error: dbError.message }, { status: 500 })
      }
      docRecord = inserted

      if (documentType === 'daily_report') {
        await supabaseAdmin
          .from('temperature_reports')
          .update({ status: 'uploaded' })
          .eq('id', entityId)
      }

      after(async () => {
        try {
          await syncDocsToDrive({ table: 'temperature_documents', docId: docRecord.id })
        } catch (e: any) {
          console.error('[CONFIRM-TEMP] Sync a Drive en segundo plano falló:', e.message)
        }
        await supabaseAdmin.from('audit_log').insert({
          user_id: userId || null,
          action: 'UPLOAD_TEMP_DOCUMENT',
          entity_type: 'temperature_documents',
          entity_id: docRecord.id,
          details: { temperature_report_id: entityId, document_type: documentType, file_name: sanitizedName },
        })
      })
    }

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/upload/confirm error:', err)
    return NextResponse.json({ error: err.message || 'Error interno al confirmar subida' }, { status: 500 })
  }
}
