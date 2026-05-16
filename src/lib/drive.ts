import { google } from 'googleapis'
import { supabaseAdmin } from './supabase-admin'
import { Readable } from 'stream'

export async function getDriveClient() {
  const { data: settings, error } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', 'google_drive_tokens')
    .single()

  if (error || !settings || !settings.value) {
    throw new Error('La sincronización de Google Drive no está configurada o no se encontraron los tokens.')
  }

  const tokens = settings.value as any

  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error('Los tokens de Google Drive son inválidos.')
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  auth.setCredentials(tokens)

  auth.on('tokens', async (newTokens) => {
    const updatedTokens = {
      ...tokens,
      ...newTokens
    }
    await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'google_drive_tokens',
        value: updatedTokens,
        updated_at: new Date().toISOString()
      })
  })

  return google.drive({ version: 'v3', auth })
}

export async function createFolder(name: string, parentId?: string) {
  const drive = await getDriveClient()
  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, webViewLink',
  })

  return {
    id: file.data.id,
    url: file.data.webViewLink,
  }
}

export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentId: string
) {
  const drive = await getDriveClient()
  
  const fileMetadata = {
    name: fileName,
    parents: [parentId],
  }

  const media = {
    mimeType,
    body: Readable.from(buffer),
  }

  console.log(`Subiendo archivo a Drive: ${fileName} en carpeta ${parentId}...`)

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
    supportsAllDrives: true, 
  })

  console.log(`Archivo subido con éxito a Drive. ID: ${file.data.id}`)

  return {
    id: file.data.id,
    url: file.data.webViewLink,
  }
}
