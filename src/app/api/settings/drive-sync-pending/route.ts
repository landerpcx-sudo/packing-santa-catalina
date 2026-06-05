import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile, createFolder } from '@/lib/drive'

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
            let driveFolderId = lot.drive_folder_id
            let driveFolderReceptionId = lot.drive_folder_reception_id
            let driveFolderQualityId = lot.drive_folder_quality_id
            let driveFolderProcessId = lot.drive_folder_process_id
            let driveFolderBackupId = lot.drive_folder_backup_id

            // Si el lote no tiene carpeta en Google Drive, estructurarla en caliente
            if (!driveFolderId) {
              try {
                console.log(`[LAZY-DRIVE] Creando estructura de carpetas en Drive para Lote ${lot.internal_code}...`)
                let targetParentFolderId = process.env.ROOT_DRIVE_FOLDER_ID!

                if (lot.client) {
                  const clientUpper = lot.client.trim().toUpperCase()
                  const { data: clientRecord } = await supabaseAdmin
                    .from('clients')
                    .select('id, drive_folder_id, drive_folder_receptions_id')
                    .eq('name', clientUpper)
                    .maybeSingle()
                  
                  if (clientRecord) {
                    let recFolderId = clientRecord.drive_folder_receptions_id
                    if (!recFolderId && clientRecord.drive_folder_id) {
                      const subFolder = await createFolder('Recepciones', clientRecord.drive_folder_id)
                      recFolderId = subFolder.id || null
                      if (recFolderId) {
                        await supabaseAdmin.from('clients').update({ drive_folder_receptions_id: recFolderId }).eq('id', clientRecord.id)
                      }
                    }
                    if (recFolderId) {
                      targetParentFolderId = recFolderId
                    } else if (clientRecord.drive_folder_id) {
                      targetParentFolderId = clientRecord.drive_folder_id
                    }
                  }
                }

                const folderName = `${lot.internal_code} - ${lot.display_name}${lot.client ? ` - ${lot.client}` : ''}`
                const driveFolder = await createFolder(folderName, targetParentFolderId)
                driveFolderId = driveFolder.id || null

                if (driveFolderId) {
                  const [rec, cal, pro, bak] = await Promise.all([
                    createFolder('1. Recepcion', driveFolderId),
                    createFolder('2. Calidad', driveFolderId),
                    createFolder('3. Proceso', driveFolderId),
                    createFolder('4. Respaldos', driveFolderId),
                  ])
                  driveFolderReceptionId = rec.id || null
                  driveFolderQualityId = cal.id || null
                  driveFolderProcessId = pro.id || null
                  driveFolderBackupId = bak.id || null

                  // Actualizar lote en Supabase
                  await supabaseAdmin.from('lots').update({
                    drive_folder_id: driveFolderId,
                    drive_folder_url: driveFolder.url || null,
                    drive_folder_reception_id: driveFolderReceptionId,
                    drive_folder_quality_id: driveFolderQualityId,
                    drive_folder_process_id: driveFolderProcessId,
                    drive_folder_backup_id: driveFolderBackupId
                  }).eq('id', lot.id)
                }
              } catch (driveErr: any) {
                console.error(`[LAZY-DRIVE] Error estructurando carpetas de Lote:`, driveErr.message)
              }
            }

            const folderMap: any = {
              reception: driveFolderReceptionId,
              quality: driveFolderQualityId,
              process: driveFolderProcessId,
              photo_process: driveFolderProcessId,
              backup: driveFolderBackupId,
            }
            targetFolderId = folderMap[doc.document_type] || driveFolderId
          }
        } else {
          const { data: dispatch } = await supabaseAdmin.from('dispatches').select('*').eq('id', doc.dispatch_id).single()
          if (dispatch) {
            let driveFolderId = dispatch.drive_folder_id

            // Si el despacho no tiene carpeta, crearla en caliente
            if (!driveFolderId) {
              try {
                console.log(`[LAZY-DRIVE] Creando carpeta en Drive para Despacho ${dispatch.codigo}...`)
                let targetParentFolderId = process.env.ROOT_DRIVE_FOLDER_ID!

                if (dispatch.cliente) {
                  const clientUpper = dispatch.cliente.trim().toUpperCase()
                  const { data: clientRecord } = await supabaseAdmin
                    .from('clients')
                    .select('id, drive_folder_id, drive_folder_dispatches_id')
                    .eq('name', clientUpper)
                    .maybeSingle()
                  
                  if (clientRecord) {
                    let despFolderId = clientRecord.drive_folder_dispatches_id
                    if (!despFolderId && clientRecord.drive_folder_id) {
                      const subFolder = await createFolder('Despachos', clientRecord.drive_folder_id)
                      despFolderId = subFolder.id || null
                      if (despFolderId) {
                        await supabaseAdmin.from('clients').update({ drive_folder_dispatches_id: despFolderId }).eq('id', clientRecord.id)
                      }
                    }
                    if (despFolderId) {
                      targetParentFolderId = despFolderId
                    } else if (clientRecord.drive_folder_id) {
                      targetParentFolderId = clientRecord.drive_folder_id
                    }
                  }
                }

                const folderName = `${dispatch.codigo} - DESPACHO${dispatch.cliente ? ` - ${dispatch.cliente}` : ''}`
                const driveFolder = await createFolder(folderName, targetParentFolderId)
                driveFolderId = driveFolder.id || null

                if (driveFolderId) {
                  await supabaseAdmin.from('dispatches').update({
                    drive_folder_id: driveFolderId,
                    drive_folder_url: driveFolder.url || null
                  }).eq('id', dispatch.id)
                }
              } catch (driveErr: any) {
                console.error(`[LAZY-DRIVE] Error estructurando carpeta de Despacho:`, driveErr.message)
              }
            }
            targetFolderId = driveFolderId
          }
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
      } catch (e: any) {
        console.error(`[DRIVE-SYNC-ERROR] Error con documento ID ${doc.id} (${doc.original_file_name || 'Sin nombre'}):`, e.message || e)
        results.failed++
      }
    }

    return NextResponse.json({ data: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
