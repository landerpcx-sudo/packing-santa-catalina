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
    const { data: dispatch, error: dispatchError } = await supabaseAdmin
      .from('dispatches')
      .select(`
        internal_code,
        dispatch_code,
        dispatch_documents (
          storage_path,
          original_file_name,
          document_type
        )
      `)
      .eq('id', id)
      .single()

    if (dispatchError || !dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    const documents = dispatch.dispatch_documents || []
    if (documents.length === 0) {
      return NextResponse.json({ error: 'El despacho no tiene documentos' }, { status: 400 })
    }

    const filesToZip: { name: string; buffer: Buffer }[] = []
    
    const DOCUMENT_TYPE_TRANSLATIONS: Record<string, string> = {
      pata_pata: 'Fotos Pata Pata',
      thermograph: 'Fotos Termógrafo',
      invoice: 'Factura',
      loading_guide: 'Guía de Despacho',
      photos: 'Fotos de Carga',
      otros: 'Otros',
      other: 'Otros'
    }

    for (const doc of documents) {
      if (!doc.storage_path) continue

      const { data, error } = await supabaseAdmin.storage
        .from('documentos')
        .download(doc.storage_path)

      if (error || !data) continue

      const arrayBuffer = await data.arrayBuffer()
      const folderKey = doc.document_type || 'otros'
      const folder = DOCUMENT_TYPE_TRANSLATIONS[folderKey] || folderKey
      filesToZip.push({
        name: `${folder}/${doc.original_file_name}`,
        buffer: Buffer.from(arrayBuffer)
      })
    }

    if (filesToZip.length === 0) {
      return NextResponse.json({ error: 'No se pudieron recuperar los archivos' }, { status: 500 })
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

    return new NextResponse(finalBuffer as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Despacho_${dispatch.dispatch_code || dispatch.internal_code}_Documentos.zip"`,
        'Content-Length': finalBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })

  } catch (error: any) {
    console.error('[ZIP-DISPATCH] Error Crítico:', error)
    return NextResponse.json({ 
      error: 'Error interno al generar el ZIP',
      details: error.message 
    }, { status: 500 })
  }
}
