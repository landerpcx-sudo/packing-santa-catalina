import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { makeAllDriveFilesPublic } from '@/lib/drive'

export const maxDuration = 120

// GET /api/admin/drive-make-public
// Asigna permisos de lectura pública (Anyone with link = reader) a todos los archivos y carpetas en Google Drive
export async function GET() {
  try {
    const headersList = await headers()
    if (headersList.get('x-user-role') !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const count = await makeAllDriveFilesPublic()

    return NextResponse.json({
      success: true,
      message: `Se asignaron permisos de lectura pública a ${count} archivos/carpetas en Google Drive.`,
      count,
    })
  } catch (err: any) {
    console.error('Error en /api/admin/drive-make-public:', err)
    return NextResponse.json({ error: err.message || 'Error al actualizar permisos en Drive' }, { status: 500 })
  }
}
