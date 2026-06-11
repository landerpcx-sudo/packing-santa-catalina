import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncDocsToDrive } from '@/lib/drive-sync'

// Margen para que la sincronización a Drive en segundo plano (after()) complete.
export const maxDuration = 60

function cleanStorageKey(key: string): string {
  return key
    .normalize('NFD') // Descompone los caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Elimina los diacríticos (acentos)
    .replace(/[^a-zA-Z0-9.\/_#-]/g, '_') // Sanea todo lo que no sea seguro
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Validar que el usuario no sea un rol lector estricto para temperaturas
    if (userRole === 'gerencia' || userRole === 'agronomo') {
      return NextResponse.json({ error: 'No tienes permisos para subir archivos a este reporte.' }, { status: 403 })
    }

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
    const ext = file.name.split('.').pop() || 'jpg'
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    // Verificar colisión de nombres para aplicar correlativo en temperature_documents
    const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
    
    const { data: existingDocs } = await supabaseAdmin
      .from('temperature_documents')
      .select('original_file_name')
      .eq('temperature_report_id', id)
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

    const rawStoragePath = `temperaturas/${report.internal_code}/${document_type}/${timestamp}_${sanitizedName}`
    const storagePath = cleanStorageKey(rawStoragePath)

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

    // Registrar en BD. drive_file_id queda null: el archivo ya está a salvo en
    // Supabase Storage y la subida a Drive ocurre en segundo plano.
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('temperature_documents')
      .insert({
        temperature_report_id: id,
        document_type,
        original_file_name: file.name,
        drive_file_id: null,
        drive_file_url: null,
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

    // Tras responder: sincronizar a Drive en segundo plano (con reintentos) y
    // registrar auditoría. Si Drive fallara, el cron automático lo recupera.
    after(async () => {
      try {
        await syncDocsToDrive({ table: 'temperature_documents', docId: docRecord.id })
      } catch (e: any) {
        console.error('[UPLOAD-TEMPERATURA] Drive en segundo plano falló (lo recuperará el cron):', e.message)
      }
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId || null,
        action: 'UPLOAD_TEMPERATURE_DOCUMENT',
        entity_type: 'temperature_documents',
        entity_id: docRecord.id,
        details: { report_id: id, document_type, file_name: file.name },
      })
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/temperaturas/[id]/upload error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
