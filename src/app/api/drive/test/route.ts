import { NextResponse } from 'next/server'
import { createFolder } from '@/lib/drive'

export async function POST(request: Request) {
  try {
    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID

    if (!rootFolderId || rootFolderId === 'ID_DE_CARPETA_PACKING_SANTA_CATALINA') {
      return NextResponse.json(
        { error: 'Falta configurar el ROOT_DRIVE_FOLDER_ID en .env.local' },
        { status: 400 }
      )
    }

    // Intentamos crear una carpeta de prueba dentro de la carpeta raíz
    const folder = await createFolder('Carpeta de Prueba - Conexión Exitosa', rootFolderId)

    return NextResponse.json({
      success: true,
      message: 'Conexión a Google Drive exitosa. Carpeta creada.',
      folder,
    })
  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
