import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trashFolder } from '@/lib/drive'
import { TABLAS_DOCUMENTOS, DIAS_EN_PAPELERA, diasRestantes } from '@/lib/papelera'

// POST /api/documentos/papelera/purgar
// Body: { table, id, confirm: "ELIMINAR DEFINITIVAMENTE" }
//
// Único punto de toda la aplicación que destruye un documento. Exige:
//   1. Rol de administrador.
//   2. Que el documento lleve al menos 30 días en la papelera.
//   3. La frase de confirmación exacta.
//
// Aun así, el archivo de Google Drive se manda a la PAPELERA de Drive, no se
// destruye: Google lo conserva otros 30 días más. Es la última red.
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    const userId = headersList.get('x-user-id')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { table, id, confirm } = await request.json()

    if (confirm !== 'ELIMINAR DEFINITIVAMENTE') {
      return NextResponse.json(
        { error: 'Falta la confirmación explícita para destruir el documento.' },
        { status: 400 }
      )
    }
    if (!TABLAS_DOCUMENTOS.includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    const { data: doc, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 })
    }
    if (!doc.deleted_at) {
      return NextResponse.json(
        { error: 'Solo se pueden purgar documentos que ya están en la papelera.' },
        { status: 400 }
      )
    }

    const restantes = diasRestantes(doc.deleted_at)
    if (restantes > 0) {
      return NextResponse.json(
        {
          error: `Este documento todavía está protegido: faltan ${restantes} día(s) de los ${DIAS_EN_PAPELERA} de retención.`,
        },
        { status: 400 }
      )
    }

    // 1. A la papelera de Drive (recuperable otros 30 días desde Google).
    if (doc.drive_file_id) {
      try {
        await trashFolder(doc.drive_file_id)
      } catch (driveErr: any) {
        console.error(`[PURGAR] No se pudo mover a la papelera de Drive (${doc.drive_file_id}):`, driveErr.message)
      }
    }

    // 2. Copia de Supabase Storage.
    if (doc.storage_path) {
      await supabaseAdmin.storage.from('documentos').remove([doc.storage_path])
    }

    // 3. Registro.
    const { error: delError } = await supabaseAdmin.from(table).delete().eq('id', id)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'PURGE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: {
        file_name: doc.original_file_name,
        document_type: doc.document_type,
        drive_file_id: doc.drive_file_id,
        storage_path: doc.storage_path,
        nota: 'Purga definitiva tras cumplir la retención. El archivo queda en la papelera de Google Drive.',
      },
    })

    return NextResponse.json({
      success: true,
      message: `"${doc.original_file_name}" se eliminó definitivamente. Queda una copia en la papelera de Google Drive.`,
    })
  } catch (err: any) {
    console.error('POST /api/documentos/papelera/purgar error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
