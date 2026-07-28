import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { construirInformeFinancieroPDF } from '@/lib/informe-financiero-pdf'
import JSZip from 'jszip'

export const maxDuration = 60

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
        id,
        internal_code,
        dispatch_code,
        client,
        destination,
        container_number,
        dispatch_date,
        dispatch_documents (
          storage_path,
          original_file_name,
          document_type,
          deleted_at
        )
      `)
      .eq('id', id)
      .single()

    if (dispatchError || !dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    const documents = (dispatch.dispatch_documents || []).filter((d: any) => !d.deleted_at)

    const filesToZip: { name: string; buffer: Buffer }[] = []

    // 1. Incluir Informe Financiero PDF si la liquidación ya ha sido guardada
    const { data: liq } = await supabaseAdmin
      .from('dispatch_liquidations')
      .select('*, items:dispatch_liquidation_items(*)')
      .eq('dispatch_id', id)
      .maybeSingle()

    if (liq) {
      try {
        if (!liq.exchange_rate || Number(liq.exchange_rate) <= 1) {
          liq.exchange_rate = liq.currency === 'CLP' ? 1 : 1050
        }
        const finPdf = await construirInformeFinancieroPDF(dispatch, liq)
        filesToZip.push({
          name: `Informe_Financiero_LIQ-${dispatch.dispatch_code || dispatch.internal_code}.pdf`,
          buffer: Buffer.from(finPdf)
        })
      } catch (finErr) {
        console.error('[ZIP-DISPATCH] Error al incluir informe financiero:', finErr)
      }
    }
    
    const DOCUMENT_TYPE_TRANSLATIONS: Record<string, string> = {
      pata_pata: 'Fotos Pata Pata',
      pata_pata_photo: 'Fotos Pata Pata',
      thermograph: 'Fotos Termógrafo',
      thermograph_photo: 'Fotos Termógrafo',
      pack_list: 'Pack List',
      invoice: 'Factura',
      factura: 'Factura',
      proforma: 'Proforma',
      loading_guide: 'Guía de Despacho',
      guia_despacho: 'Guía de Despacho',
      photos: 'Fotos de Carga',
      otros: 'Otros',
      other: 'Otros',
      backup: 'Otros',
      calidad_destino: 'Calidad en Destino'
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
      return NextResponse.json({ error: 'El despacho no tiene documentos ni liquidación' }, { status: 400 })
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
