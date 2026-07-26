import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recalculateLotStatus } from '@/lib/status-helper'
import { TABLAS_DOCUMENTOS, recalcularTrasBaja } from '@/lib/papelera'

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/documentos/[table]/[id]
//
// REGLA DE ORO: esto YA NO BORRA NADA.
//
// Antes: borraba la fila de la base, borraba el archivo de Supabase Storage y
// mandaba el de Google Drive a la papelera. Un clic equivocado —el basurero está
// pegado al ojito de "ver"— destruía el documento sin vuelta atrás.
//
// Ahora: marca el documento como eliminado (deleted_at). Desaparece de los
// listados, deja de contar para los estados y deja de sincronizarse, pero
// el archivo sigue intacto en Supabase Storage y en Google Drive.
// Se restaura con un clic desde la papelera durante 30 días.
//
// El borrado físico definitivo vive en /api/documentos/papelera (POST purgar),
// solo para administradores y con confirmación explícita.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const { table, id } = await params
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    const userId = headersList.get('x-user-id')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No tienes permisos para eliminar documentos.' }, { status: 403 })
    }

    if (!TABLAS_DOCUMENTOS.includes(table as any)) {
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

    if (doc.deleted_at) {
      return NextResponse.json({ error: 'Ese documento ya está en la papelera.' }, { status: 400 })
    }

    // Marcar en la papelera. El archivo NO se toca.
    const { error: updError } = await supabaseAdmin
      .from(table)
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId || null })
      .eq('id', id)

    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

    // Recalcular contadores y estados como si el documento ya no estuviera.
    await recalcularTrasBaja(table, doc)
    if (table === 'lot_documents') await recalculateLotStatus(doc.lot_id)

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'DELETE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: {
        document_type: doc.document_type || 'client_document',
        file_name: doc.original_file_name,
        drive_file_id: doc.drive_file_id,
        storage_path: doc.storage_path,
        modo: 'papelera',
        nota: 'El archivo sigue guardado en Supabase y en Drive. Recuperable desde la papelera.',
      },
    })

    return NextResponse.json({
      success: true,
      papelera: true,
      message: 'Documento enviado a la papelera. Puedes restaurarlo durante 30 días.',
    })
  } catch (err: any) {
    console.error(`DELETE /api/documentos/[table]/[id] error:`, err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
