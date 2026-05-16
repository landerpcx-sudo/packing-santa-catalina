const { google } = require('googleapis')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

// Busca subcarpetas en cualquier variante de nombre (con o sin tilde)
const SUBFOLDER_PATTERNS = {
  drive_folder_reception_id: ['1. Recepcion', '1. Recepción', 'Recepcion', 'Recepción'],
  drive_folder_quality_id:   ['2. Calidad', 'Calidad'],
  drive_folder_process_id:   ['3. Proceso', 'Proceso'],
  drive_folder_photos_id:    ['4. Fotos Proceso', 'Fotos Proceso', 'Fotos'],
  drive_folder_backup_id:    ['5. Respaldos', 'Respaldos'],
}

async function main() {
  const { data: lots } = await supabase
    .from('lots')
    .select('id, internal_code, drive_folder_id, drive_folder_reception_id')
    .not('drive_folder_id', 'is', null)

  for (const lot of lots) {
    console.log(`\nProcesando: ${lot.internal_code}`)
    
    const { data } = await drive.files.list({
      q: `'${lot.drive_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    })

    const subfolders = data.files || []
    console.log('  Subcarpetas:', subfolders.map(f => f.name).join(', '))

    const update = {}
    for (const [field, patterns] of Object.entries(SUBFOLDER_PATTERNS)) {
      for (const folder of subfolders) {
        if (patterns.some(p => folder.name.includes(p.replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'})[c])) || 
            patterns.some(p => p === folder.name))) {
          update[field] = folder.id
          break
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await supabase.from('lots').update(update).eq('id', lot.id)
      console.log('  ✅ Actualizado:', Object.keys(update).join(', '))
    }
  }
  console.log('\n✅ Listo.')
}

main().catch(console.error)
