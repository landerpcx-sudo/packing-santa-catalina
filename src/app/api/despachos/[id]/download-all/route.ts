import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
const archiver = require('archiver')

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
    
    for (const doc of documents) {
      if (!doc.storage_path) continue

      const { data, error } = await supabaseAdmin.storage
        .from('documentos')
        .download(doc.storage_path)

      if (error || !data) continue

      const arrayBuffer = await data.arrayBuffer()
      const folder = doc.document_type || 'otros'
      filesToZip.push({
        name: `${folder}/${doc.original_file_name}`,
        buffer: Buffer.from(arrayBuffer)
      })
    }

    if (filesToZip.length === 0) {
      return NextResponse.json({ error: 'No se pudieron recuperar los archivos' }, { status: 500 })
    }

    const chunks: any[] = []
    const archive = archiver('zip', { zlib: { level: 5 } })

    archive.on('data', (chunk: any) => chunks.push(chunk))
    
    const zipFinished = new Promise((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    for (const file of filesToZip) {
      archive.append(file.buffer, { name: file.name })
    }

    await archive.finalize()
    await zipFinished

    const finalBuffer = Buffer.concat(chunks)

    return new NextResponse(finalBuffer, {
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
