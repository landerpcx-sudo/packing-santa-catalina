import { supabaseAdmin } from './supabase-admin'

// ─────────────────────────────────────────────────────────────────────────────
// PAPELERA DE DOCUMENTOS
//
// Eliminar un documento no lo destruye: lo marca con deleted_at. El archivo
// sigue guardado en Supabase Storage y en Google Drive. Durante 30 días se
// puede restaurar con un clic; pasado ese plazo, un administrador puede
// purgarlo de forma definitiva y consciente desde la papelera.
//
// Aquí vive todo lo compartido entre borrar, restaurar y purgar para que las
// tres operaciones dejen los contadores y estados coherentes.
// ─────────────────────────────────────────────────────────────────────────────

export const TABLAS_DOCUMENTOS = [
  'lot_documents',
  'dispatch_documents',
  'client_documents',
  'temperature_documents',
] as const

export type TablaDocumento = (typeof TABLAS_DOCUMENTOS)[number]

export const DIAS_EN_PAPELERA = 30

export const ETIQUETA_TABLA: Record<string, string> = {
  lot_documents: 'Lote',
  dispatch_documents: 'Despacho',
  client_documents: 'Cliente',
  temperature_documents: 'Temperatura',
}

// Recalcula contadores y estados del padre tras dar de baja un documento.
// `delta` es -1 al mandar a la papelera y +1 al restaurar.
export async function recalcularTrasBaja(table: string, doc: any, delta: -1 | 1 = -1) {
  if (table === 'dispatch_documents') {
    await recalcularDespacho(doc.dispatch_id)
  } else if (table === 'temperature_documents' && doc.document_type === 'daily_report') {
    const { data: vivos } = await supabaseAdmin
      .from('temperature_documents')
      .select('id')
      .eq('temperature_report_id', doc.temperature_report_id)
      .eq('document_type', 'daily_report')
      .is('deleted_at', null)

    await supabaseAdmin
      .from('temperature_reports')
      .update({ status: vivos && vivos.length > 0 ? 'uploaded' : 'pending' })
      .eq('id', doc.temperature_report_id)
  }
}

// Reconstruye los contadores del despacho contando los documentos VIVOS.
// Antes se sumaba/restaba a ciegas sobre el contador guardado, lo que se
// desincronizaba en cuanto algo fallaba a mitad de camino. Ahora se cuenta.
export async function recalcularDespacho(dispatchId: string) {
  if (!dispatchId) return

  const { data: dispatch } = await supabaseAdmin
    .from('dispatches')
    .select('id, expected_pallets, pack_list_status')
    .eq('id', dispatchId)
    .single()

  if (!dispatch) return

  const { data: docs } = await supabaseAdmin
    .from('dispatch_documents')
    .select('document_type, status')
    .eq('dispatch_id', dispatchId)
    .is('deleted_at', null)

  const vivos = docs || []
  const pataCount = vivos.filter(d => d.document_type === 'pata_pata_photo').length
  const thermoCount = vivos.filter(d => d.document_type === 'thermograph_photo').length
  const packLists = vivos.filter(d => d.document_type === 'pack_list')

  let packListStatus: string
  if (packLists.length === 0) packListStatus = 'pending'
  else if (packLists.some(d => d.status === 'validated')) packListStatus = 'validated'
  else packListStatus = 'uploaded'

  const minPata = Math.ceil((dispatch.expected_pallets || 0) / 2)
  const isComplete = packListStatus === 'validated' && pataCount >= minPata && thermoCount >= 2
  const hayAlgo = packListStatus !== 'pending' || pataCount > 0 || thermoCount > 0
  const hayObservados = vivos.some(d => d.status === 'observed')

  let overall: string
  if (hayObservados) overall = 'observed'
  else if (isComplete) overall = 'complete'
  else if (hayAlgo) overall = 'uploaded'
  else overall = 'pending'

  await supabaseAdmin
    .from('dispatches')
    .update({
      pata_pata_photos_count: pataCount,
      thermograph_photos_count: thermoCount,
      pack_list_status: packListStatus,
      overall_status: overall,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispatchId)
}

// Fecha límite: lo eliminado antes de este instante ya cumplió sus 30 días.
export function fechaLimitePurga(): string {
  const limite = new Date()
  limite.setDate(limite.getDate() - DIAS_EN_PAPELERA)
  return limite.toISOString()
}

export function diasRestantes(deletedAt: string): number {
  const borrado = new Date(deletedAt).getTime()
  const vence = borrado + DIAS_EN_PAPELERA * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((vence - Date.now()) / (24 * 60 * 60 * 1000)))
}
