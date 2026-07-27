const url = 'https://hbejiluvefmmyyuamlgs.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZWppbHV2ZWZtbXl5dWFtbGdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg4NzYxMiwiZXhwIjoyMDk0NDYzNjEyfQ.jNPqR4pItC42nPL-qBby6aqIH-uAkhjwiPebxflbR04'

async function updateTable(table) {
  const fetchRes = await fetch(`${url}/rest/v1/${table}?select=id,species`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  const items = await fetchRes.json()
  let count = 0
  for (const item of items) {
    if (item.species && item.species.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('limon')) {
      if (item.species !== 'Limones') {
        const updateRes = await fetch(`${url}/rest/v1/${table}?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ species: 'Limones' })
        })
        console.log(`Actualizado ${table} ID ${item.id} (anterior '${item.species}'): status ${updateRes.status}`)
        count++
      }
    }
  }
  console.log(`Total actualizados en ${table}: ${count}`)
}

async function main() {
  console.log('=== MIGRANDO ESPECIES A "Limones" ===')
  await updateTable('lots')
  await updateTable('dispatches')
  console.log('=== MIGRACIÓN FINALIZADA ===')
}

main().catch(console.error)
