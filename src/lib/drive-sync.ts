import { supabaseAdmin } from './supabase-admin'
import { uploadFile, createFolder, invalidateDriveClientCache } from './drive'

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

export interface SyncError {
  id: string
  name: string
  reason: string
}

export interface SyncResult {
  success: number
  failed: number
  errors: SyncError[]
}

// Extrae el código/mensaje útil de un error de la API de Google/red.
function errInfo(e: any): { status?: number; reason?: string; message: string } {
  const status = e?.code ?? e?.response?.status
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason
  const message = e?.response?.data?.error?.message ?? e?.message ?? String(e)
  return { status: typeof status === 'number' ? status : undefined, reason, message }
}

// El error indica que el token/credenciales de Google ya no sirven y hay que
// reconectar. NO tiene sentido reintentar: invalidamos la caché del cliente.
function isAuthError(e: any): boolean {
  const { status, message } = errInfo(e)
  const m = (message || '').toLowerCase()
  return (
    status === 401 ||
    m.includes('invalid_grant') ||
    m.includes('invalid_credentials') ||
    m.includes('invalid credentials') ||
    m.includes('no está configurada') ||
    m.includes('tokens de google drive son inválidos')
  )
}

// El error es transitorio (límite de tasa, corte de red, error 5xx de Google):
// reintentar con backoff suele resolverlo.
function isRetryable(e: any): boolean {
  const { status, reason, message } = errInfo(e)
  if (status === 429) return true
  if (typeof status === 'number' && status >= 500) return true
  const r = (reason || '').toLowerCase()
  if (r.includes('ratelimitexceeded') || r.includes('userratelimitexceeded') || r.includes('quotaexceeded') || r.includes('backenderror') || r.includes('internalerror')) return true
  // 403 de Drive puede ser límite de tasa (reintenta) o permiso (no reintenta).
  if (status === 403 && (r.includes('ratelimit') || r.includes('quota'))) return true
  const m = (message || '').toLowerCase()
  return m.includes('econnreset') || m.includes('etimedout') || m.includes('socket hang up') || m.includes('network') || m.includes('rate limit')
}

