import { supabaseAdmin } from './supabase-admin'
import { driveFileExists } from './drive'

// ─────────────────────────────────────────────────────────────────────────────
// LIMPIEZA DE ALMACENAMIENTO — REGLA DE ORO: NO PERDER NINGÚN DOCUMENTO
//
// Modelo: Google Drive es el archivo PERMANENTE. Supabase Storage es la copia
// operativa (rápida, la que ve la app). Cuando Supabase se acerca al límite del
// plan, se libera espacio quitando de Supabase copias que YA están confirmadas
// en Drive. El documento sigue existiendo: la app lo marca "Archivado en Drive".
//
// Tres candados que antes NO existían:
//   1. Se descuenta el tamaño REAL de cada archivo liberado. La versión anterior
//      nunca actualizaba el contador, así que al cruzar el umbral el bucle no
//      paraba jamás y purgaba TODAS las copias de Supabase de una sola pasada.
//   2. Antes de borrar una copia se comprueba contra la API de Google que el
//      archivo existe en Drive y no está en la papelera. Si no se puede
//      verificar, no se borra.
//   3. Modo simulación (dryRun): calcula y reporta qué haría, sin tocar nada.
//      Es el modo por defecto de la interfaz de administración.
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLD_MB = 50000  // 50 GB: a partir de aquí empieza a liberar espacio
const TARGET_MB = 40000     // 40 GB: libera hasta bajar a este nivel

const TABLES = ['lot_documents', 'dispatch_documents', 'temperature_documents'] as const

interface PurgableDocument {
  id: string
  table: string
  storage_path: string
  drive_file_id: string
  original_file_name: string | null
  created_at: string
  size_bytes: number
}

export interface CleanupResult {
  success: boolean
  dryRun: boolean
  message: string
  currentSizeMB?: number
  thresholdMB?: number
  targetMB?: number
  candidates?: number
  purgedCount?: number
  freedMB?: number
  skipped?: { name: string; reason: string }[]
  error?: string
}

