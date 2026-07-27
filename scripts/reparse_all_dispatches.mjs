import { parsePacklistPdf } from '../src/lib/packlist-parser.ts'

const url = 'https://hbejiluvefmmyyuamlgs.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZWppbHV2ZWZtbXl5dWFtbGdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg4NzYxMiwiZXhwIjoyMDk0NDYzNjEyfQ.jNPqR4pItC42nPL-qBby6aqIH-uAkhjwiPebxflbR04'

async function main() {
  console.log('=== RE-PARSING TODOS LOS PACKLISTS ===')

  // Obtener todos los documentos packlist
  const docsRes = await fetch(`${url}/rest/v1/dispatch_documents?document_type=eq.pack_list`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  const docs = await docsRes.json()
  console.log(`Encontrados ${docs.length} documentos packlist en total.`)

  for (const doc of docs) {
    if (!doc.storage_url) continue
    console.log(`\nProcesando Despacho ID: ${doc.dispatch_id} (${doc.original_file_name})...`)

    const fileRes = await fetch(doc.storage_url)
    if (!fileRes.ok) {
      console.error(`  - No se pudo descargar PDF: ${fileRes.statusText}`)
      continue
    }

    const arrayBuffer = await fileRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parseResult = await parsePacklistPdf(buffer)
    if (!parseResult.success) {
      console.error(`  - Error al parsear PDF: ${parseResult.error}`)
      continue
    }

    console.log(`  - Exito: ${parseResult.totalCajas} cajas totales en ${parseResult.items.length} grupos de embalaje/calibre.`)

    // Eliminar previos
    await fetch(`${url}/rest/v1/dispatch_packlist_items?dispatch_id=eq.${doc.dispatch_id}`, {
      method: 'DELETE',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    })

    // Insertar nuevos items
    const rowsToInsert = parseResult.items.map(item => ({
      dispatch_id: doc.dispatch_id,
      especie: item.especie,
      variedad: item.variedad,
      envase: item.envase,
      calibre: item.calibre,
      cajas: item.cajas,
      peso_neto_unitario: item.peso_neto_unitario,
      peso_neto_total: item.peso_neto_total
    }))

    const insertRes = await fetch(`${url}/rest/v1/dispatch_packlist_items`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rowsToInsert)
    })
    console.log(`  - Re-guardados en dispatch_packlist_items: status ${insertRes.status}`)
  }

  console.log('\n=== RE-PARSING FINALIZADO COMPLETAMENTE ===')
}

main().catch(console.error)
