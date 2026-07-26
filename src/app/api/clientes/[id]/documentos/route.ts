import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile } from '@/lib/drive'

// GET /api/clientes/[id]/documentos - Listar todos los documentos de un cliente
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: docs, error } = await supabaseAdmin
      .from('client_documents')
      .select(`
        *,
        uploader:uploaded_by(display_name, username)
      `)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data: docs })
  } catch (err: any) {
    console.error('GET /api/clientes/[id]/documentos error:', err)
    return NextResponse.json({ error: err.message || 'Error al obtener documentos' }, { status: 500 })
  }
}

// POST /api/clientes/[id]/documentos - Subir un archivo de cliente a Drive y Supabase Storage sin validaciones
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Restringir a admin, gerencia y agronomo
    if (!userRole || !['admin', 'gerencia', 'agronomo'].includes(userRole)) {
      return NextResponse.json({ error: 'No tienes permisos para subir documentos a este cliente.' }, { status: 403 })
    }

    // Obtener el cliente y su carpeta de Drive
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, drive_folder_id, drive_folder_financial_id')
      .eq('id', id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'El archivo es requerido.' }, { status: 400 })
    }

    // Validar tamaño máximo (50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo supera el límite de 50MB.' }, { status: 400 })
    }

    // Convertir File a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Sanitizar nombre de archivo manteniendo su originalidad
    const timestamp = new Date().getTime()
    const ext = file.name.split('.').pop() || 'pdf'
    // Conservar el nombre original pero saneando caracteres problemáticos
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!sanitizedName.endsWith(`.${ext}`)) {
      sanitizedName = `${sanitizedName}.${ext}`
    }

    // Ruta en Supabase Storage
    const storagePath = `clientes/${id}/${timestamp}_${sanitizedName}`

    // Subir a Supabase Storage (Bucket 'documentos')
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      console.error('Supabase Storage error:', storageError)
      return NextResponse.json({ error: `Error al guardar en el storage: ${storageError.message}` }, { status: 500 })
    }

    // URL pública
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('documentos')
      .getPublicUrl(storagePath)

    const fileUrl = publicUrlData.publicUrl

    // Sincronizar en Google Drive (Híbrido - No bloqueante)
    let driveFileId: string | null = null
    let driveFileUrl: string | null = null

    let targetFolderId = client.drive_folder_financial_id
    if (!targetFolderId && client.drive_folder_id) {
      try {
        const { createFolder } = await import('@/lib/drive')
        console.log(`Creando subcarpeta Financiero bajo demanda para cliente ${client.name}...`)
        const subFolder = await createFolder('Financiero', client.drive_folder_id)
        targetFolderId = subFolder.id || null
        if (targetFolderId) {
          await supabaseAdmin
            .from('clients')
            .update({ drive_folder_financial_id: targetFolderId })
            .eq('id', id)
        }
      } catch (err: any) {
        console.warn(`No se pudo crear subcarpeta Financiero, se usará raíz: ${err.message}`)
        targetFolderId = client.drive_folder_id
      }
    }

    if (targetFolderId) {
      try {
        // En Clientes mantendremos exactamente el nombre original del archivo subido
        const driveFile = await uploadFile(buffer, file.name, file.type, targetFolderId)
        driveFileId = driveFile.id || null
        driveFileUrl = driveFile.url || null
      } catch (driveErr: any) {
        console.error(`AVISO: Falló la sincronización con Google Drive (Clientes):`, driveErr.message)
      }
    }

    // Insertar en la Base de Datos
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('client_documents')
      .insert({
        client_id: id,
        original_file_name: file.name, // Nombre de archivo original e intacto
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        storage_path: storagePath,
        storage_url: fileUrl,
        uploaded_by: userId || null
      })
      .select()
      .single()

    if (dbError) {
      // Limpiar archivo de storage en caso de falla de base de datos
      await supabaseAdmin.storage.from('documentos').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPLOAD_CLIENT_DOCUMENT',
      entity_type: 'client_documents',
      entity_id: docRecord.id,
      details: {
        client_id: id,
        client_name: client.name,
        file_name: file.name,
        storage_path: storagePath
      }
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/clientes/[id]/documentos error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
