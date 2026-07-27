const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Parse .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[key] = value
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('Actualizando especies en Supabase...')

  // 1. The Growers Club -> Limones
  const { data: growers, error: err1 } = await supabase
    .from('dispatches')
    .update({ species: 'Limones' })
    .ilike('client', '%growers%')
    .select('id, internal_code, client, species')

  console.log('Growers actualizados:', growers?.length || 0, err1 || '')

  // 2. Agrocomercial -> Manzanas
  const { data: agro, error: err2 } = await supabase
    .from('dispatches')
    .update({ species: 'Manzanas' })
    .ilike('client', '%agrocomercial%')
    .select('id, internal_code, client, species')

  console.log('Agrocomercial actualizados:', agro?.length || 0, err2 || '')
}

run()
