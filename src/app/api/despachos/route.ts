import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const dateFrom = searchParams.get('from') || ''
  const dateTo = searchParams.get('to') || ''
  const client = searchParams.get('client') || ''
  const market = searchParams.get('market') || ''
  const container = searchParams.get('container') || ''
  
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('dispatches')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('overall_status', status)
  if (search) query = query.or(`internal_code.ilike.%${search}%,client.ilike.%${search}%,destination.ilike.%${search}%,container_number.ilike.%${search}%`)
  if (client) query = query.ilike('client', `%${client}%`)
  if (market) query = query.ilike('destination', `%${market}%`)
  if (container) query = query.ilike('container_number', `%${container}%`)
  
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00Z`)
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59Z`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count, page, limit })
}

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const body = await request.json()
    const { dispatch_code, client, destination, expected_pallets, dispatch_date, container_number, invoice_amount, advance_amount } = body

    if (!dispatch_code) {
      return NextResponse.json({ error: 'El código de despacho es requerido.' }, { status: 400 })
    }

    if (!container_number || !container_number.trim()) {
      return NextResponse.json({ error: 'El número de contenedor es requerido.' }, { status: 400 })
    }

    const year = new Date().getFullYear()
    const paddedNumber = dispatch_code.toString().trim().padStart(3, '0')
    const internal_code = `DES-${year}-${paddedNumber}`

    const { data: existing } = await supabaseAdmin
      .from('dispatches')
      .select('id')
      .eq('internal_code', internal_code)
      .single()

    if (existing) {
      return NextResponse.json({ error: `El Despacho ${internal_code} ya existe.` }, { status: 409 })
    }

    const clientUpper = client ? client.trim().toUpperCase() : null

    let targetParentFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    
    if (clientUpper) {
      const { data: clientRecord } = await supabaseAdmin
        .from('clients')
        .select('id, name, drive_folder_id, drive_folder_dispatches_id')
        .eq('name', clientUpper)
        .maybeSingle()
      
      if (clientRecord) {
        let despFolderId = clientRecord.drive_folder_dispatches_id
        
        if (!despFolderId && clientRecord.drive_folder_id) {
          // Si no está el ID guardado, creamos la subcarpeta Despachos bajo demanda
          try {
            console.log(`Creando subcarpeta Despachos para cliente ${clientUpper}...`)
            const subFolder = await createFolder('Despachos', clientRecord.drive_folder_id)
            despFolderId = subFolder.id || null
            if (despFolderId) {
              await supabaseAdmin
                .from('clients')
                .update({ drive_folder_dispatches_id: despFolderId })
                .eq('id', clientRecord.id)
            }
          } catch (err: any) {
            console.warn(`No se pudo crear subcarpeta Despachos: ${err.message}`)
          }
        }
        
        if (despFolderId) {
          targetParentFolderId = despFolderId
        } else if (clientRecord.drive_folder_id) {
          targetParentFolderId = clientRecord.drive_folder_id
        }
      }
    }

    let driveFolderId: string | null = null
    let driveFolderUrl: string | null = null

    try {
      const folderName = `${internal_code}${clientUpper ? ` - ${clientUpper}` : ''}`
      const rootRes = await createFolder(folderName, targetParentFolderId)
      driveFolderId = rootRes.id ?? null
      driveFolderUrl = rootRes.url ?? null
    } catch (e) {
      console.warn('Drive folder creation failed for dispatch', e)
    }

    const { data: dispatch, error } = await supabaseAdmin
      .from('dispatches')
      .insert({
        internal_code,
        dispatch_code,
        client: clientUpper || null,
        destination: destination || null,
        expected_pallets: expected_pallets ? parseInt(expected_pallets) : null,
        dispatch_date: dispatch_date || new Date().toISOString().split('T')[0],
        container_number: container_number ? container_number.trim() : null,
        invoice_amount: invoice_amount !== undefined && invoice_amount !== null && invoice_amount !== '' ? parseFloat(invoice_amount) : null,
        advance_amount: advance_amount !== undefined && advance_amount !== null && advance_amount !== '' ? parseFloat(advance_amount) : 0,
        created_by: userId || null,
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'CREATE_DISPATCH',
      entity_type: 'dispatches',
      entity_id: dispatch.id,
      details: { internal_code, client, drive_folder_id: driveFolderId },
    })

    return NextResponse.json({ data: dispatch }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/despachos error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
