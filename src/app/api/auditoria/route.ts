import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auditoria
//
// Antes esta ruta ignoraba cualquier filtro: la caja de búsqueda de la
// pantalla existía pero no hacía nada. Ahora soporta:
//   q       → busca en la acción, el tipo de entidad y el id de entidad
//   action  → una acción exacta (para el desplegable de tipo de evento)
//   desde/hasta → rango de fechas (YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const from = (page - 1) * limit

    const q = (searchParams.get('q') || '').trim()
    const action = (searchParams.get('action') || '').trim()
    const desde = (searchParams.get('desde') || '').trim()
    const hasta = (searchParams.get('hasta') || '').trim()

    let query = supabaseAdmin
      .from('audit_log')
      .select(`
        *,
        user:user_id(display_name, username, role)
      `, { count: 'exact' })

    if (q) {
      const like = `%${q}%`
      query = query.or(`action.ilike.${like},entity_type.ilike.${like},entity_id.ilike.${like}`)
    }
    if (action) query = query.eq('action', action)
    if (desde) query = query.gte('created_at', `${desde}T00:00:00`)
    if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`)

    const { data: logs, error, count } = await query
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
