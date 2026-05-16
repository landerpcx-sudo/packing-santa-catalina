import { NextResponse } from 'next/server'
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
        id, document_type, original_file_name, drive_file_url,
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
  const { id } = await params
  const body = await request.json()
  const { temperature_value, chamber, client, observation } = body

  const { data, error } = await supabaseAdmin
    .from('temperature_reports')
    .update({
      temperature_value: temperature_value ?? undefined,
      chamber: chamber ?? undefined,
      client: client ?? undefined,
      observation: observation ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
