import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parsePacklistPdf, groupPacklistItems, ParsedPacklistItem } from '@/lib/packlist-parser'
import { getDriveFileStream } from '@/lib/drive'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dispatchId } = await params

    // 1. Buscar si hay ítems enviados directamente en el body o si debemos parsear el documento
    const body = await req.json().catch(() => ({}))
    let itemsToSave: ParsedPacklistItem[] = []

    if (body.manual_items && Array.isArray(body.manual_items) && body.manual_items.length > 0) {
      // Si el usuario ingresó o editó manualmente los ítems
      itemsToSave = groupPacklistItems(body.manual_items)
    } else {
      // 2. Buscar el documento de tipo 'pack_list' en el despacho
      const { data: doc, error: docErr } = await supabaseAdmin
        .from('dispatch_documents')
        .select('*')
        .eq('dispatch_id', dispatchId)
        .eq('document_type', 'pack_list')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (docErr || !doc) {
        return NextResponse.json(
          { error: 'No se encontró ningún documento de Packlist para este despacho.' },
          { status: 404 }
        )
      }

      // 3. Descargar el archivo PDF (priorizar Supabase Storage, luego Google Drive)
      let pdfBuffer: Buffer | null = null

      if (doc.storage_path) {
        const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
          .from('documentos')
          .download(doc.storage_path)
        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer()
          pdfBuffer = Buffer.from(arrayBuffer)
        } else if (downloadErr) {
          console.warn('Error descargando desde Supabase Storage, intentando Drive:', downloadErr.message)
        }
      }

      if (!pdfBuffer && doc.drive_file_id) {
        const fileStream = await getDriveFileStream(doc.drive_file_id)
        const chunks: Uint8Array[] = []
        for await (const chunk of fileStream) {
          chunks.push(chunk)
        }
        pdfBuffer = Buffer.concat(chunks)
      }

      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'No se pudo descargar el archivo PDF del Packlist desde el almacenamiento.' },
          { status: 500 }
        )
      }

      // 4. Parsear y agrupar automáticamente por embalaje y calibre
      const result = await parsePacklistPdf(pdfBuffer)

      if (!result.success || result.items.length === 0) {
        return NextResponse.json(
          {
            error: result.error || 'No se pudieron extraer automáticamente los ítems del Packlist PDF.',
            rawText: result.rawText,
            items: []
          },
          { status: 400 }
        )
      }

      itemsToSave = result.items
    }

    // 5. Borrar ítems previos y guardar los nuevos ítems de packlist agrupados
    await supabaseAdmin
      .from('dispatch_packlist_items')
      .delete()
      .eq('dispatch_id', dispatchId)

    const rowsToInsert = itemsToSave.map(item => ({
      dispatch_id: dispatchId,
      especie: item.especie,
      variedad: item.variedad,
      envase: item.envase,
      calibre: item.calibre,
      cajas: item.cajas,
      peso_neto_unitario: item.peso_neto_unitario,
      peso_neto_total: item.peso_neto_total
    }))

    const { data: insertedItems, error: insertErr } = await supabaseAdmin
      .from('dispatch_packlist_items')
      .insert(rowsToInsert)
      .select('*')

    if (insertErr) {
      console.error('Error insertando dispatch_packlist_items:', insertErr)
      return NextResponse.json(
        { error: 'Error al guardar los ítems de Packlist en la base de datos.' },
        { status: 500 }
      )
    }

    // 6. Registrar Auditoría
    await supabaseAdmin.from('audit_logs').insert({
      action: 'PARSE_PACKLIST',
      entity_type: 'dispatch',
      entity_id: dispatchId,
      details: { total_items: insertedItems.length, total_cajas: insertedItems.reduce((acc, i) => acc + i.cajas, 0) }
    })

    return NextResponse.json({
      success: true,
      message: 'Packlist procesado y agrupado correctamente.',
      items: insertedItems
    })
  } catch (err: any) {
    console.error('Error en POST /api/despachos/[id]/packlist/parse:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al procesar el Packlist.' },
      { status: 500 }
    )
  }
}
