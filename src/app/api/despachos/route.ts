import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const from = (page - 1) * limit

  let query = supabaseAdmin
    .from('dispatches')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (status) query = query.eq('overall_status', status)
  if (search) query = query.or(`internal_code.ilike.%${search}%,client.ilike.%${search}%,destination.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count, page, limit })
}

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const body = await request.json()
    const { dispatch_code, client, destination, expected_pallets, dispatch_date } = body

    if (!dispatch_code) {
      return NextResponse.json({ error: 'El código de despacho es requerido.' }, { status: 400 })
    }

    const year = new Date().getFullYear()
    const paddedNumber = dispatch_code.toString().padStart(4, '0')
    const internal_code = `DES-${year}-${paddedNumber}`

    const { data: existing } = await supabaseAdmin
      .from('dispatches')
      .select('id')
      .eq('internal_code', internal_code)
      .single()

    if (existing) {
      return NextResponse.json({ error: `El Despacho ${internal_code} ya existe.` }, { status: 409 })
    }

    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    let driveFolderId: string | null = null
    let driveFolderUrl: string | null = null

    if (rootFolderId) {
      try {
        const rootRes = await createFolder(internal_code, rootFolderId)
        driveFolderId = rootRes.id ?? null
        driveFolderUrl = rootRes.url ?? null
      } catch (e) {
        console.warn('Drive folder creation failed for dispatch', e)
      }
    }

    const { data: dispatch, error } = await supabaseAdmin
      .from('dispatches')
      .insert({
        internal_code,
        dispatch_code,
        client: client || null,
        destination: destination || null,
        expected_pallets: expected_pallets ? parseInt(expected_pallets) : null,
        dispatch_date: dispatch_date || new Date().toISOString().split('T')[0],
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
