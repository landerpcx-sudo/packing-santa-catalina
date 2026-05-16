import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { headers } from 'next/headers'

const KEY = 'temperature_control_start_date'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', KEY)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ value: data?.value || null })
}

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const body = await request.json()
    const { value } = body

    if (!value) {
      return NextResponse.json({ error: 'La fecha es requerida' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key: KEY, value })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPDATE_SETTING',
      entity_type: 'app_settings',
      entity_id: KEY,
      details: { key: KEY, new_value: value },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
