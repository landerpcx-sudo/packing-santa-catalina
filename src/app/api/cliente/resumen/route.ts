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

    if (!clientName) {
      clientName = ''
    }

    // 1. Lotes en proceso (abiertos / closed = false)
    let lotsQuery = supabaseAdmin
      .from('lots')
      .select('id, species, closed, created_at')
    
    if (clientName) {
      lotsQuery = lotsQuery.ilike('client_name', `%${clientName}%`)
    }

    const { data: lotsData } = await lotsQuery

    const activeLotsCount = (lotsData || []).filter(l => !l.closed).length

    // 2. Conteo por Especie de Fruta
    const speciesMap: Record<string, number> = {}
    ;(lotsData || []).forEach(l => {
      if (l.species) {
        const spec = l.species.trim()
        speciesMap[spec] = (speciesMap[spec] || 0) + 1
      }
    })

    const speciesList = Object.entries(speciesMap).map(([name, count]) => ({
      name,
      count
    }))

    // 3. Despachos (cerrados = false o creados en últimos 30 días)
    let despachosQuery = supabaseAdmin
      .from('despachos')
      .select('id, closed, created_at')

    if (clientName) {
      despachosQuery = despachosQuery.ilike('client', `%${clientName}%`)
    }

    const { data: despachosData } = await despachosQuery
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const activeDispatchesCount = (despachosData || []).filter(d => !d.closed || (d.created_at && d.created_at >= thirtyDaysAgo)).length

    // 4. Últimos 3 documentos PDF del cliente
    let docsQuery = supabaseAdmin
      .from('lot_documents')
      .select('id, file_name, file_url, document_type, created_at')
      .order('created_at', { ascending: false })
      .limit(3)

    const { data: recentDocs } = await docsQuery

    return NextResponse.json({
      activeLots: activeLotsCount,
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
    return NextResponse.json({ activeLots: 0, activeDispatches: 0, species: [], recentDocs: [] }, { status: 500 })
  }
}
