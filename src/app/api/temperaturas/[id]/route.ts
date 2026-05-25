import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('temperature_reports')
    .select(`
      *,
      responsible:responsible_id(display_name),
      temperature_documents(
        id, document_type, original_file_name, drive_file_url, storage_url, storage_path,
        status, created_at,
        uploaded_by_user:uploaded_by(display_name)
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    const userId = headersList.get('x-user-id')

    // Validar rol de escritura
    if (userRole !== 'admin' && userRole !== 'jefe_frio') {
      return NextResponse.json({ error: 'No tienes permisos para modificar reportes de temperatura.' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { temperature_value, chamber, client, variety, observation, is_ambient } = body

    // Obtener reporte actual para registrar en auditoría el cambio de valor
    const { data: oldReport } = await supabaseAdmin
      .from('temperature_reports')
      .select('temperature_value, internal_code')
      .eq('id', id)
      .single()

    const { data, error } = await supabaseAdmin
      .from('temperature_reports')
      .update({
        temperature_value: temperature_value ?? undefined,
        chamber: chamber ?? undefined,
        client: client ?? undefined,
        variety: variety ?? undefined,
        observation: observation ?? undefined,
        is_ambient: is_ambient ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Registrar en auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPDATE_TEMPERATURE_REPORT',
      entity_type: 'temperature_reports',
      entity_id: id,
      details: { 
        internal_code: oldReport?.internal_code,
        old_value: oldReport?.temperature_value, 
        new_value: temperature_value 
      },
    })

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('PATCH /api/temperaturas/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    const userId = headersList.get('x-user-id')

    // Validar que sea administrador
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No tienes permisos para borrar registros de temperatura.' }, { status: 403 })
    }

    const { id } = await params

    // Obtener información del reporte antes de borrar para auditoría
    const { data: report } = await supabaseAdmin
      .from('temperature_reports')
      .select('internal_code, report_date')
      .eq('id', id)
      .single()

    if (!report) {
      return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })
    }

    // Borrar documentos asociados de la base de datos primero (debido a ON DELETE RESTRICT)
    const { error: docsDeleteError } = await supabaseAdmin
      .from('temperature_documents')
      .delete()
      .eq('temperature_report_id', id)

    if (docsDeleteError) {
      return NextResponse.json({ error: `Error al borrar documentos asociados: ${docsDeleteError.message}` }, { status: 500 })
    }

    // Borrar el reporte de temperatura
    const { error: reportDeleteError } = await supabaseAdmin
      .from('temperature_reports')
      .delete()
      .eq('id', id)

    if (reportDeleteError) {
      return NextResponse.json({ error: `Error al borrar el reporte: ${reportDeleteError.message}` }, { status: 500 })
    }

    // Registrar en auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'DELETE_TEMPERATURE_REPORT',
      entity_type: 'temperature_reports',
      entity_id: id,
      details: { 
        internal_code: report.internal_code,
        report_date: report.report_date
      },
    })

    return NextResponse.json({ success: true, message: 'Registro de temperatura eliminado exitosamente.' })
  } catch (err: any) {
    console.error('DELETE /api/temperaturas/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
