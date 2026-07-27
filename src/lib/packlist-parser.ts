import { groupPacklistItems, ParsedPacklistItem, PacklistParseResult } from './packlist-parser-types'
export * from './packlist-parser-types'

function cleanEnvase(raw: string): string {
  if (!raw) return 'ESTÁNDAR'
  let s = raw.replace(/\r?\n/g, ' ').replace(/\t+/g, ' ').trim()
  s = s.replace(/^.*TOTAL\s*/i, '').trim()
  s = s.replace(/^[a-z0-9\s]*\b(TOTAL|EUREKA|ST|PATAGONIA)\b/i, '').trim()
  return s.toUpperCase() || 'ESTÁNDAR'
}

function cleanVariedad(raw: string): string {
  if (!raw) return 'EUREKA'
  let s = raw.replace(/\r?\n/g, ' ').replace(/\t+/g, ' ').trim()
  s = s.replace(/^.*TOTAL\s*/i, '').trim()
  s = s.replace(/^a\s+[\d\s]+\s*/i, '').trim()
  return s.toUpperCase() || 'EUREKA'
}

function parsePalletBlocksFromText(fullText: string, especieGeneral: string, variedadGeneral: string): ParsedPacklistItem[] {
  const lines = fullText.split(/\r?\n/)
  const blocks: string[] = []
  let currentBlock: string[] = []

  for (const line of lines) {
    const isPalletHeader = /^\s*\d{3,5}\s+\d{2}\/\d{2}\/\d{4}/.test(line)
    if (isPalletHeader) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join(' '))
      }
      currentBlock = [line]
    } else if (currentBlock.length > 0) {
      if (/Total\b|Variedad\b|REGIÓN|PACKING LIST|Especie\b/i.test(line)) {
        blocks.push(currentBlock.join(' '))
        currentBlock = []
      } else {
        currentBlock.push(line)
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join(' '))
  }

  const items: ParsedPacklistItem[] = []
  const palletLineRegex = /(\d{2,3}|PC)\s+(?:S\s+)?(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(EUREKA|ROYAL GALA|BROOKFIELD|CRIPPS PINK|FUJI|GRANNY|ST|PATAGONIA|NECTARINE|PEAR|APPLE)\s+(LIMONES?|MANZANAS?|PERAS?|CEREZAS?|NECTARINES?|FRUTA)\s+(\d+[,.]?\d*)/gim

  for (const block of blocks) {
    let match: RegExpExecArray | null
    while ((match = palletLineRegex.exec(block)) !== null) {
      const calibre = match[1].trim().toUpperCase()
      const cajas = parseInt(match[2], 10)
      const envase = cleanEnvase(match[4])
      const variedad = cleanVariedad(match[5]) || variedadGeneral
      const especie = match[6].trim().toUpperCase() || especieGeneral
      const peso = parseFloat(match[7].replace(',', '.'))

      if (calibre && !isNaN(cajas) && cajas > 0 && cajas <= 1000) {
        items.push({
          especie,
          variedad,
          envase,
          calibre,
          cajas,
          peso_neto_unitario: peso || 15,
          peso_neto_total: cajas * (peso || 15)
        })
      }
    }
  }

  return items
}

/**
 * Parsea el buffer de un archivo PDF de Packing List y retorna los ítems agrupados por embalaje y calibre.
 */
export async function parsePacklistPdf(pdfBuffer: Buffer): Promise<PacklistParseResult> {
  try {
    const pdfParseModule = require('pdf-parse')
    const PDFParseClass = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse

    let fullText = ''

    if (typeof PDFParseClass === 'function') {
      const parser = new PDFParseClass({ data: new Uint8Array(pdfBuffer), verbosity: 0 })
      await parser.load()
      const parsedData = await parser.getText()
      fullText = (parsedData.pages || []).map((p: any) => p.text).join('\n')
    } else {
      const parseFn = pdfParseModule.default || pdfParseModule
      const data = await parseFn(pdfBuffer)
      fullText = data.text || ''
    }

    let especieGeneral = 'LIMONES'
    let variedadGeneral = 'EUREKA'

    const espMatch = fullText.match(/Especie\s*\n?\s*([A-Z\s]+)/i)
    if (espMatch) {
      const rawEsp = espMatch[1].trim().split(/\s+/)[0]
      if (rawEsp && rawEsp.length < 20) especieGeneral = rawEsp.toUpperCase()
    }

    const varMatch = fullText.match(/Variedad\s*\n?\s*([A-Z\s]+)/i)
    if (varMatch) {
      const rawVar = varMatch[1].trim().split(/\s+/)[0]
      if (rawVar && rawVar.length < 20) variedadGeneral = rawVar.toUpperCase()
    }

    // 1. Extraer Total Oficial de Cajas declarado al pie del PDF
    const totalMatch = fullText.match(/TOTAL\s+DESPACHO\s*:\s*([\d.]+)\s*CAJAS/i) 
      || fullText.match(/Total\s+Despacho\s+([\d.]+)/i)
      || fullText.match(/Total\s+General\s+([\d.]+)/i)
    const expectedTotal = totalMatch ? parseInt(totalMatch[1].replace(/\./g, ''), 10) : null

    // 2. Parsear por bloques de pallet
    let items = parsePalletBlocksFromText(fullText, especieGeneral, variedadGeneral)

    // 3. Estrategia Fallback: Si no hubo líneas de detalle de pallet, parsear tabla resumen
    if (items.length === 0) {
      const summaryHeaderMatch = fullText.match(/Variedad\s+Envase\s+Categor[íi]a\s+([A-Z0-9\s]+?)\s+TOTAL/i)
      if (summaryHeaderMatch) {
        const calibresHeader = summaryHeaderMatch[1].trim().split(/\s+/).filter(Boolean)
        const rowRegex = /(?:([A-Z0-9\s-]+?)\s+)?([A-Z0-9\s()/-]{3,40}?)\s+(EXTRA FANCY|FANCY|EXF-AAA|CAT 1|CHOICE)\s+([\d\s\t]+)/gi
        let rMatch: RegExpExecArray | null
        while ((rMatch = rowRegex.exec(fullText)) !== null) {
          const varRow = rMatch[1] ? rMatch[1].trim() : variedadGeneral
          const envase = cleanEnvase(rMatch[2])
          const numbers = rMatch[4].trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n))
          if (numbers.length >= 2) {
            const cajasCalibres = numbers.slice(0, numbers.length - 1)
            let numIdx = 0
            for (let i = 0; i < calibresHeader.length && numIdx < cajasCalibres.length; i++) {
              const cajas = cajasCalibres[numIdx]
              if (cajas > 0) {
                items.push({
                  especie: especieGeneral,
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

    const groupedItems = groupPacklistItems(items)
    const totalCajas = groupedItems.reduce((acc, curr) => acc + curr.cajas, 0)

    // Validación estricta contra el Total Oficial si fue detectado
    if (expectedTotal !== null && expectedTotal > 0 && totalCajas !== expectedTotal) {
      console.error(`Mismatch de cajas: parseadas=${totalCajas}, esperadas=${expectedTotal}`)
      return {
        success: false,
        especie: especieGeneral,
        variedad: variedadGeneral,
        totalCajas: totalCajas,
        items: groupedItems,
        error: `Error de lectura en Packlist PDF: El total parseado (${totalCajas} cajas) no coincide con el TOTAL DESPACHO oficial (${expectedTotal} cajas).`
      }
    }

    return {
      success: groupedItems.length > 0,
      especie: especieGeneral,
      variedad: variedadGeneral,
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
