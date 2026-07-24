export interface ParsedPacklistItem {
  especie: string | null
  variedad: string | null
  envase: string
  calibre: string
  cajas: number
  peso_neto_unitario: number | null
  peso_neto_total: number | null
}

export interface PacklistParseResult {
  success: boolean
  especie: string | null
  variedad: string | null
  totalCajas: number
  items: ParsedPacklistItem[]
  rawText?: string
  error?: string
}

/**
 * Consolida y agrupa un arreglo de ítems por la combinación única de (envase, calibre).
 * Suma las cajas totales de los ítems con el mismo embalaje y calibre.
 */
export function groupPacklistItems(items: ParsedPacklistItem[]): ParsedPacklistItem[] {
  const map = new Map<string, ParsedPacklistItem>()

  for (const item of items) {
    const envaseClean = item.envase.trim().toUpperCase()
    const calibreClean = item.calibre.trim().toUpperCase()
    const key = `${envaseClean}___${calibreClean}`

    const existing = map.get(key)
    if (existing) {
      existing.cajas += item.cajas
      if (item.peso_neto_unitario && existing.peso_neto_unitario) {
        existing.peso_neto_total = existing.cajas * existing.peso_neto_unitario
      }
    } else {
      const pesoUnitario = item.peso_neto_unitario || 15.0
      map.set(key, {
        especie: item.especie,
        variedad: item.variedad,
        envase: envaseClean,
        calibre: calibreClean,
        cajas: item.cajas,
        peso_neto_unitario: pesoUnitario,
        peso_neto_total: item.cajas * pesoUnitario
      })
    }
  }

  return Array.from(map.values())
}
