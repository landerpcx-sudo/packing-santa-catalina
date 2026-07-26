import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recalculateLotStatus } from '@/lib/status-helper'
import { TABLAS_DOCUMENTOS, recalcularTrasBaja } from '@/lib/papelera'

// POST /api/documentos/papelera/restaurar
// Body: { table, id }
//
// Devuelve un documento de la papelera a su ficha. Como el archivo nunca se
// borró, restaurar es simplemente quitar la marca: el documento vuelve a
// aparecer, vuelve a contar para los estados y, si le faltaba la copia en
// Drive, el cron horario la subirá en la siguiente pasada.
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    const userId = headersList.get('x-user-id')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { table, id } = await request.json()

    if (!TABLAS_DOCUMENTOS.includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }
    if (!id) {
      return NextResponse.json({ error: 'Falta el identificador del documento.' }, { status: 400 })
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
      return NextResponse.json({ error: 'Ese documento no está en la papelera.' }, { status: 400 })
    }

    const { error: updError } = await supabaseAdmin
      .from(table)
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id)

    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

    await recalcularTrasBaja(table, doc, 1)
    if (table === 'lot_documents') await recalculateLotStatus(doc.lot_id)

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'RESTORE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: { file_name: doc.original_file_name, document_type: doc.document_type },
    })

    return NextResponse.json({
      success: true,
      message: `"${doc.original_file_name}" volvió a su ficha.`,
    })
  } catch (err: any) {
    console.error('POST /api/documentos/papelera/restaurar error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
