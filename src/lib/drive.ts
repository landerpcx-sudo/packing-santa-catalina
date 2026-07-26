import { google } from 'googleapis'
import { supabaseAdmin } from './supabase-admin'
import { Readable } from 'stream'

// Caché en memoria del cliente de Drive: evita un viaje a Supabase por los
// tokens en cada operación (crear un lote hace 5+ operaciones de Drive).
// El cliente OAuth2 refresca el access_token por sí solo usando el
// refresh_token, así que reutilizarlo es seguro dentro del TTL.
let cachedDrive: { client: ReturnType<typeof google.drive>; fetchedAt: number } | null = null
const DRIVE_CLIENT_TTL_MS = 10 * 60 * 1000

export function invalidateDriveClientCache() {
  cachedDrive = null
}

export async function getDriveClient() {
  if (cachedDrive && Date.now() - cachedDrive.fetchedAt < DRIVE_CLIENT_TTL_MS) {
    return cachedDrive.client
  }

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

  const client = google.drive({ version: 'v3', auth })
  cachedDrive = { client, fetchedAt: Date.now() }
  return client
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
    supportsAllDrives: true,
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

export async function trashFolder(folderId: string) {
  try {
    const drive = await getDriveClient()
    await drive.files.update({
      fileId: folderId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    })
    console.log(`Carpeta/Archivo enviado a la papelera en Drive. ID: ${folderId}`)
  } catch (err: any) {
    console.error(`Error al mover a papelera en Drive: ${err.message}`)
    throw err
  }
}

export async function moveFolderOrFile(fileId: string, newParentId: string) {
  try {
    const drive = await getDriveClient()
    
    // 1. Obtener los padres actuales del archivo/carpeta
    const file = await drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true
    })
    
    const previousParents = file.data.parents?.join(',') || ''
    
    console.log(`Moviendo ID de Drive: ${fileId} de padre(s): [${previousParents}] a nuevo padre: ${newParentId}...`)
    
    // 2. Actualizar padres (añadir nuevo, remover anteriores)
    const updated = await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents || undefined,
      fields: 'id, parents',
      supportsAllDrives: true
    })
    
    console.log(`Movido con éxito en Drive. ID: ${fileId}`)
    return updated.data
  } catch (err: any) {
    console.error(`Error al mover carpeta/archivo en Drive: ${err.message}`)
    throw err
  }
}

// Comprueba que un archivo existe realmente en Drive y NO está en la papelera.
// Es el candado previo a liberar la copia de Supabase: si esto devuelve false,
// esa copia es la única que queda y no se toca.
// Lanza si no se puede consultar (token caído, red): quien llama debe tratar la
// duda como "no borrar".
export async function driveFileExists(fileId: string): Promise<boolean> {
  const drive = await getDriveClient()
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, trashed',
      supportsAllDrives: true,
    })
    return Boolean(res.data.id) && res.data.trashed !== true
  } catch (err: any) {
    const status = err?.code ?? err?.response?.status
    // 404 / 410: el archivo ya no está en Drive. Es una respuesta válida, no un fallo.
    if (status === 404 || status === 410) return false
    throw err
  }
}

export async function getDriveFileStream(fileId: string) {
  const drive = await getDriveClient()
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  )
  return res.data as Readable
}

