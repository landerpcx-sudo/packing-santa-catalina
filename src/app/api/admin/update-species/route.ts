import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // 1. Actualizar despachos de THE GROWERS CLUB -> Limones
    const { data: growersUpdated, error: growersErr } = await supabaseAdmin
      .from('dispatches')
      .update({ species: 'Limones' })
      .ilike('client', '%growers%')
      .select('id, internal_code, client, species')

    // 2. Actualizar despachos de AGROCOMERCIAL -> Manzanas
    const { data: agroUpdated, error: agroErr } = await supabaseAdmin
      .from('dispatches')
      .update({ species: 'Manzanas' })
      .ilike('client', '%agrocomercial%')
      .select('id, internal_code, client, species')

    return NextResponse.json({
      success: true,
      growersUpdated: growersUpdated?.length || 0,
      agroUpdated: agroUpdated?.length || 0,
      details: {
        growersErr: growersErr?.message || null,
        agroErr: agroErr?.message || null,
      }
    })
  } catch (err: any) {
    console.error('Error updating species:', err)
    return NextResponse.json({ error: err.message || 'Error al actualizar especies' }, { status: 500 })
  }
}
