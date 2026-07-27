import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')

const url = 'https://hbejiluvefmmyyuamlgs.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZWppbHV2ZWZtbXl5dWFtbGdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg4NzYxMiwiZXhwIjoyMDk0NDYzNjEyfQ.jNPqR4pItC42nPL-qBby6aqIH-uAkhjwiPebxflbR04'

function cleanEnvase(raw) {
  if (!raw) return 'ESTÁNDAR'
  let s = raw.replace(/\r?\n/g, ' ').replace(/\t+/g, ' ').trim()
  s = s.replace(/^.*TOTAL\s*/i, '').trim()
  s = s.replace(/^[a-z0-9\s]*\b(TOTAL|EUREKA|ST|PATAGONIA)\b/i, '').trim()
  return s.toUpperCase() || 'ESTÁNDAR'
}

function cleanVariedad(raw) {
  if (!raw) return 'EUREKA'
  let s = raw.replace(/\r?\n/g, ' ').replace(/\t+/g, ' ').trim()
  s = s.replace(/^.*TOTAL\s*/i, '').trim()
  s = s.replace(/^a\s+[\d\s]+\s*/i, '').trim()
  return s.toUpperCase() || 'EUREKA'
}

function parseBlocksFromText(fullText) {
  const lines = fullText.split(/\r?\n/)
  const blocks = []
  let currentBlock = []

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

  const items = []
  // Calibre numerico 2-3 digitos o código PC
  const palletLineRegex = /(\d{2,3}|PC)\s+(?:S\s+)?(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(EUREKA|ROYAL GALA|BROOKFIELD|CRIPPS PINK|FUJI|GRANNY|ST|PATAGONIA|NECTARINE|PEAR|APPLE)\s+(LIMONES?|MANZANAS?|PERAS?|CEREZAS?|NECTARINES?|FRUTA)\s+(\d+[,.]?\d*)/gim

  for (const block of blocks) {
    let match
    while ((match = palletLineRegex.exec(block)) !== null) {
      const calibre = match[1].trim().toUpperCase()
      const cajas = parseInt(match[2], 10)
      const envase = cleanEnvase(match[4])
      const variedad = cleanVariedad(match[5]) || 'EUREKA'
      const especie = match[6].trim().toUpperCase() || 'LIMONES'
      const peso = parseFloat(match[7].replace(',', '.'))

      if (calibre && !isNaN(cajas) && cajas > 0 && cajas <= 1000) {
        items.push({ calibre, cajas, envase, variedad, especie, peso })
      }
    }
  }

  return items
}

async function testPdf(doc) {
  const fileRes = await fetch(doc.storage_url)
  const arrayBuffer = await fileRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer), verbosity: 0 })
  await parser.load()
  const parsedData = await parser.getText()
  const fullText = (parsedData.pages || []).map(p => p.text).join('\n')

  const totalMatch = fullText.match(/TOTAL\s+DESPACHO\s*:\s*([\d.]+)\s*CAJAS/i) 
    || fullText.match(/Total\s+Despacho\s+([\d.]+)/i)
    || fullText.match(/Total\s+General\s+([\d.]+)/i)
  const expectedTotal = totalMatch ? parseInt(totalMatch[1].replace(/\./g, ''), 10) : null

  const items = parseBlocksFromText(fullText)
  const totalParsed = items.reduce((a, b) => a + b.cajas, 0)
  const ok = expectedTotal === null || totalParsed === expectedTotal

  console.log(`[${doc.original_file_name}] Expected: ${expectedTotal} | Parsed: ${totalParsed} | Items: ${items.length} | OK: ${ok ? 'YES' : 'NO'}`)
}

async function main() {
  const docsRes = await fetch(`${url}/rest/v1/dispatch_documents?document_type=eq.pack_list`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  const docs = await docsRes.json()
  console.log(`=== PROBANDO ${docs.length} PACKLISTS CON CALIBRES (\\d{2,3}|PC) ===`)

  for (const doc of docs) {
    await testPdf(doc)
  }
}

main().catch(console.error)
