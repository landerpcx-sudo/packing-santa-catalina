import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/chambers - Listar cámaras activas
export async function GET() {
  try {
    const { data: chambers, error } = await supabaseAdmin
      .from('chambers')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: chambers })
  } catch (err: any) {
    console.error('GET /api/chambers error:', err)
    return NextResponse.json({ error: err.message || 'Error al obtener cámaras' }, { status: 500 })
  }
}

// POST /api/chambers - Crear una nueva cámara de frío (sólo admins y roles autorizados)
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    if (!userRole || !['admin', 'gerencia', 'agronomo', 'jefe_frio'].includes(userRole)) {
      return NextResponse.json({ error: 'No tienes permisos para crear cámaras.' }, { status: 403 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre de la cámara es requerido.' }, { status: 400 })
    }

    const nameUpper = name.trim().toUpperCase()

    // Verificar duplicado
    const { data: existing } = await supabaseAdmin
      .from('chambers')
      .select('id')
      .eq('name', nameUpper)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `La cámara ${nameUpper} ya existe.` }, { status: 409 })
    }

    // Insertar cámara
    const { data: chamber, error } = await supabaseAdmin
      .from('chambers')
      .insert({ name: nameUpper })
      .select()
      .single()

    if (error) throw error

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'CREATE_CHAMBER',
      entity_type: 'chambers',
      entity_id: chamber.id,
      details: { name: nameUpper }
    })

    return NextResponse.json({ data: chamber }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/chambers error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
