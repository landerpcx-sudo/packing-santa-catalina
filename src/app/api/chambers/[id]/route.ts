import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    if (!userRole || !['admin', 'gerencia', 'agronomo', 'jefe_frio'].includes(userRole)) {
      return NextResponse.json({ error: 'No tienes permisos para modificar cámaras.' }, { status: 403 })
    }

    const body = await request.json()
    const { active, name } = body

    const updateData: Record<string, any> = {}
    if (active !== undefined) updateData.active = active
    if (name !== undefined && name.trim()) updateData.name = name.trim().toUpperCase()

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay datos válidos para actualizar.' }, { status: 400 })
    }

    const { data: chamber, error } = await supabaseAdmin
      .from('chambers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPDATE_CHAMBER',
      entity_type: 'chambers',
      entity_id: id,
      details: updateData
    })

    return NextResponse.json({ data: chamber })
  } catch (err: any) {
    console.error('PUT /api/chambers/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
