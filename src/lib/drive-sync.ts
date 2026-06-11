import { supabaseAdmin } from './supabase-admin'
import { uploadFile, createFolder } from './drive'

// ─────────────────────────────────────────────────────────────────────────────
// Camino ÚNICO de sincronización a Google Drive.
//
// Lo usan los tres caminos del sistema, garantizando el mismo comportamiento:
//   1. Subida en segundo plano (after()) tras guardar el archivo en Supabase.
//   2. Reintento manual desde Configuración.
//   3. Cron automático (red de seguridad final).
//
// Regla de oro: el archivo SIEMPRE vive primero en Supabase Storage. Drive es
// un destino secundario; si falla, el documento queda con drive_file_id = null
// y este mismo módulo lo reintenta hasta dejarlo sincronizado.
// ─────────────────────────────────────────────────────────────────────────────

export type SyncTable = 'lot_documents' | 'dispatch_documents' | 'temperature_documents'

// Sube un buffer a Drive con reintentos y backoff incremental.
async function uploadWithRetry(
  buffer: Buffer,
  name: string,
  mime: string,
  folderId: string,
  maxAttempts = 3,
): Promise<{ id: string | null | undefined; url: string | null | undefined }> {
  let lastErr: any
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadFile(buffer, name, mime, folderId)
    } catch (e: any) {
      lastErr = e
      console.error(`[DRIVE-SYNC] Intento ${attempt}/${maxAttempts} falló para "${name}": ${e.message}`)
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 600 * attempt))
      }
    }
  }
  throw lastErr
}

// Resuelve (creando si hace falta) la subcarpeta de Drive destino de un documento de lote.
async function resolveLotFolder(doc: any): Promise<string | null> {
  const { data: lot } = await supabaseAdmin.from('lots').select('*').eq('id', doc.lot_id).single()
  if (!lot) return null

  let driveFolderId = lot.drive_folder_id
  let driveFolderReceptionId = lot.drive_folder_reception_id
  let driveFolderQualityId = lot.drive_folder_quality_id
  let driveFolderProcessId = lot.drive_folder_process_id
  let driveFolderBackupId = lot.drive_folder_backup_id

  // Si el lote no tiene carpeta en Drive, estructurarla en caliente.
  if (!driveFolderId) {
    console.log(`[DRIVE-SYNC] Creando estructura de carpetas para Lote ${lot.internal_code}...`)
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
        if (recFolderId) targetParentFolderId = recFolderId
        else if (clientRecord.drive_folder_id) targetParentFolderId = clientRecord.drive_folder_id
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

      await supabaseAdmin.from('lots').update({
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolder.url || null,
        drive_folder_reception_id: driveFolderReceptionId,
        drive_folder_quality_id: driveFolderQualityId,
        drive_folder_process_id: driveFolderProcessId,
        drive_folder_backup_id: driveFolderBackupId,
      }).eq('id', lot.id)
    }
  }

  const folderMap: Record<string, string | null> = {
    reception: driveFolderReceptionId,
    quality: driveFolderQualityId,
    process: driveFolderProcessId,
    photo_process: driveFolderProcessId,
    backup: driveFolderBackupId,
    other: driveFolderBackupId,
  }
  return folderMap[doc.document_type] || driveFolderId
}

// Resuelve (creando si hace falta) la carpeta de Drive destino de un documento de despacho.
async function resolveDispatchFolder(doc: any): Promise<string | null> {
  const { data: dispatch } = await supabaseAdmin.from('dispatches').select('*').eq('id', doc.dispatch_id).single()
  if (!dispatch) return null

  let driveFolderId = dispatch.drive_folder_id

  if (!driveFolderId) {
    console.log(`[DRIVE-SYNC] Creando carpeta para Despacho ${dispatch.internal_code}...`)
    let targetParentFolderId = process.env.ROOT_DRIVE_FOLDER_ID!

    const clientUpper = dispatch.client ? dispatch.client.trim().toUpperCase() : null
    if (clientUpper) {
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
        if (despFolderId) targetParentFolderId = despFolderId
        else if (clientRecord.drive_folder_id) targetParentFolderId = clientRecord.drive_folder_id
      }
    }

    const folderName = `${dispatch.internal_code}${clientUpper ? ` - ${clientUpper}` : ''}`
    const driveFolder = await createFolder(folderName, targetParentFolderId)
    driveFolderId = driveFolder.id || null

    if (driveFolderId) {
      await supabaseAdmin.from('dispatches').update({
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolder.url || null,
      }).eq('id', dispatch.id)
    }
  }

  return driveFolderId
}

