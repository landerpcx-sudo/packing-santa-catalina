import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile } from '@/lib/drive'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    const { data: dispatchRecord, error: dispatchError } = await supabaseAdmin
      .from('dispatches')
      .select('id, internal_code, dispatch_code, drive_folder_id, expected_pallets, pack_list_status, pata_pata_photos_count, thermograph_photos_count')
      .eq('id', id)
      .single()

    if (dispatchError || !dispatchRecord) {
      return NextResponse.json({ error: 'Despacho no encontrado.' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const document_type = formData.get('document_type') as string
    const folios = formData.get('folios') as string // "4402 - 4403" for pallets

    if (!file || !document_type) {
      return NextResponse.json({ error: 'Archivo y tipo de documento son requeridos.' }, { status: 400 })
    }

    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo supera el límite de 50MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    
    // 1. Renombrado inteligente
    if (document_type === 'pack_list') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Packlist ${dispatchRecord.dispatch_code}.${ext}`
    } else if (document_type === 'thermograph_photo') {
      const ext = file.name.split('.').pop() || 'jpg'
      sanitizedName = `Foto_Termografo_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'pata_pata_photo' && folios) {
      const ext = file.name.split('.').pop() || 'jpg'
      sanitizedName = `Pallet_${folios.replace(/[^a-zA-Z0-9- ]/g, '_')}.${ext}`
    }

    // 2. Cálculo de Versión
    const { data: lastVersion } = await supabaseAdmin
      .from('dispatch_documents')
      .select('version_number')
      .eq('dispatch_id', id)
      .eq('document_type', document_type)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    
    const version_number = (lastVersion?.version_number || 0) + 1

    const storagePath = `despachos/${dispatchRecord.internal_code}/${document_type}/v${version_number}_${timestamp}_${sanitizedName}`

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json({ error: `Error al guardar en storage: ${storageError.message}` }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('documentos').getPublicUrl(storagePath)
    const fileUrl = publicUrlData.publicUrl

    let driveFileId: string | null = null
    let driveFileUrl: string | null = null

    if (dispatchRecord.drive_folder_id) {
      try {
        const driveFileName = `v${version_number}_${sanitizedName}`
        const driveFile = await uploadFile(buffer, driveFileName, file.type, dispatchRecord.drive_folder_id)
        if (driveFile.id && driveFile.url) {
          driveFileId = driveFile.id
          driveFileUrl = driveFile.url
        }
      } catch (driveErr: any) {
        // NO lanzamos error, solo logueamos. El archivo ya está en Supabase.
        console.error('AVISO: Falló la sincronización inicial con Google Drive (Despachos):', driveErr.message)
        if (driveErr.response) console.error("Detalles API Drive:", JSON.stringify(driveErr.response.data));
      }
    }

    // Insertar el documento de despacho
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('dispatch_documents')
      .insert({
        dispatch_id: id,
        document_type,
        original_file_name: sanitizedName,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        storage_path: storagePath,
        storage_url: fileUrl,
        uploaded_by: userId || null,
        version_number,
        is_correction: version_number > 1,
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbError) {
      await supabaseAdmin.storage.from('documentos').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // 4. Actualizar conteos del despacho
    let packListStatus = dispatchRecord.pack_list_status
    let pataCount = dispatchRecord.pata_pata_photos_count
    let thermoCount = dispatchRecord.thermograph_photos_count

    if (document_type === 'pack_list') {
      packListStatus = 'uploaded'
      await supabaseAdmin.from('dispatches').update({ pack_list_status: 'uploaded' }).eq('id', id)
    } else if (document_type === 'pata_pata_photo' || document_type === 'thermograph_photo') {
      const { data: cur } = await supabaseAdmin
        .from('dispatches')
        .select('pata_pata_photos_count, thermograph_photos_count')
        .eq('id', id)
        .single()
      if (cur) {
        if (document_type === 'pata_pata_photo') {
          pataCount = (cur.pata_pata_photos_count as number) + 1
          await supabaseAdmin.from('dispatches').update({ pata_pata_photos_count: pataCount }).eq('id', id)
        } else {
          thermoCount = (cur.thermograph_photos_count as number) + 1
          await supabaseAdmin.from('dispatches').update({ thermograph_photos_count: thermoCount }).eq('id', id)
        }
      }
    }

    // 5. Recalcular Estado General
    const minPata = Math.ceil((dispatchRecord.expected_pallets || 0) / 2)
    
    // El despacho está completo SOLAMENTE si el Pack List está VALIDADO
    // Si solo está cargado, el estado general es 'uploaded' (En Proceso)
    const isComplete = packListStatus === 'validated' && pataCount >= minPata && thermoCount >= 2
    
    await supabaseAdmin
      .from('dispatches')
      .update({ 
        overall_status: isComplete ? 'complete' : 'uploaded',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPLOAD_DISPATCH_DOCUMENT',
      entity_type: 'dispatch_documents',
      entity_id: docRecord.id,
      details: { dispatch_id: id, document_type, file_name: sanitizedName },
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/despachos/[id]/upload error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
