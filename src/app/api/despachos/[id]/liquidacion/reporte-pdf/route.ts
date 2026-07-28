import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { construirInformeFinancieroPDF } from '@/lib/informe-financiero-pdf'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// INFORME FINANCIERO DEL CONTENEDOR — PDF REAL
//
// Esta ruta solo busca los datos y devuelve el archivo; todo el dibujo vive en
// `@/lib/informe-financiero-pdf`, fuera de la capa HTTP, para poder generar un
// informe de prueba con cifras inventadas sin base de datos ni sesión.
//
// Se devuelve "inline" para que el navegador lo muestre en su visor: ahí están
// la vista previa, el botón de imprimir y el de descargar para enviarlo por
// correo, fuera de la aplicación.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // La pantalla puede indicar el id exacto de la liquidación que acaba de
    // guardar. Se usa esa fila en vez de "la del despacho" para que el informe
    // nunca imprima una versión anterior si la lectura llegara antes de que la
    // escritura termine de propagarse.
    const liquidationId = new URL(request.url).searchParams.get('liq')

    // 1. Datos guardados de la liquidación
    const { data: dispatch } = await supabaseAdmin
      .from('dispatches')
      .select('id, dispatch_code, internal_code, client, destination, container_number, dispatch_date')
      .eq('id', id)
      .maybeSingle()

    if (!dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    const consultaLiq = supabaseAdmin
      .from('dispatch_liquidations')
      .select('*, items:dispatch_liquidation_items(*)')
      .eq('dispatch_id', id)

    // El filtro por dispatch_id se mantiene siempre: así un id de liquidación
    // de otro despacho no devuelve nada en vez de filtrar cifras ajenas.
    const { data: liq } = liquidationId
      ? await consultaLiq.eq('id', liquidationId).maybeSingle()
      : await consultaLiq.maybeSingle()

    if (!liq) {
      return NextResponse.json(
        { error: 'Este despacho todavía no tiene una liquidación guardada. Guarda el borrador y vuelve a intentarlo.' },
        { status: 404 }
      )
    }

    // Asegurar que la tasa de cambio exista (por defecto tasa de CLP en ~1050 si no está definida)
    if (!liq.exchange_rate || Number(liq.exchange_rate) <= 1) {
      liq.exchange_rate = liq.currency === 'CLP' ? 1 : 1050
    }

    const pdf = await construirInformeFinancieroPDF(dispatch, liq)

    const nombre = `Informe_Financiero_LIQ-${dispatch.dispatch_code}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // inline: el navegador lo muestra en su visor, con imprimir y descargar.
        'Content-Disposition': `inline; filename="${nombre}"`,
        'Content-Length': pdf.length.toString(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('[LIQUIDACION-PDF] Error:', error)
    return NextResponse.json(
      { error: 'Error al generar el informe financiero', details: error.message },
      { status: 500 }
    )
  }
}
