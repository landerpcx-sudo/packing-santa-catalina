import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const from = (page - 1) * limit

    const { data: logs, error, count } = await supabaseAdmin
      .from('audit_log')
      .select(`
        *,
        user:user_id(display_name, username, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (error) throw error

    return NextResponse.json({
      data: logs,
      total: count,
      page,
      limit
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
