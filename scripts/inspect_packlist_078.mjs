import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')

const storageUrl = 'https://hbejiluvefmmyyuamlgs.supabase.co/storage/v1/object/public/documentos/despachos/DES-2026-078/pack_list/v1_2026-07-21T16-53-41_Packlist%20078.pdf'

async function main() {
  const res = await fetch(storageUrl)
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer), verbosity: 0 })
  await parser.load()
  const parsedData = await parser.getText()
  const fullText = (parsedData.pages || []).map(p => p.text).join('\n')

  const totalMatch = fullText.match(/TOTAL\s+DESPACHO\s*:\s*([\d.]+)\s*CAJAS/i) || fullText.match(/Total\s+Despacho\s+([\d.]+)/i)
  const expectedTotal = totalMatch ? parseInt(totalMatch[1].replace('.', ''), 10) : null
  console.log('Total oficial detectado en PDF:', expectedTotal)

  const items = []
  // Regex que matchea la línea de calibre/cajas/envase del pallet:
  // Ej: "165 72 72 LEMONS B (LE18) 17.2 EUREKA LIMONES 17,20 175554 153276"
  const lineRegex = /^\s*(\d{2,3})\s+(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(EUREKA|ROYAL GALA|BROOKFIELD|CRIPPS PINK|FUJI|GRANNY|ST|PATAGONIA|NECTARINE|PEAR|APPLE)\s+(LIMONES|MANZANAS?|PERAS?|CEREZAS?|NECTARINES?|FRUTA)\s+(\d+[,.]?\d*)/gim

  let match
  while ((match = lineRegex.exec(fullText)) !== null) {
    const calibre = match[1].trim().toUpperCase()
    const cajas = parseInt(match[2], 10)
    const envase = match[4].trim().toUpperCase()
    const variedad = match[5].trim().toUpperCase()
    const especie = match[6].trim().toUpperCase()
    const peso = parseFloat(match[7].replace(',', '.'))

    if (calibre && !isNaN(cajas) && cajas > 0) {
      items.push({ calibre, cajas, envase, variedad, especie, peso })
    }
  }

  const totalCajasLineas = items.reduce((a, b) => a + b.cajas, 0)
  console.log('Lineas encontradas:', items.length)
  console.log('Total cajas en lineas de detalle:', totalCajasLineas)
  console.log('COINCIDE EXACTAMENTE CON EL TOTAL OFICIAL:', totalCajasLineas === expectedTotal)
}

main().catch(console.error)