// Sube un buffer a Drive con reintentos y backoff exponencial con jitter.
// Reintenta solo errores transitorios; ante un error de autenticación invalida
// la caché del cliente y aborta (reintentar no ayuda hasta reconectar Google).
async function uploadWithRetry(
  buffer: Buffer,
  name: string,
  mime: string,
  folderId: string,
  maxAttempts = 5,
): Promise<{ id: string | null | undefined; url: string | null | undefined }> {
  let lastErr: any
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadFile(buffer, name, mime, folderId)
    } catch (e: any) {
      lastErr = e
      const { message } = errInfo(e)
      console.error(`[DRIVE-SYNC] Intento ${attempt}/${maxAttempts} falló para "${name}": ${message}`)
      if (isAuthError(e)) {
        invalidateDriveClientCache()
        throw e
      }
      if (attempt < maxAttempts && isRetryable(e)) {
        // Backoff exponencial: ~0.8s, 1.6s, 3.2s, 6.4s + jitter aleatorio.
        const base = 800 * Math.pow(2, attempt - 1)
        const jitter = Math.floor(Math.random() * 400)
        await new Promise(r => setTimeout(r, base + jitter))
      } else if (!isRetryable(e)) {
        // Error no transitorio (p. ej. permiso denegado): no insistir.
        throw e
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
      const { data: updatedDispatch } = await supabaseAdmin.from('dispatches').update({
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolder.url || null,
      }).eq('id', dispatch.id).select().single()
      
      if (updatedDispatch) {
        dispatch.drive_folder_id = updatedDispatch.drive_folder_id
        dispatch.drive_folder_url = updatedDispatch.drive_folder_url
      }
    }
  }

  const isFinancial = [
    'guia_despacho',
    'proforma',
    'factura',
    'abonos_adelantos',
    'pagos_liquidaciones'
  ].includes(doc.document_type)

  if (isFinancial && driveFolderId) {
    let driveFolderFinanceId = dispatch.drive_folder_finance_id
    if (!driveFolderFinanceId) {
      try {
        console.log(`[DRIVE-SYNC] Creando subcarpeta Finanzas para Despacho ${dispatch.internal_code}...`)
        const financeFolder = await createFolder('Finanzas', driveFolderId)
        driveFolderFinanceId = financeFolder.id || null
        if (driveFolderFinanceId) {
          await supabaseAdmin.from('dispatches').update({
            drive_folder_finance_id: driveFolderFinanceId
          }).eq('id', dispatch.id)
        }
      } catch (err: any) {
        console.warn(`[DRIVE-SYNC] No se pudo crear subcarpeta Finanzas: ${err.message}`)
      }
    }
    return driveFolderFinanceId || driveFolderId
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
): Promise<SyncResult> {
  let query = supabaseAdmin.from(table).select('*').is('drive_file_id', null)
  if (docId) query = query.eq('id', docId)

  const { data: docs, error } = await query
  if (error) throw new Error(error.message)
  if (!docs || docs.length === 0) return { success: 0, failed: 0, errors: [] }

  const results: SyncResult = { success: 0, failed: 0, errors: [] }

  // Registra un fallo con su razón concreta para poder diagnosticarlo en la UI.
  const fail = (doc: any, reason: string) => {
    results.failed++
    results.errors.push({ id: doc.id, name: doc.original_file_name || 'Sin nombre', reason })
    console.error(`[DRIVE-SYNC] Falló documento ${doc.id} (${doc.original_file_name || 'sin nombre'}): ${reason}`)
  }

  for (const doc of docs) {
    try {
      if (!doc.storage_path) {
        fail(doc, 'El documento no tiene archivo guardado en Supabase Storage (storage_path vacío).')
        continue
      }

      const { data: fileData, error: dlError } = await supabaseAdmin.storage.from('documentos').download(doc.storage_path)
      if (dlError || !fileData) {
        fail(doc, `No se encontró el archivo en Supabase Storage: ${doc.storage_path}${dlError ? ` (${dlError.message})` : ''}`)
        continue
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())

      let targetFolderId: string | null = null
      if (table === 'lot_documents') targetFolderId = await resolveLotFolder(doc)
      else if (table === 'dispatch_documents') targetFolderId = await resolveDispatchFolder(doc)
      else targetFolderId = await resolveTemperatureFolder(doc)

      if (!targetFolderId) {
        fail(doc, 'No se pudo determinar/crear la carpeta de destino en Drive (registro padre sin carpeta, o reporte sin fruta/ambiente).')
        continue
      }

      const driveFile = await uploadWithRetry(buffer, driveFileName(table, doc), fileData.type, targetFolderId)
      if (driveFile?.id) {
        await supabaseAdmin.from(table).update({
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.url,
        }).eq('id', doc.id)
        results.success++
      } else {
        fail(doc, 'Google Drive no devolvió un ID de archivo tras la subida.')
      }
    } catch (e: any) {
      const { status, reason, message } = errInfo(e)
      const detail = [message, reason && `motivo: ${reason}`, status && `HTTP ${status}`].filter(Boolean).join(' · ')
      fail(doc, isAuthError(e) ? `Token de Google inválido/expirado — reconecta Google Drive. (${detail})` : detail)
    }
  }

  return results
}

// Sincroniza las tres tablas. Usado por el cron automático.
export async function syncAllPendingToDrive(): Promise<Record<SyncTable, SyncResult>> {
  const tables: SyncTable[] = ['lot_documents', 'dispatch_documents', 'temperature_documents']
  const out = {} as Record<SyncTable, SyncResult>
  for (const table of tables) {
    try {
      out[table] = await syncDocsToDrive({ table })
    } catch (e: any) {
      console.error(`[DRIVE-SYNC] Error sincronizando tabla ${table}: ${e.message}`)
      out[table] = { success: 0, failed: -1, errors: [{ id: '', name: table, reason: e.message }] }
    }
  }
  return out
}
