import { groupPacklistItems, ParsedPacklistItem, PacklistParseResult } from './packlist-parser-types'
export * from './packlist-parser-types'

/**
 * Parsea el buffer de un archivo PDF de Packing List y retorna los ítems agrupados por embalaje y calibre.
 */
export async function parsePacklistPdf(pdfBuffer: Buffer): Promise<PacklistParseResult> {
  try {
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer), verbosity: 0 })
    await parser.load()
    const parsedData = await parser.getText()

    const fullText = (parsedData.pages || []).map((p: any) => p.text).join('\n')
    const items: ParsedPacklistItem[] = []

    let especie = 'LIMONES'
    let variedad = 'EUREKA'

    const especieMatch = fullText.match(/Especie\s+([A-Z]+)/i)
    if (especieMatch) especie = especieMatch[1].trim()

    const variedadMatch = fullText.match(/Variedad\s+([A-Z]+)/i)
    if (variedadMatch) variedad = variedadMatch[1].trim()

    // --- ESTRATEGIA 1: PARSEAR LA TABLA RESUMEN SI EXISTE ---
    const summaryHeaderMatch = fullText.match(/Variedad\s+Envase\s+Categor[íi]a\s+([\d\s]+)\s+TOTAL/i)

    if (summaryHeaderMatch) {
      const calibresHeader = summaryHeaderMatch[1].trim().split(/\s+/).filter(Boolean)
      const rowRegex = /(?:([A-Z0-9\s-]+?)\s+)?(LEMONS[^\n]+?|STANDARD[^\n]+?|BOX[^\n]+?|PERA[^\n]+?|FRUTA[^\n]+?)\s+(EXTRA FANCY|FANCY|CAT 1|CHOICE)\s+([\d\s\t]+)/gi

      let rowMatch
      while ((rowMatch = rowRegex.exec(fullText)) !== null) {
        const varRow = rowMatch[1] ? rowMatch[1].trim() : variedad
        const envase = rowMatch[2].trim()
        const numbersInRow = rowMatch[4].trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n))

        if (numbersInRow.length >= 2) {
          const cajasCalibres = numbersInRow.slice(0, numbersInRow.length - 1)

          // Si el total de números es menor que los calibres del encabezado, mapear los calibres correspondientes
          if (cajasCalibres.length === 2 && calibresHeader.includes('125') && calibresHeader.includes('150')) {
            // Caso especial LEMONS BLANCA 15KG (Calibres 125 y 150)
            items.push(
              { especie, variedad: varRow, envase, calibre: '125', cajas: cajasCalibres[0], peso_neto_unitario: 15, peso_neto_total: cajasCalibres[0] * 15 },
              { especie, variedad: varRow, envase, calibre: '150', cajas: cajasCalibres[1], peso_neto_unitario: 15, peso_neto_total: cajasCalibres[1] * 15 }
            )
          } else {
            let numIdx = 0
            for (let i = 0; i < calibresHeader.length && numIdx < cajasCalibres.length; i++) {
              const cajas = cajasCalibres[numIdx]
              if (cajas > 0) {
                items.push({
                  especie,
                  variedad: varRow,
                  envase,
                  calibre: calibresHeader[i],
                  cajas,
                  peso_neto_unitario: 15,
                  peso_neto_total: cajas * 15
                })
              }
              numIdx++
            }
          }
        }
      }
    }

    // --- ESTRATEGIA 2: SI LA TABLA RESUMEN NO SE PUDO EXTRAER COMPLETA, USAR LAS LÍNEAS DE DETALLE DE PALLETS ---
    if (items.length === 0) {
      const lines = fullText.split('\n')
      for (const line of lines) {
        const match = line.match(/(?:S\s*)?(\d{2,3})\s+(?:S\s*)?(\d{1,4})\s+(\d{1,4})\s+([A-Z0-9\s()/-]+?)\s+(EUREKA|ST|PATAGONIA|NECTARINE|PEAR|APPLE|LIMONES)\s+(LIMONES|PERAS|MANZANAS|FRUTA)?\s*(\d+[,.]?\d*)?/i)
        if (match) {
          const calibre = match[1].trim()
          const cajas = parseInt(match[2], 10)
          const envase = match[4].trim()
          const varLine = match[5].trim()
          const espLine = match[6] ? match[6].trim() : especie
          const peso = match[7] ? parseFloat(match[7].replace(',', '.')) : 15

          if (envase && calibre && !isNaN(cajas) && cajas > 0) {
            items.push({
              especie: espLine,
              variedad: varLine,
              envase,
              calibre,
              cajas,
              peso_neto_unitario: peso,
              peso_neto_total: cajas * peso
            })
          }
        }
      }
    }

    const groupedItems = groupPacklistItems(items)
    const totalCajas = groupedItems.reduce((acc, curr) => acc + curr.cajas, 0)

    return {
      success: groupedItems.length > 0,
      especie,
      variedad,
      totalCajas,
      items: groupedItems,
      rawText: fullText.substring(0, 1000)
    }
  } catch (err: any) {
    console.error('Error parseando Packlist PDF:', err)
    return {
      success: false,
      especie: null,
      variedad: null,
      totalCajas: 0,
      items: [],
      error: err?.message || 'Error desconocido al parsear el Packlist PDF'
    }
  }
}
