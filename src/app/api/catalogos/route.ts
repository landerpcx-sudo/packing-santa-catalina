import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // 1. Obtener clientes registrados de la tabla clients
    const { data: clientsData, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('name')
      .order('name', { ascending: true })

    if (clientsError) throw clientsError

    // 2. Obtener productores y variedades únicas de la tabla lots
    const { data: lotsData, error: lotsError } = await supabaseAdmin
      .from('lots')
      .select('producer, variety')

    if (lotsError) throw lotsError

    const clients = clientsData ? clientsData.map(c => c.name.toUpperCase()) : []
    
    const producers = lotsData 
      ? Array.from(new Set(lotsData.map(l => l.producer?.trim().toUpperCase()).filter(Boolean))) as string[]
      : []

    const varieties = lotsData
      ? Array.from(new Set(lotsData.map(l => l.variety?.trim().toUpperCase()).filter(Boolean))) as string[]
      : []

    // Ordenar alfabéticamente
    clients.sort()
    producers.sort()
    varieties.sort()

    return NextResponse.json({
      clients,
      producers,
      varieties
    })
  } catch (err: any) {
    console.error('Error en GET /api/catalogos:', err)
    return NextResponse.json({ error: err.message || 'Error al obtener catálogos' }, { status: 500 })
  }
}
