import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/buscar?q=texto
//
// Buscador único para toda la app: antes, encontrar un contenedor o un lote
// exigía adivinar en qué módulo estaba y usar el filtro de esa pantalla.
// Busca por código interno, código de despacho, cliente, destino y número de
// contenedor en Lotes, Despachos y Clientes a la vez.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ data: [] })

    const headersList = await headers()
    const role = headersList.get('x-user-role') || ''
    const like = `%${q}%`

    const puedeVerLotes = ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'gerencia', 'agronomo'].includes(role)
    const puedeVerDespachos = ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo'].includes(role)
    const puedeVerClientes = ['admin', 'gerencia', 'agronomo'].includes(role)

    const [lotsRes, dispatchesRes, clientsRes] = await Promise.all([
      puedeVerLotes
        ? supabaseAdmin.from('lots')
            .select('id, internal_code, display_name, client, overall_status')
            .or(`internal_code.ilike.${like},display_name.ilike.${like},client.ilike.${like}`)
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
      puedeVerDespachos
        ? supabaseAdmin.from('dispatches')
            .select('id, internal_code, dispatch_code, client, destination, container_number, overall_status')
            .or(`internal_code.ilike.${like},dispatch_code.ilike.${like},client.ilike.${like},destination.ilike.${like},container_number.ilike.${like}`)
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
      puedeVerClientes
        ? supabaseAdmin.from('clients')
            .select('id, name')
            .ilike('name', like)
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const resultados = [
      ...(lotsRes.data || []).map(l => ({
        tipo: 'lote' as const,
        id: l.id,
        titulo: `Lote ${l.internal_code}`,
        subtitulo: [l.display_name, l.client].filter(Boolean).join(' · '),
        href: `/lotes/${l.id}`,
      })),
      ...(dispatchesRes.data || []).map(d => ({
        tipo: 'despacho' as const,
        id: d.id,
        titulo: `Despacho ${d.dispatch_code || d.internal_code}`,
        subtitulo: [d.client, d.destination, d.container_number].filter(Boolean).join(' · '),
        href: `/despachos/${d.id}`,
      })),
      ...(clientsRes.data || []).map(c => ({
        tipo: 'cliente' as const,
        id: c.id,
        titulo: c.name,
        subtitulo: 'Cliente / Exportador',
        href: `/clientes?cliente=${c.id}`,
      })),
    ]

    return NextResponse.json({ data: resultados })
  } catch (err: any) {
    console.error('GET /api/buscar error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
