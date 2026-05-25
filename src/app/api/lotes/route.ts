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
  const producer = searchParams.get('producer') || ''
  const species = searchParams.get('species') || ''
  const variety = searchParams.get('variety') || ''
  
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('lots')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('overall_status', status)
  if (search) query = query.or(`internal_code.ilike.%${search}%,display_name.ilike.%${search}%,client.ilike.%${search}%`)
  if (client) query = query.ilike('client', `%${client}%`)
  if (producer) query = query.ilike('producer', `%${producer}%`)
  if (species) query = query.ilike('species', `%${species}%`)
  if (variety) query = query.ilike('variety', `%${variety}%`)
  
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
    const { lot_number, client, producer, species, variety } = body

    if (!lot_number) {
      return NextResponse.json({ error: 'El número de lote es requerido.' }, { status: 400 })
    }

    // Convertir campos de texto ingresados manualmente a MAYÚSCULAS
    const clientUpper = client ? client.trim().toUpperCase() : null
    const producerUpper = producer ? producer.trim().toUpperCase() : null
    const varietyUpper = variety ? variety.trim().toUpperCase() : null

    // Autoguardar cliente si es nuevo
    if (clientUpper) {
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('*')
        .eq('name', clientUpper)
        .maybeSingle()

      if (!existingClient) {
        let clientDriveFolderId: string | null = null
        let clientDriveFolderUrl: string | null = null
        
        try {
          const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
          const driveFolder = await createFolder(clientUpper, rootFolderId)
          clientDriveFolderId = driveFolder.id || null
          clientDriveFolderUrl = driveFolder.url || null
        } catch (driveError) {
          console.error(`Error al crear carpeta en Drive para el cliente ${clientUpper}:`, driveError)
        }

        await supabaseAdmin
          .from('clients')
          .insert({
            name: clientUpper,
            drive_folder_id: clientDriveFolderId,
            drive_folder_url: clientDriveFolderUrl
          })
      }
    }

    const year = new Date().getFullYear()
    const paddedNumber = lot_number.toString().padStart(4, '0')
    const internal_code = `LOT-${year}-${paddedNumber}`
    const display_name = `Lote ${lot_number}`

    const { data: existing } = await supabaseAdmin
      .from('lots')
      .select('id')
      .eq('internal_code', internal_code)
      .single()

    if (existing) {
      return NextResponse.json({ error: `El Lote ${lot_number} ya existe.` }, { status: 409 })
    }

    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    let driveFolderId: string | null = null
    let driveFolderUrl: string | null = null
    let subfolderIds: Record<string, string | null> = {
      reception: null,
      quality: null,
      process: null,
      photos: null,
      backup: null,
    }

    try {
      const folderName = `${internal_code} - ${display_name}${clientUpper ? ` - ${clientUpper}` : ''}`
      const driveFolder = await createFolder(folderName, rootFolderId)
      driveFolderId = driveFolder.id!
      driveFolderUrl = driveFolder.url!

      // Crear subcarpetas y guardar sus IDs
      const [rec, cal, pro, bak] = await Promise.all([
        createFolder('1. Recepcion', driveFolderId),
        createFolder('2. Calidad', driveFolderId),
        createFolder('3. Proceso', driveFolderId),
        createFolder('4. Respaldos', driveFolderId),
      ])
      subfolderIds = {
        reception: rec.id!,
        quality: cal.id!,
        process: pro.id!,
        backup: bak.id!,
      }
    } catch (driveError) {
      console.error('Error al crear carpetas en Drive:', driveError)
    }

    const now = new Date()
    const reception_deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const quality_deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const process_deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: lot, error } = await supabaseAdmin
      .from('lots')
      .insert({
        internal_code,
        lot_number: lot_number.toString(),
        display_name,
        client: clientUpper,
        producer: producerUpper,
        species: species || null,
        variety: varietyUpper,
        created_by: userId || null,
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
        drive_folder_reception_id: subfolderIds.reception,
        drive_folder_quality_id: subfolderIds.quality,
        drive_folder_process_id: subfolderIds.process,
        drive_folder_backup_id: subfolderIds.backup,
        reception_deadline: reception_deadline.toISOString(),
        quality_deadline: quality_deadline.toISOString(),
        process_deadline: process_deadline.toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'CREATE_LOT',
      entity_type: 'lots',
      entity_id: lot.id,
      details: { internal_code, display_name, drive_folder_id: driveFolderId },
    })

    return NextResponse.json({ data: lot }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/lotes error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