export async function cleanupStorage(options: { dryRun?: boolean } = {}): Promise<CleanupResult> {
  const dryRun = options.dryRun !== false // por defecto SIMULA: hay que pedir explícitamente el borrado
  console.log(`[Cleanup] Iniciando revisión de almacenamiento (${dryRun ? 'SIMULACIÓN' : 'BORRADO REAL'})...`)

  try {
    // 1. Tamaño total actual del bucket
    const { data: sizeStats, error: sqlError } = await supabaseAdmin.rpc('get_storage_usage_mb')

    if (sqlError || sizeStats === null || sizeStats === undefined) {
      return {
        success: false,
        dryRun,
        message: 'No se pudo medir el almacenamiento: falta la función get_storage_usage_mb en la base de datos.',
        error: sqlError?.message,
      }
    }

    const currentSizeMB = Number(sizeStats)
    console.log(`[Cleanup] Tamaño actual: ${currentSizeMB.toFixed(2)} MB. Umbral: ${THRESHOLD_MB} MB.`)

    if (currentSizeMB < THRESHOLD_MB) {
      return {
        success: true,
        dryRun,
        message: `Almacenamiento dentro de límites (${currentSizeMB.toFixed(0)} MB de ${THRESHOLD_MB} MB). No hay nada que liberar.`,
        currentSizeMB,
        thresholdMB: THRESHOLD_MB,
        targetMB: TARGET_MB,
        candidates: 0,
        purgedCount: 0,
        freedMB: 0,
      }
    }

    // 2. Candidatos: documentos vivos, con copia en Supabase Y confirmados en Drive
    let candidates: Omit<PurgableDocument, 'size_bytes'>[] = []

    for (const table of TABLES) {
      const { data } = await supabaseAdmin
        .from(table)
        .select('id, storage_path, drive_file_id, original_file_name, created_at')
        .not('storage_path', 'is', null)
        .not('drive_file_id', 'is', null)
        .is('deleted_at', null)

      if (data) {
        candidates = candidates.concat(data.map(d => ({ ...(d as any), table })))
      }
    }

    // Más antiguos primero: son los que menos se consultan.
    candidates.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 3. Tamaño real de cada candidato (en bloques, para no armar consultas gigantes)
    const sizeByPath = new Map<string, number>()
    for (let i = 0; i < candidates.length; i += 500) {
      const paths = candidates.slice(i, i + 500).map(c => c.storage_path)
      const { data: sizes } = await supabaseAdmin.rpc('get_object_sizes', { paths })
      for (const row of (sizes || []) as { path: string; size_bytes: number }[]) {
        sizeByPath.set(row.path, Number(row.size_bytes) || 0)
      }
    }

    const docs: PurgableDocument[] = candidates.map(c => ({
      ...c,
      size_bytes: sizeByPath.get(c.storage_path) ?? 0,
    }))

    // 4. Liberar espacio hasta bajar del objetivo, descontando lo que se libera
    let remainingMB = currentSizeMB
    let purgedCount = 0
    let freedMB = 0
    const skipped: { name: string; reason: string }[] = []

    for (const doc of docs) {
      if (remainingMB <= TARGET_MB) break

      const name = doc.original_file_name || doc.storage_path
      const sizeMB = doc.size_bytes / (1024 * 1024)

      // Candado 2: la copia permanente de Drive debe existir y no estar en papelera.
      let existsInDrive: boolean
      try {
        existsInDrive = await driveFileExists(doc.drive_file_id)
      } catch (e: any) {
        skipped.push({ name, reason: `No se pudo verificar en Drive (${e.message}). No se toca.` })
        continue
      }

      if (!existsInDrive) {
        skipped.push({ name, reason: 'La copia en Google Drive no existe o está en la papelera. No se toca.' })
        continue
      }

      if (dryRun) {
        purgedCount++
        freedMB += sizeMB
        remainingMB -= sizeMB
        continue
      }

      const { error: delError } = await supabaseAdmin.storage
        .from('documentos')
        .remove([doc.storage_path])

      if (delError) {
        skipped.push({ name, reason: `Error al liberar la copia: ${delError.message}` })
        continue
      }

      // El documento NO se borra: queda marcado como archivado en Drive.
      await supabaseAdmin
        .from(doc.table)
        .update({ storage_path: null, storage_url: null })
        .eq('id', doc.id)

      purgedCount++
      freedMB += sizeMB
      remainingMB -= sizeMB
    }

    // 5. Limpieza de auditoría (nunca toca documentos)
    let auditMessage = ''
    if (!dryRun) {
      const { count: auditCount } = await supabaseAdmin
        .from('audit_log')
        .select('*', { count: 'exact', head: true })

      if (auditCount && auditCount > 999) {
        const { error: auditError } = await supabaseAdmin.rpc('cleanup_old_audit_logs', { max_logs: 999 })
        auditMessage = auditError
          ? ` Aviso: no se pudo limpiar la auditoría (${auditError.message}).`
          : ' Auditoría recortada a los 999 registros más recientes.'
      }
    }

    const verbo = dryRun ? 'Se liberarían' : 'Se liberaron'
    return {
      success: true,
      dryRun,
      message:
        `${verbo} ${purgedCount} copias de Supabase (${freedMB.toFixed(0)} MB). ` +
        `Los documentos siguen completos en Google Drive.` +
        (skipped.length > 0 ? ` ${skipped.length} se omitieron por seguridad.` : '') +
        auditMessage,
      currentSizeMB,
      thresholdMB: THRESHOLD_MB,
      targetMB: TARGET_MB,
      candidates: docs.length,
      purgedCount,
      freedMB: Number(freedMB.toFixed(2)),
      skipped: skipped.slice(0, 50),
    }
  } catch (error: any) {
    console.error('[Cleanup] Error crítico:', error)
    return { success: false, dryRun, message: 'Error durante la revisión de almacenamiento.', error: error.message }
  }
}
