import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Solo el administrador puede abrir despachos.' }, { status: 403 })
    }

    // Actualizar estado general a complete
    const { data: dispatch, error } = await supabaseAdmin
      .from('dispatches')
      .update({ overall_status: 'complete' })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'OPEN_DISPATCH',
      entity_type: 'dispatches',
      entity_id: id,
      details: { message: 'Despacho reabierto por el administrador' },
    })

    return NextResponse.json({ data: dispatch })
  } catch (err: any) {
    console.error('POST /api/despachos/[id]/abrir error:', err)
    return NextResponse.json(
      { error: err.message || 'Error interno al abrir el despacho' },
      { status: 500 }
    )
  }
}
