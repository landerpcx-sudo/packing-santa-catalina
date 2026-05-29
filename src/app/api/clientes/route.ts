import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'

// GET /api/clientes - Listar todos los clientes
export async function GET() {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: clients })
  } catch (err: any) {
    console.error('GET /api/clientes error:', err)
    return NextResponse.json({ error: err.message || 'Error al obtener clientes' }, { status: 500 })
  }
}

// POST /api/clientes - Crear un cliente manualmente y generar su carpeta en Drive
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Restringir a admin, gerencia y agronomo
    if (!userRole || !['admin', 'gerencia', 'agronomo'].includes(userRole)) {
      return NextResponse.json({ error: 'No tienes permisos para crear clientes.' }, { status: 403 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre del cliente es requerido.' }, { status: 400 })
    }

    const nameUpper = name.trim().toUpperCase()

    // Verificar duplicado
    const { data: existing } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('name', nameUpper)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `El cliente ${nameUpper} ya existe.` }, { status: 409 })
    }

    // Crear carpeta en Google Drive y sus subcarpetas
    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    let driveFolderId: string | null = null
    let driveFolderUrl: string | null = null
    let driveFolderReceptionsId: string | null = null
    let driveFolderDispatchesId: string | null = null
    let driveFolderFinancialId: string | null = null

    try {
      const driveFolder = await createFolder(nameUpper, rootFolderId)
      driveFolderId = driveFolder.id || null
      driveFolderUrl = driveFolder.url || null

      if (driveFolderId) {
        // Crear subcarpetas
        const [recFolder, despFolder, finFolder] = await Promise.all([
          createFolder('Recepciones', driveFolderId),
          createFolder('Despachos', driveFolderId),
          createFolder('Financiero', driveFolderId)
        ])
        
        driveFolderReceptionsId = recFolder.id || null
        driveFolderDispatchesId = despFolder.id || null
        driveFolderFinancialId = finFolder.id || null
      }
    } catch (driveError: any) {
      console.error(`Error creando carpeta y subcarpetas en Drive para el cliente ${nameUpper}:`, driveError)
    }

    // Insertar en Base de Datos
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert({
        name: nameUpper,
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
        drive_folder_receptions_id: driveFolderReceptionsId,
        drive_folder_dispatches_id: driveFolderDispatchesId,
        drive_folder_financial_id: driveFolderFinancialId
      })
      .select()
      .single()

    if (error) throw error

    // Registrar en Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'CREATE_CLIENT',
      entity_type: 'clients',
      entity_id: client.id,
      details: { name: nameUpper, drive_folder_id: driveFolderId }
    })

    return NextResponse.json({ data: client }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/clientes error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
