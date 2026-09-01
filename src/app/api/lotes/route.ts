export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'

export async function GET(request: Request) {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role')
  let clientNameHeader = headersList.get('x-user-client-name')
  const userId = headersList.get('x-user-id')

  // Si el usuario es de rol 'cliente' pero el header de cliente no viene en la petición, buscarlo en la DB
  if (userRole === 'cliente' && !clientNameHeader && userId) {
    const { data: userData } = await supabaseAdmin
      .from('users_app')
      .select('client_name')
      .eq('id', userId)
      .single()
    if (userData?.client_name) {
      clientNameHeader = userData.client_name
    }
  }

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

  // Filtro de seguridad estricto para rol Cliente
  if (userRole === 'cliente') {
    if (!clientNameHeader) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
    query = query.ilike('client', `%${clientNameHeader.trim()}%`)
  } else if (client) {
    query = query.ilike('client', `%${client}%`)
  }

  if (status) {
    if (status === 'pending') {
      query = query.or('overall_status.in.(pending,uploaded),overall_status.is.null')
    } else if (status === 'complete' || status === 'validated') {
      query = query.in('overall_status', ['complete', 'validated'])
    } else {
      query = query.eq('overall_status', status)
    }
  }
  if (search) query = query.or(`internal_code.ilike.%${search}%,display_name.ilike.%${search}%,client.ilike.%${search}%`)
  if (producer) query = query.ilike('producer', `%${producer}%`)
  if (species) {
    const cleanSpec = species.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    let matchStr = species.trim()
    if (cleanSpec.includes('limon')) matchStr = 'Limon'
    else if (cleanSpec.includes('manzana')) matchStr = 'Manzana'
    else if (cleanSpec.includes('cereza')) matchStr = 'Cereza'
    else if (cleanSpec.includes('uva')) matchStr = 'Uva'
    else if (cleanSpec.includes('naranja')) matchStr = 'Naranja'
    else if (cleanSpec.includes('palta')) matchStr = 'Palta'
    else if (cleanSpec.includes('kiwi')) matchStr = 'Kiwi'
    else if (cleanSpec.includes('arandano')) matchStr = 'Arandano'
    query = query.ilike('species', `%${matchStr}%`)
  }
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
    const paddedNumber = lot_number.toString().trim().padStart(3, '0')
    const internal_code = `LOT-${year}-${paddedNumber}`
    const display_name = `Lote ${paddedNumber}`

    const { data: existing } = await supabaseAdmin
      .from('lots')
      .select('id')
      .eq('internal_code', internal_code)
      .single()

    if (existing) {
      return NextResponse.json({ error: `El Lote ${paddedNumber} ya existe.` }, { status: 409 })
    }

    // Buscar la subcarpeta "Recepciones" del cliente
    let targetParentFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    
    if (clientUpper) {
      const { data: clientRecord } = await supabaseAdmin
        .from('clients')
        .select('id, name, drive_folder_id, drive_folder_receptions_id')
        .eq('name', clientUpper)
        .maybeSingle()
      
      if (clientRecord) {
        let recFolderId = clientRecord.drive_folder_receptions_id
        
        if (!recFolderId && clientRecord.drive_folder_id) {
          // Si no está el ID guardado, creamos la subcarpeta Recepciones bajo demanda
          try {
            console.log(`Creando subcarpeta Recepciones para cliente ${clientUpper}...`)
            const subFolder = await createFolder('Recepciones', clientRecord.drive_folder_id)
            recFolderId = subFolder.id || null
            if (recFolderId) {
              await supabaseAdmin
                .from('clients')
                .update({ drive_folder_receptions_id: recFolderId })
                .eq('id', clientRecord.id)
            }
          } catch (err: any) {
            console.warn(`No se pudo crear subcarpeta Recepciones: ${err.message}`)
          }
        }
        
        if (recFolderId) {
          targetParentFolderId = recFolderId
        } else if (clientRecord.drive_folder_id) {
          targetParentFolderId = clientRecord.drive_folder_id
        }
      }
    }

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
      const driveFolder = await createFolder(folderName, targetParentFolderId)
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
