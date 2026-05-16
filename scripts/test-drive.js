const { google } = require('googleapis')

const SCOPES = ['https://www.googleapis.com/auth/drive.file']

async function testDrive() {
  try {
    console.log('Iniciando prueba de conexión con Google Drive...')
    
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID

    console.log('- Email de servicio configurado:', clientEmail)
    console.log('- ID de carpeta raíz:', rootFolderId)

    if (!clientEmail || !privateKey || !rootFolderId) {
      throw new Error('Faltan variables de entorno.')
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: SCOPES,
    })

    const drive = google.drive({ version: 'v3', auth })

    console.log('Creando carpeta de prueba...')
    const fileMetadata = {
      name: 'Carpeta de Prueba - Conexión Exitosa',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink',
    })

    console.log('✅ ¡ÉXITO! Conexión a Google Drive funcionando correctamente.')
    console.log('ID de la carpeta creada:', folder.data.id)
    console.log('URL para verla:', folder.data.webViewLink)

  } catch (error) {
    console.error('❌ ERROR de conexión a Google Drive:')
    console.error(error.message || error)
  }
}

testDrive()
