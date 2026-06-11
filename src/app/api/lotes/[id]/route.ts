import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'
import { syncDocsToDrive } from '@/lib/drive-sync'
import { recalculateLotStatus } from '@/lib/status-helper'

// Margen para que la sincronización a Drive en segundo plano (after()) complete.
export const maxDuration = 60

// GET - Obtener detalle de un lote con sus documentos
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: lot, error } = await supabaseAdmin
    .from('lots')
    .select(`
      *,
      lot_documents(
        *,
        uploaded_by_user:uploaded_by(display_name),
        validated_by_user:validated_by(display_name)
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ data: lot })
}

// POST - Subir un documento a un lote (usando Supabase Storage)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    // Obtener el lote
    const { data: lot, error: lotError } = await supabaseAdmin
      .from('lots')
      .select('id, internal_code, drive_folder_id, drive_folder_reception_id, drive_folder_quality_id, drive_folder_process_id, drive_folder_photos_id, drive_folder_backup_id')
      .eq('id', id)
      .single()

    if (lotError || !lot) {
      return NextResponse.json({ error: 'Lote no encontrado.' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const document_type = formData.get('document_type') as string

    if (!file || !document_type) {
      return NextResponse.json({ error: 'Archivo y tipo de documento son requeridos.' }, { status: 400 })
    }

    // Validar tamaño máximo (50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo supera el límite de 50MB.' }, { status: 400 })
    }

    // Convertir File a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 1. Renombrado inteligente (se calcula primero para poder usar el nombre saneado en la versión de ser necesario)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = file.name.split('.').pop() || 'pdf'
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    if (document_type === 'reception') sanitizedName = `Informe Recepcion ${lot.internal_code}.${ext}`
    else if (document_type === 'quality') sanitizedName = `Informe Calidad ${lot.internal_code}.${ext}`
    // Omitimos el renombrado de process para conservar el nombre original del archivo de proceso (saneado)

    // Verificar colisión de nombres para aplicar correlativo en lot_documents
    const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
    
    const { data: existingDocs } = await supabaseAdmin
      .from('lot_documents')
      .select('original_file_name')
      .eq('lot_id', id)
      .eq('document_type', document_type)
      .like('original_file_name', `${nameWithoutExt}%`)

    if (existingDocs && existingDocs.length > 0) {
      const exactMatch = existingDocs.some(d => d.original_file_name === sanitizedName)
      if (exactMatch) {
        let maxCorrelative = 0
        const regex = new RegExp(`^${nameWithoutExt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}-(\\d+)\\.${ext}$`)
        for (const doc of existingDocs) {
          const match = doc.original_file_name.match(regex)
          if (match) {
            const num = parseInt(match[1])
            if (num > maxCorrelative) maxCorrelative = num
          }
        }
        sanitizedName = `${nameWithoutExt}-${maxCorrelative + 1}.${ext}`
      }
    }

    // 2. Cálculo de Versión Inteligente
    let versionQuery = supabaseAdmin
      .from('lot_documents')
      .select('version_number')
      .eq('lot_id', id)
      .eq('document_type', document_type)

    if (document_type === 'process') {
      // Para process, si el nombre del archivo es diferente se trata de un informe paralelo (v1)
      // Si el nombre es idéntico, se considera una corrección de ese mismo informe (v2, v3, etc.)
      versionQuery = versionQuery.eq('original_file_name', sanitizedName)
    }

    const { data: lastVersion } = await versionQuery
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    
    const version_number = (lastVersion?.version_number || 0) + 1
    const is_correction = version_number > 1

    // Ruta en Storage con versión
    const storagePath = `lotes/${lot.internal_code}/${document_type}/v${version_number}_${timestamp}_${sanitizedName}`

    // Subir a Supabase Storage usando el cliente admin (omite RLS)
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      console.error('Storage error:', storageError)
      return NextResponse.json(
        { error: `Error al guardar el archivo: ${storageError.message}` },
        { status: 500 }
      )
    }

    // Obtener URL pública del archivo
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('documentos')
      .getPublicUrl(storagePath)

    const fileUrl = publicUrlData.publicUrl

    // Guardar registro en BD. drive_file_id queda null: el archivo ya está a
    // salvo en Supabase Storage y la subida a Drive ocurre en segundo plano.
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('lot_documents')
      .insert({
        lot_id: id,
        document_type,
        original_file_name: sanitizedName, // Usamos el nombre ya saneado/renombrado
        drive_file_id: null,
        drive_file_url: null,
        storage_path: storagePath,
        storage_url: fileUrl,
        uploaded_by: userId || null,
        version_number,
        is_correction,
        status: 'uploaded',
        validation_status: 'pending',
      })
      .select()
      .single()

    if (dbError) {
      // Si falla la BD, limpiamos el archivo subido
      await supabaseAdmin.storage.from('documentos').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Actualizar de forma inteligente el estado general y de etapas del lote en base a los documentos existentes
    const statusFieldMap: Record<string, string> = {
      reception: 'reception_status',
      quality: 'quality_status',
      process: 'process_status',
    }

    if (statusFieldMap[document_type]) {
      await recalculateLotStatus(id)
    }

    // Tras responder: sincronizar a Drive (en segundo plano, con reintentos) y
    // registrar auditoría. after() corre garantizado dentro del tiempo de la
    // función; si Drive aún así fallara, el cron automático lo recupera.
    after(async () => {
      try {
        await syncDocsToDrive({ table: 'lot_documents', docId: docRecord.id })
      } catch (e: any) {
        console.error('[UPLOAD-LOTE] Drive en segundo plano falló (lo recuperará el cron):', e.message)
      }
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId || null,
        action: 'UPLOAD_DOCUMENT',
        entity_type: 'lot_documents',
        entity_id: docRecord.id,
        details: {
          lot_id: id,
          document_type,
          file_name: file.name,
          version_number,
          is_correction,
          storage_path: storagePath,
        },
      })
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })

  } catch (err: any) {
    console.error('POST /api/lotes/[id] error:', err)
    return NextResponse.json(
      { error: err.message || 'Error interno al procesar el archivo' },
      { status: 500 }
    )
  }
}
// PATCH - Editar información de un lote
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const body = await request.json()
    const { client, producer, species, variety } = body

    // Convertir campos de texto a MAYÚSCULAS
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

    const { data: lot, error } = await supabaseAdmin
      .from('lots')
      .update({
        client: clientUpper,
        producer: producerUpper,
        species: species || null,
        variety: varietyUpper,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPDATE_LOT',
      entity_type: 'lots',
      entity_id: id,
      details: { client: clientUpper, producer: producerUpper, species, variety: varietyUpper },
    })

    return NextResponse.json({ data: lot })
  } catch (err: any) {
    console.error('PATCH /api/lotes/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}

// DELETE - Eliminar un lote completo (Solo Admin)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')

    // 1. Verificación de seguridad estricta
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado. Solo administradores pueden eliminar lotes.' }, { status: 403 })
    }

    // 2. Obtener datos del lote antes de borrar
    const { data: lot, error: fetchError } = await supabaseAdmin
      .from('lots')
      .select('drive_folder_id, internal_code')
      .eq('id', id)
      .single()

    if (fetchError || !lot) {
      return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
    }

    // 3. Eliminar archivos de Supabase Storage
    const { data: docs } = await supabaseAdmin
      .from('lot_documents')
      .select('storage_path')
      .eq('lot_id', id)
    
    if (docs && docs.length > 0) {
      const pathsToDelete = docs.map(d => d.storage_path).filter(Boolean) as string[]
      if (pathsToDelete.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage.from('documentos').remove(pathsToDelete)
        if (storageError) console.error('Error limpiando storage de Supabase:', storageError)
      }
    }

    // 4. Mover carpeta de Google Drive a la Papelera
    if (lot.drive_folder_id) {
      try {
        const { trashFolder } = await import('@/lib/drive')
        await trashFolder(lot.drive_folder_id)
      } catch (driveErr) {
        console.error('Error moviendo carpeta de Drive a papelera:', driveErr)
        // No bloqueamos la eliminación de base de datos si falla Drive
      }
    }

    // 5. Eliminar el lote de la base de datos
    // Nota: lot_documents se borrará en cascada si está configurado así, sino borrará el lote.
    // Para asegurar, borramos los docs primero
    await supabaseAdmin.from('lot_documents').delete().eq('lot_id', id)
    
    const { error: deleteError } = await supabaseAdmin
      .from('lots')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Opcional: Registrar en auditoría que se eliminó el lote
    const userId = headersList.get('x-user-id')
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'DELETE_LOT',
      entity_type: 'lots',
      entity_id: id,
      details: { internal_code: lot.internal_code, deleted_at: new Date().toISOString() },
    })

    return NextResponse.json({ success: true, message: 'Lote eliminado permanentemente.' })

  } catch (err: any) {
    console.error('DELETE /api/lotes/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno al eliminar lote' }, { status: 500 })
  }
}
