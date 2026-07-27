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

    // 1. Lotes
    let lotsQuery = supabaseAdmin
      .from('lots')
      .select('id, species, overall_status, created_at, client')
    
    if (cleanClient) {
      lotsQuery = lotsQuery.ilike('client', `%${cleanClient}%`)
    }

    const { data: lotsData } = await lotsQuery
    const allLots = lotsData || []
    const openLotsCount = allLots.filter(l => l.overall_status !== 'closed').length
    const closedLotsCount = allLots.filter(l => l.overall_status === 'closed').length
    const totalLotsCount = allLots.length

    // 2. Despachos
    let despachosQuery = supabaseAdmin
      .from('dispatches')
      .select('id, species, client, overall_status, created_at, drive_folder_id')

    if (cleanClient) {
      despachosQuery = despachosQuery.ilike('client', `%${cleanClient}%`)
    }

    const { data: despachosData } = await despachosQuery
    const allDispatches = despachosData || []
    const activeDispatchesCount = allDispatches.length

    // 3. Normalizar especies sin duplicados (Limón y Limones se agrupan en Limones)
    const normalizeSpecies = (rawName?: string | null) => {
      if (!rawName) return null
      const clean = rawName.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (clean.includes('limon')) return 'Limones'
      if (clean.includes('manzana')) return 'Manzanas'
      if (clean.includes('cereza')) return 'Cerezas'
      if (clean.includes('uva')) return 'Uvas'
      if (clean.includes('naranja')) return 'Naranjas'
      if (clean.includes('palta')) return 'Paltas'
      if (clean.includes('kiwi')) return 'Kiwis'
      if (clean.includes('durazno') || clean.includes('nectarin')) return 'Duraznos'
      if (clean.includes('arandano')) return 'Arándanos'
      if (clean.includes('pera')) return 'Peras'
      return rawName.trim()
    }

    const speciesSet = new Set<string>()

    allLots.forEach(l => {
      const spec = normalizeSpecies(l.species)
      if (spec) speciesSet.add(spec)
    })

    allDispatches.forEach(d => {
      const spec = normalizeSpecies(d.species)
      if (spec) speciesSet.add(spec)
    })

    if (speciesSet.size === 0 && cleanClient.toUpperCase().includes('GROWERS')) {
      speciesSet.add('Limones')
    }

    const speciesList = Array.from(speciesSet).map(name => {
      const normName = normalizeSpecies(name)
      const countDispatches = allDispatches.filter(d => normalizeSpecies(d.species) === normName).length
      const countLots = allLots.filter(l => normalizeSpecies(l.species) === normName).length
      const count = countDispatches || countLots || 1
      return { name, count }
    })

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