// Resuelve (creando si hace falta) la carpeta de Drive destino de un documento de temperatura.
async function resolveTemperatureFolder(doc: any): Promise<string | null> {
  const { data: report } = await supabaseAdmin
    .from('temperature_reports')
    .select('*')
    .eq('id', doc.temperature_report_id)
    .single()
  if (!report || report.no_fruit) return null

  let driveFolderId = report.drive_folder_id

  if (!driveFolderId) {
    console.log(`[DRIVE-SYNC] Creando carpeta para Temperatura ${report.internal_code}...`)
    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    const folderName = report.is_ambient
      ? `TEMP-${report.report_date} - AMBIENTE${report.chamber ? ` - ${report.chamber}` : ''}`
      : `TEMP-${report.report_date}${report.client ? ` - ${report.client}` : ''}${report.variety ? ` - ${report.variety}` : ''}`
    const driveFolder = await createFolder(folderName, rootFolderId)
    driveFolderId = driveFolder.id || null
    if (driveFolderId) {
      await supabaseAdmin.from('temperature_reports').update({
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolder.url || null,
      }).eq('id', report.id)
    }
  }

  return driveFolderId
}

// Construye el nombre del archivo en Drive según el tipo de documento.
function driveFileName(table: SyncTable, doc: any): string {
  if (table === 'temperature_documents') {
    return doc.original_file_name
  }
  return `v${doc.version_number ?? 1}_${doc.original_file_name}`
}

// Sincroniza a Drive todos los documentos pendientes de una tabla (o uno concreto por docId).
// Devuelve el conteo de éxitos y fallos. NUNCA lanza por documento: aísla cada error.
export async function syncDocsToDrive(
  { table, docId }: { table: SyncTable; docId?: string },
): Promise<{ success: number; failed: number }> {
  let query = supabaseAdmin.from(table).select('*').is('drive_file_id', null)
  if (docId) query = query.eq('id', docId)

  const { data: docs, error } = await query
  if (error) throw new Error(error.message)
  if (!docs || docs.length === 0) return { success: 0, failed: 0 }

  const results = { success: 0, failed: 0 }

  for (const doc of docs) {
    try {
      if (!doc.storage_path) { results.failed++; continue }

      const { data: fileData } = await supabaseAdmin.storage.from('documentos').download(doc.storage_path)
      if (!fileData) { results.failed++; continue }

      const buffer = Buffer.from(await fileData.arrayBuffer())

      let targetFolderId: string | null = null
      if (table === 'lot_documents') targetFolderId = await resolveLotFolder(doc)
      else if (table === 'dispatch_documents') targetFolderId = await resolveDispatchFolder(doc)
      else targetFolderId = await resolveTemperatureFolder(doc)

      if (!targetFolderId) { results.failed++; continue }

      const driveFile = await uploadWithRetry(buffer, driveFileName(table, doc), fileData.type, targetFolderId)
      if (driveFile?.id) {
        await supabaseAdmin.from(table).update({
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.url,
        }).eq('id', doc.id)
        results.success++
      } else {
        results.failed++
      }
    } catch (e: any) {
      console.error(`[DRIVE-SYNC] Error con documento ${doc.id} (${doc.original_file_name || 'sin nombre'}): ${e.message || e}`)
      results.failed++
    }
  }

  return results
}

// Sincroniza las tres tablas. Usado por el cron automático.
export async function syncAllPendingToDrive(): Promise<Record<SyncTable, { success: number; failed: number }>> {
  const tables: SyncTable[] = ['lot_documents', 'dispatch_documents', 'temperature_documents']
  const out = {} as Record<SyncTable, { success: number; failed: number }>
  for (const table of tables) {
    try {
      out[table] = await syncDocsToDrive({ table })
    } catch (e: any) {
      console.error(`[DRIVE-SYNC] Error sincronizando tabla ${table}: ${e.message}`)
      out[table] = { success: 0, failed: -1 }
    }
  }
  return out
}
