import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile } from '@/lib/drive'

// GET /api/settings/drive-sync-pending - Listar archivos no sincronizados
export async function GET() {
  try {
    const { data: lotDocs, error: err1 } = await supabaseAdmin
      .from('lot_documents')
      .select('id, original_file_name, lot_id, document_type, created_at')
      .is('drive_file_id', null)

    const { data: dispatchDocs, error: err2 } = await supabaseAdmin
      .from('dispatch_documents')
      .select('id, original_file_name, dispatch_id, document_type, created_at')
      .is('drive_file_id', null)

    if (err1 || err2) throw new Error('Error al consultar documentos pendientes.')

    return NextResponse.json({
      data: {
        lots: lotDocs,
        dispatches: dispatchDocs,
        total: (lotDocs?.length || 0) + (dispatchDocs?.length || 0)
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/settings/drive-sync-pending - Sincronizar todos o uno específico
export async function POST(request: Request) {
  try {
    const { docId, table } = await request.json()
    
    let query = supabaseAdmin.from(table).select('*').is('drive_file_id', null)
    if (docId) query = query.eq('id', docId)

    const { data: docs, error } = await query
    if (error || !docs) throw new Error('No se encontraron documentos para sincronizar.')

    const results = { success: 0, failed: 0 }

    for (const doc of docs) {
      try {
        const { data: fileData } = await supabaseAdmin.storage.from('documentos').download(doc.storage_path)
        if (!fileData) continue

        const arrayBuffer = await fileData.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        let targetFolderId = null
        if (table === 'lot_documents') {
          const { data: lot } = await supabaseAdmin.from('lots').select('*').eq('id', doc.lot_id).single()
          if (lot) {
            const folderMap: any = {
              reception: lot.drive_folder_reception_id,
              quality: lot.drive_folder_quality_id,
              process: lot.drive_folder_process_id,
              photo_process: lot.drive_folder_process_id,
              backup: lot.drive_folder_backup_id,
            }
            targetFolderId = folderMap[doc.document_type] || lot.drive_folder_id
          }
        } else {
          const { data: dispatch } = await supabaseAdmin.from('dispatches').select('drive_folder_id').eq('id', doc.dispatch_id).single()
          if (dispatch) targetFolderId = dispatch.drive_folder_id
        }

        if (targetFolderId) {
          const driveFile = await uploadFile(buffer, `v${doc.version_number}_${doc.original_file_name}`, fileData.type, targetFolderId)
          if (driveFile.id) {
            await supabaseAdmin.from(table).update({ drive_file_id: driveFile.id, drive_file_url: driveFile.url }).eq('id', doc.id)
            results.success++
            continue
          }
        }
        results.failed++
      } catch (e) {
        results.failed++
      }
    }

    return NextResponse.json({ data: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
