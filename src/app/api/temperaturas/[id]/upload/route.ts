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

    // Obtener el reporte
    const { data: report, error: reportError } = await supabaseAdmin
      .from('temperature_reports')
      .select('id, internal_code, report_date, drive_folder_id')
      .eq('id', id)
      .single()

    if (reportError || !report) {
      return NextResponse.json({ error: 'Reporte no encontrado.' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const document_type = formData.get('document_type') as string

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
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `temperaturas/${report.internal_code}/${document_type}/${timestamp}_${sanitizedName}`

    // Subir a Supabase Storage
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json({ error: `Error al guardar: ${storageError.message}` }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('documentos').getPublicUrl(storagePath)
    const fileUrl = publicUrlData.publicUrl

    // Subir a Google Drive
    let driveFileId: string | null = null
    let driveFileUrl: string | null = null

    if (report.drive_folder_id) {
      try {
        const driveFileName = `${report.internal_code}_${document_type}_${sanitizedName}`
        const driveFile = await uploadFile(buffer, driveFileName, file.type, report.drive_folder_id)
        if (driveFile.id && driveFile.url) {
          driveFileId = driveFile.id
          driveFileUrl = driveFile.url
        }
      } catch (driveErr: any) {
        console.error('ERROR CRÍTICO Google Drive Sync (Temperaturas):', driveErr.message)
        if (driveErr.response) console.error("Detalles API Drive:", JSON.stringify(driveErr.response.data));
      }
    }

    // Registrar en BD
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('temperature_documents')
      .insert({
        temperature_report_id: id,
        document_type,
        original_file_name: file.name,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        storage_path: storagePath,
        storage_url: fileUrl,
        uploaded_by: userId || null,
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbError) {
      await supabaseAdmin.storage.from('documentos').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Actualizar estado del reporte a 'uploaded' si tenía un archivo
    if (document_type === 'daily_report') {
      await supabaseAdmin
        .from('temperature_reports')
        .update({ status: 'uploaded' })
        .eq('id', id)
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'UPLOAD_TEMPERATURE_DOCUMENT',
      entity_type: 'temperature_documents',
      entity_id: docRecord.id,
      details: { report_id: id, document_type, file_name: file.name },
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/temperaturas/[id]/upload error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
