import { supabaseAdmin } from './supabase-admin'

/**
 * Recalcula inteligentemente los estados de las etapas y el estado general de un Lote,
 * basándose en los documentos actualmente guardados en la base de datos.
 *
 * @param lotId ID único del lote a recalcular
 */
export async function recalculateLotStatus(lotId: string): Promise<{
  reception_status: string
  quality_status: string
  process_status: string
  overall_status: string
} | null> {
  try {
    // 1. Obtener todos los documentos activos (no eliminados) asociados a este lote
    const { data: docs, error } = await supabaseAdmin
      .from('lot_documents')
      .select('id, document_type, original_file_name, version_number, status')
      .eq('lot_id', lotId)
      .is('deleted_at', null)

    if (error) {
      console.error(`Error al obtener documentos del lote ${lotId} para recalcular estados:`, error)
      return null
    }

    // 2. Agrupar documentos por etapa/tipo
    const docsByStage = {
      reception: docs.filter(d => d.document_type === 'reception'),
      quality: docs.filter(d => d.document_type === 'quality'),
      process: docs.filter(d => d.document_type === 'process'),
    }

    // --- CÁLCULO PARA RECEPCIÓN Y CALIDAD (Mismo archivo renombrado con control de versiones estándar) ---
    const getStandardStageStatus = (stageDocs: typeof docs) => {
      if (stageDocs.length === 0) return 'pending'
      // Buscamos el documento con la versión más alta (el más reciente)
      const newestDoc = stageDocs.reduce((prev, current) => 
        (current.version_number > prev.version_number) ? current : prev
      )
      return newestDoc.status || 'uploaded'
    }

    const reception_status = getStandardStageStatus(docsByStage.reception)
    const quality_status = getStandardStageStatus(docsByStage.quality)

    // --- CÁLCULO PARA PROCESO (Permite múltiples informes paralelos y versiones por nombre original) ---
    let process_status = 'pending'
    if (docsByStage.process.length > 0) {
      // Agrupamos las versiones del mismo archivo original
      const processGroups: Record<string, typeof docs[0]> = {}
      for (const doc of docsByStage.process) {
        const key = doc.original_file_name
        if (!processGroups[key] || doc.version_number > processGroups[key].version_number) {
          processGroups[key] = doc
        }
      }

      const activeProcessDocs = Object.values(processGroups)
      
      if (activeProcessDocs.length === 0) {
        process_status = 'pending'
      } else {
        const statuses = activeProcessDocs.map(d => d.status)
        
        if (statuses.every(s => s === 'validated')) {
          process_status = 'validated'
        } else if (statuses.includes('observed')) {
          process_status = 'observed'
        } else {
          process_status = 'uploaded'
        }
      }
    }

    // 0. Obtener el estado actual del lote (para preservar 'closed' si fue cerrado manualmente)
    const { data: currentLot } = await supabaseAdmin
      .from('lots')
      .select('overall_status')
      .eq('id', lotId)
      .single()

    // --- CÁLCULO DEL ESTADO GENERAL (OVERALL_STATUS) ---
    const stages = [reception_status, quality_status, process_status]
    let overall_status = 'uploaded' // Por defecto si hay avances

    if (currentLot?.overall_status === 'closed') {
      overall_status = 'closed'
    } else if (stages.every(s => s === 'validated')) {
      overall_status = 'complete'
    } else if (stages.every(s => s === 'pending')) {
      overall_status = 'pending'
    } else if (stages.includes('observed')) {
      overall_status = 'observed'
    } else if (stages.includes('late')) {
      overall_status = 'late'
    } else {
      overall_status = 'uploaded'
    }

    // 3. Actualizar la tabla del lote con los nuevos estados calculados
    const { error: updateError } = await supabaseAdmin
      .from('lots')
      .update({
        reception_status,
        quality_status,
        process_status,
        overall_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lotId)

    if (updateError) {
      console.error(`Error al actualizar estados en el lote ${lotId}:`, updateError)
      return null
    }

    console.log(`Estados recalculados exitosamente para lote ${lotId}:`, {
      reception_status,
      quality_status,
      process_status,
      overall_status,
    })

    return {
      reception_status,
      quality_status,
      process_status,
      overall_status,
    }
  } catch (err) {
    console.error(`Excepción al recalcular estados del lote ${lotId}:`, err)
    return null
  }
}
