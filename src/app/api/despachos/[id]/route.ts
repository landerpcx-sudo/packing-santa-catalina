import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: dispatch, error } = await supabaseAdmin
      .from('dispatches')
      .select(`
        *,
        created_by_user:users_app!created_by(display_name),
        dispatch_documents(*)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    if (!dispatch) return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })

    return NextResponse.json({ data: dispatch })
  } catch (err: any) {
    console.error('GET /api/despachos/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: updated, error } = await supabaseAdmin
      .from('dispatches')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalcular Estado General (por si cambió expected_pallets)
    const minPata = Math.ceil((updated.expected_pallets || 0) / 2)
    const isComplete = updated.pack_list_status !== 'pending' && 
                       updated.pata_pata_photos_count >= minPata && 
                       updated.thermograph_photos_count >= 2
    
    const { data: final } = await supabaseAdmin
      .from('dispatches')
      .update({ overall_status: isComplete ? 'complete' : 'pending' })
      .eq('id', id)
      .select()
      .single()

    return NextResponse.json({ data: final || updated })
  } catch (err: any) {
    console.error('PATCH /api/despachos/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
