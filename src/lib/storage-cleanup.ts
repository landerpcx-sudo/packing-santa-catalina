import { supabaseAdmin } from './supabase-admin'

interface PurgableDocument {
  id: string;
  table: string;
  storage_path: string;
  created_at: string;
}

export async function cleanupStorage() {
  console.log('[Cleanup] Iniciando revisión de almacenamiento...')
  
  // Plan Supabase Pro (Plus): 100 GB incluidos. Google Drive es la base
  // permanente; Supabase es respaldo/staging. Solo se purga lo que YA está
  // confirmado en Drive y solo al acercarse al límite del plan.
  const THRESHOLD_MB = 50000  // 50 GB: a partir de aquí empieza a purgar
  const TARGET_MB = 40000     // 40 GB: purga hasta bajar a este nivel
  
  try {
    // 1. Obtener tamaño total actual desde storage.objects (vía RPC o consulta directa si es posible)
    // Nota: Usamos rpc si está disponible, o calculamos manualmente.
    // Para simplificar, listaremos los objetos del bucket.
    
    const { data: objects, error: storageErr } = await supabaseAdmin
      .storage
      .from('documentos')
      .list('', { limit: 1000 }) // Esto es limitado si hay subcarpetas.
    
    // Mejor estrategia: Consultar nuestra propia DB para ver qué archivos tenemos "vivos" en Supabase
    const tables = ['lot_documents', 'dispatch_documents', 'temperature_documents']
    let allDocs: PurgableDocument[] = []
    
    for (const table of tables) {
      const { data } = await supabaseAdmin
        .from(table)
        .select('id, storage_path, created_at')
        .not('storage_path', 'is', null)
        .not('drive_file_id', 'is', null) // Solo los que ya están en Drive
      
      if (data) {
        allDocs = [...allDocs, ...data.map(d => ({ ...d, table }))]
      }
    }
    
    // Ordenar por antigüedad (más antiguos primero)
    allDocs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    
    // 2. Obtener metadatos de tamaño de esos archivos
    // Como no tenemos el tamaño en nuestra DB, tenemos que confiar en el total del bucket
    // Ejecutamos un pequeño truco: sumamos los tamaños de storage.objects via SQL
    const { data: sizeStats, error: sqlError } = await supabaseAdmin.rpc('get_storage_usage_mb')
    
    let currentSizeMB = 0
    if (sqlError || !sizeStats) {
       // Si el RPC falla, calculamos un estimado o usamos un valor conservador
       console.warn('[Cleanup] No se pudo obtener el tamaño exacto via RPC. Usando conteo manual.')
       // (Aquí podríamos listar recursivamente, pero es costoso)
       return { success: false, message: 'RPC get_storage_usage_mb no encontrado' }
    } else {
       currentSizeMB = sizeStats
    }

    console.log(`[Cleanup] Tamaño actual: ${currentSizeMB.toFixed(2)} MB. Umbral: ${THRESHOLD_MB} MB.`)

    if (currentSizeMB < THRESHOLD_MB) {
      return { success: true, message: 'Almacenamiento dentro de límites', currentSizeMB }
    }

    // 3. Empezar purga
    console.log(`[Cleanup] Superado el umbral. Purgando archivos antiguos...`)
    let purgedCount = 0
    let savedSpaceMB = 0

    for (const doc of allDocs) {
      if (currentSizeMB <= TARGET_MB) break

      // Eliminar de Supabase Storage
      const { error: delError } = await supabaseAdmin.storage
        .from('documentos')
        .remove([doc.storage_path])

      if (!delError) {
        // Actualizar nuestra DB: marcar como archivado
        await supabaseAdmin
          .from(doc.table)
          .update({ 
            storage_path: null, 
            storage_url: null 
          })
          .eq('id', doc.id)

        purgedCount++
        // Nota: No sabemos el tamaño exacto de cada archivo sin una consulta extra, 
        // pero asumimos una reducción promedio o re-consultamos al final.
      }
    }

    // 4. Limpieza de Auditoría (Máximo 999 registros)
    const { count: auditCount } = await supabaseAdmin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })

    let auditMessage = 'Auditoría dentro de límites'
    if (auditCount && auditCount > 999) {
      console.log(`[Cleanup] Limpiando auditoría (${auditCount} registros)...`)
      // Borrar registros antiguos (mantener los últimos 999)
      const { error: auditError } = await supabaseAdmin.rpc('cleanup_old_audit_logs', { max_logs: 999 })
      if (!auditError) {
        auditMessage = `Limpieza de auditoría completada. Manteniendo 999 registros.`
      } else {
        console.error('[Cleanup] Error en limpieza de auditoría:', auditError)
      }
    }

    return { 
      success: true, 
      message: `Limpieza de archivos: ${purgedCount} purgados. ${auditMessage}`,
      currentSizeMB,
      auditCount
    }

  } catch (error: any) {
    console.error('[Cleanup] Error crítico:', error)
    return { success: false, error: error.message }
  }
}
