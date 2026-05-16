import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile } from '@/lib/drive'

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

    // 1. Cálculo de Versión
    const { data: lastVersion } = await supabaseAdmin
      .from('lot_documents')
      .select('version_number')
      .eq('lot_id', id)
      .eq('document_type', document_type)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    
    const version_number = (lastVersion?.version_number || 0) + 1
    const is_correction = version_number > 1

    // 2. Renombrado inteligente
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = file.name.split('.').pop() || 'pdf'
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    if (document_type === 'reception') sanitizedName = `Informe Recepcion ${lot.internal_code}.${ext}`
    else if (document_type === 'quality') sanitizedName = `Informe Calidad ${lot.internal_code}.${ext}`
    else if (document_type === 'process') sanitizedName = `Informe Proceso ${lot.internal_code}.${ext}`

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

    // Determinar la carpeta destino en Drive
    const folderMap: Record<string, string | null> = {
      reception:    lot.drive_folder_reception_id,
      quality:      lot.drive_folder_quality_id,
      process:      lot.drive_folder_process_id,
      photo_process: lot.drive_folder_process_id,
      backup:       lot.drive_folder_backup_id,
      other:        lot.drive_folder_backup_id,
    }
    const targetFolderId = folderMap[document_type] || lot.drive_folder_id

    // Subir a Drive (Sincronización híbrida - No bloqueante)
    let driveFileId: string | null = null;
    let driveFileUrl: string | null = null;
    
    if (targetFolderId) {
      try {
        const driveFileName = `v${version_number}_${sanitizedName}`
        const driveFile = await uploadFile(buffer, driveFileName, file.type, targetFolderId);
        if (driveFile.id && driveFile.url) {
          driveFileId = driveFile.id;
          driveFileUrl = driveFile.url;
        }
      } catch (driveErr: any) {
        // NO lanzamos error, solo logueamos. El archivo ya está en Supabase.
        console.error("AVISO: Falló la sincronización inicial con Google Drive (Lotes):", driveErr.message);
        if (driveErr.response) console.error("Detalles API Drive:", JSON.stringify(driveErr.response.data));
      }
    }

    // Guardar registro en BD
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('lot_documents')
      .insert({
        lot_id: id,
        document_type,
        original_file_name: sanitizedName, // Usamos el nombre ya saneado/renombrado
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
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

    // Actualizar estado del lote según tipo de documento y recalcular overall_status
    const statusFieldMap: Record<string, string> = {
      reception: 'reception_status',
      quality: 'quality_status',
      process: 'process_status',
    }
    
    if (statusFieldMap[document_type]) {
      // Obtener estados actuales para recalcular
      const { data: currentLot } = await supabaseAdmin.from('lots').select('*').eq('id', id).single()
      if (currentLot) {
        const updates: any = { [statusFieldMap[document_type]]: 'uploaded' }
        
        // Lógica de estado general racionalizada
        const s1 = updates.reception_status || currentLot.reception_status
        const s2 = updates.quality_status || currentLot.quality_status
        const s3 = updates.process_status || currentLot.process_status
        
        if (s1 === 'validated' && s2 === 'validated' && s3 === 'validated') {
          updates.overall_status = 'complete'
        } else if (s1 === 'pending' && s2 === 'pending' && s3 === 'pending') {
          updates.overall_status = 'pending'
        } else {
          updates.overall_status = 'uploaded' // Significa "En proceso / Subido"
        }

        await supabaseAdmin.from('lots').update(updates).eq('id', id)
      }
    }

    // Auditoría
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

    const { data: lot, error } = await supabaseAdmin
      .from('lots')
      .update({
        client: client || null,
        producer: producer || null,
        species: species || null,
        variety: variety || null,
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
      details: { client, producer, species, variety },
    })

    return NextResponse.json({ data: lot })
  } catch (err: any) {
    console.error('PATCH /api/lotes/[id] error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
