import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')
    let clientName = headersList.get('x-user-client-name')
    const userId = headersList.get('x-user-id')

    if (userId && (!clientName || clientName.trim() === '')) {
      const { data: userData } = await supabaseAdmin
        .from('users_app')
        .select('client_name, display_name')
        .eq('id', userId)
        .single()
      if (userData?.client_name) {
        clientName = userData.client_name
      } else if (userData?.display_name) {
        clientName = userData.display_name
      }
    }

    const cleanClient = (clientName || '').trim()

    // 1. Lotes (consultar todos los lotes del cliente)
    let lotsQuery = supabaseAdmin
      .from('lots')
      .select('id, species, closed, created_at, client')
    
    if (cleanClient) {
      lotsQuery = lotsQuery.or(`client.ilike.%${cleanClient}%,client_name.ilike.%${cleanClient}%`)
    }

    const { data: lotsData, error: lotsError } = await lotsQuery
    if (lotsError) {
      console.error('Error al obtener lotes:', lotsError)
    }

    const allLots = lotsData || []
    const openLotsCount = allLots.filter(l => !l.closed).length
    const closedLotsCount = allLots.filter(l => l.closed).length
    const totalLotsCount = allLots.length

    // 2. Despachos (todos los despachos creados para el cliente)
    let despachosQuery = supabaseAdmin
      .from('dispatches')
      .select('id, species, client, closed, created_at, drive_folder_id')

    if (cleanClient) {
      despachosQuery = despachosQuery.ilike('client', `%${cleanClient}%`)
    }

    const { data: despachosData, error: despachosError } = await despachosQuery
    if (despachosError) {
      console.error('Error al obtener despachos:', despachosError)
    }

    const allDispatches = despachosData || []
    const activeDispatchesCount = allDispatches.length

    // 3. Conteo por Especie de Fruta (combinando Lotes y Despachos)
    const speciesMap: Record<string, number> = {}

    // De Lotes
    allLots.forEach(l => {
      let spec = l.species?.trim()
      if (spec) {
        speciesMap[spec] = (speciesMap[spec] || 0) + 1
      }
    })

    // De Despachos
    allDispatches.forEach(d => {
      let spec = d.species?.trim()
      if (!spec && d.client && d.client.toUpperCase().includes('GROWERS')) {
        spec = 'Limones'
      }
      if (spec) {
        speciesMap[spec] = (speciesMap[spec] || 0) + 1
      }
    })

    // Si sigue vacío pero el cliente es THE GROWERS CLUB, asegurar 'Limones'
    if (Object.keys(speciesMap).length === 0 && cleanClient.toUpperCase().includes('GROWERS')) {
      speciesMap['Limones'] = allDispatches.length || 1
    }

    const speciesList = Object.entries(speciesMap).map(([name, count]) => ({
      name,
      count
    }))

    // 4. Últimos 3 documentos PDF del cliente
    let docsQuery = supabaseAdmin
      .from('lot_documents')
      .select('id, file_name, file_url, document_type, created_at')
      .order('created_at', { ascending: false })
      .limit(3)

    const { data: recentDocs } = await docsQuery

    return NextResponse.json({
      totalLots: totalLotsCount,
      openLots: openLotsCount,
      closedLots: closedLotsCount,
      activeLots: totalLotsCount,
      activeDispatches: activeDispatchesCount,
      species: speciesList,
      recentDocs: (recentDocs || []).map(d => ({
        id: d.id,
        fileName: d.file_name,
        fileUrl: d.file_url,
        type: d.document_type,
        createdAt: d.created_at
      }))
    })
  } catch (error) {
    console.error('Error fetching client summary:', error)
    return NextResponse.json({ totalLots: 0, openLots: 0, closedLots: 0, activeLots: 0, activeDispatches: 0, species: [], recentDocs: [] }, { status: 500 })
  }
}
