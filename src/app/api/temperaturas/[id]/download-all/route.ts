import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import JSZip from 'jszip'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    const resolvedParams = await params;
    id = resolvedParams.id;
  } catch (e) {
    id = (params as any).id;
  }

  try {
    // 1. Obtener datos de la temperatura y sus documentos
    const { data: report, error: reportError } = await supabaseAdmin
      .from('temperature_reports')
      .select(`
        internal_code,
        temperature_documents (
          storage_path,
          original_file_name,
          document_type
        )
      `)
      .eq('id', id)
      .single()

    if (reportError || !report) {
      return NextResponse.json({ error: 'Reporte de temperatura no encontrado' }, { status: 404 })
    }

    const documents = report.temperature_documents || []
    if (documents.length === 0) {
      return NextResponse.json({ error: 'El reporte no tiene documentos' }, { status: 400 })
    }

    // 2. Descargar todos los archivos a memoria
    const filesToZip: { name: string; buffer: Buffer }[] = []
    
    const DOCUMENT_TYPE_TRANSLATIONS: Record<string, string> = {
      daily_report: 'Reporte Temperatura Diaria',
      photo: 'Foto Temperatura',
      backup: 'Otros',
      other: 'Otros'
    }

    for (const doc of documents) {
      if (!doc.storage_path) continue

      const { data, error } = await supabaseAdmin.storage
        .from('documentos')
        .download(doc.storage_path)

      if (error || !data) {
        console.warn(`[ZIP] Fallo al descargar ${doc.storage_path}`)
        continue
      }

      const arrayBuffer = await data.arrayBuffer()
      const folderKey = doc.document_type || 'other'
      const folder = DOCUMENT_TYPE_TRANSLATIONS[folderKey] || folderKey
      filesToZip.push({
        name: `${folder}/${doc.original_file_name}`,
        buffer: Buffer.from(arrayBuffer)
      })
    }

    if (filesToZip.length === 0) {
      return NextResponse.json({ error: 'No se pudieron recuperar los archivos del almacenamiento' }, { status: 500 })
    }

    // 3. Crear el ZIP en memoria usando JSZip
    const zip = new JSZip()

    for (const file of filesToZip) {
      zip.file(file.name, file.buffer)
    }

    const finalBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 5 }
    })

    // 4. Retornar el archivo zip
    return new NextResponse(finalBuffer as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Temperatura_${report.internal_code}_Archivos.zip"`,
        'Content-Length': finalBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })

  } catch (error: any) {
    console.error('[ZIP Temp] Error Crítico:', error)
    return NextResponse.json({ 
      error: 'Error interno al generar el ZIP',
      details: error.message 
    }, { status: 500 })
  }
}
