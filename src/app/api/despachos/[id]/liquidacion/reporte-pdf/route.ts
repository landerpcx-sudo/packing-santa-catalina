import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import PDFDocument from 'pdfkit'
import path from 'path'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// INFORME FINANCIERO DEL CONTENEDOR — PDF REAL
//
// Sustituye a html2pdf, que fotografiaba la pantalla con html2canvas: el
// resultado eran capturas dentro de un PDF (texto borroso, no seleccionable,
// tablas cortadas a la mitad) y dependía de una CDN externa.
//
// Aquí el PDF se dibuja en el servidor con PDFKit —el mismo motor y las mismas
// fuentes que ya usa el dossier del despacho—: texto vectorial nítido y
// buscable, paginación A4 controlada y cero dependencias nuevas.
//
// Se devuelve "inline" para que el navegador lo muestre en su visor: ahí están
// la vista previa, el botón de imprimir y el de descargar para enviarlo por
// correo, fuera de la aplicación.
// ─────────────────────────────────────────────────────────────────────────────

const SIMBOLOS: Record<string, string> = {
  EUR: '€', USD: '$', CLP: '$', GBP: '£', CAD: '$', BRL: 'R$', CNY: '¥',
}

// Paleta alineada con la pantalla del informe.
const COLOR = {
  tinta: '#0f172a',
  texto: '#334155',
  suave: '#64748b',
  tenue: '#94a3b8',
  linea: '#cbd5e1',
  lineaSuave: '#e2e8f0',
  fondo: '#f8fafc',
  fondoCabecera: '#f1f5f9',
  verde: '#047857',
  verdeFondo: '#ecfdf5',
  rojo: '#b91c1c',
  rojoFondo: '#fef2f2',
  indigo: '#4338ca',
  ambar: '#b45309',
  ambarFondo: '#fffbeb',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Datos guardados de la liquidación
    const { data: dispatch } = await supabaseAdmin
      .from('dispatches')
      .select('id, dispatch_code, internal_code, client, destination, container_number, dispatch_date')
      .eq('id', id)
      .maybeSingle()

    if (!dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    const { data: liq } = await supabaseAdmin
      .from('dispatch_liquidations')
      .select('*, items:dispatch_liquidation_items(*)')
      .eq('dispatch_id', id)
      .maybeSingle()

    if (!liq) {
      return NextResponse.json(
        { error: 'Este despacho todavía no tiene una liquidación guardada. Guarda el borrador y vuelve a intentarlo.' },
        { status: 404 }
      )
    }

    // 2. Preparar cifras
    const currency = liq.currency || 'EUR'
    const targetCurrency = liq.target_currency || 'USD'
    const fobCurrency = liq.fob_currency || 'CLP'
    const simb = SIMBOLOS[currency] || '$'
    const simbTarget = SIMBOLOS[targetCurrency] || '$'
    const simbFob = SIMBOLOS[fobCurrency] || '$'

    const rows = (liq.items || []).map((it: any) => ({
      envase: it.envase || '—',
      calibre: it.calibre || '—',
      cajas: Number(it.cajas) || 0,
      precio: Number(it.price_per_box) || 0,
      subtotal: Number(it.subtotal) || 0,
    }))

    const totalCajas = rows.reduce((a: number, r: any) => a + r.cajas, 0)
    const safeCajas = totalCajas > 0 ? totalCajas : 1
    const totalExpenses = Number(liq.total_expenses) || 0
    const grossSales = Number(liq.gross_sales) || 0
    const netAmount = Number(liq.net_amount) || 0
    const advanceAmount = Number(liq.advance_amount) || 0
    const abonosAmount = Number(liq.abonos_amount) || 0
    const exchangeRate = Number(liq.exchange_rate) || 1
    const fobExchangeRate = Number(liq.fob_exchange_rate) || 1
    const finalBalance = Number(liq.final_balance) || 0
    const finalBalanceTarget = finalBalance * exchangeRate

    const expensePerBox = totalExpenses / safeCajas
    const fobEnMonedaVenta =
      fobCurrency === currency ? advanceAmount : fobExchangeRate > 0 ? advanceAmount / fobExchangeRate : advanceAmount
    const fobPerBox = fobEnMonedaVenta / safeCajas
    const utilidadMediaPorCaja = finalBalance / safeCajas
    const cajasMediaPorCalibre = safeCajas / (rows.length || 1)

    // 3. Análisis por calibre (mismo criterio que la pantalla)
    const analisis = rows.map((r: any) => {
      const utilidadPorCaja = r.precio - expensePerBox - fobPerBox
      const altoVolumen = r.cajas >= cajasMediaPorCalibre
      const altoMargen = utilidadPorCaja >= utilidadMediaPorCaja

      let cuadrante: string
      if (utilidadPorCaja < 0) cuadrante = 'PERDIDA'
      else if (altoVolumen && altoMargen) cuadrante = 'ESTRELLA'
      else if (!altoVolumen && altoMargen) cuadrante = 'NICHO'
      else cuadrante = 'COMMODITY'

      return {
        ...r,
        utilidadPorCaja,
        aporteTotal: utilidadPorCaja * r.cajas * exchangeRate,
        puntoEquilibrio: expensePerBox + fobPerBox,
        porcentajeVolumen: (r.cajas / safeCajas) * 100,
        cuadrante,
      }
    })

    analisis.sort((a: any, b: any) => b.utilidadPorCaja - a.utilidadPorCaja)

    const mejor = analisis[0]
    const peor = analisis[analisis.length - 1]
    const mayorVolumen = [...analisis].sort((a: any, b: any) => b.cajas - a.cajas)[0]

    // 4. Dibujar el PDF
    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, autoFirstPage: false })
      const chunks: any[] = []
      doc.on('data', c => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Fuentes locales: en Vercel no existen las fuentes internas de PDFKit.
      try {
        doc.registerFont('R', path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf'))
        doc.registerFont('B', path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf'))
      } catch (e) {
        console.error('[LIQUIDACION-PDF] No se pudieron registrar las fuentes:', e)
      }

      const L = 40                    // margen izquierdo
      const W = 515                   // ancho útil
      const R = L + W                 // borde derecho

      doc.addPage()
      doc.font('R')

      const dinero = (v: number, s = simb) =>
        `${s} ${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

      const fecha = (f?: string | null) => {
        if (!f) return '—'
        const [y, m, d] = f.split('T')[0].split('-')
        return `${d}/${m}/${y}`
      }

      // Deja espacio o salta de página si no cabe lo que viene.
      const asegurar = (alto: number) => {
        if (doc.y + alto > 780) {
          doc.addPage()
          doc.y = 50
        }
      }

      const tituloSeccion = (texto: string, color = COLOR.indigo) => {
        asegurar(40)
        const y = doc.y
        doc.rect(L, y, 3, 13).fill(color)
        doc.fillColor(COLOR.tinta).font('B').fontSize(9.5).text(texto.toUpperCase(), L + 10, y + 2)
        doc.moveTo(L, y + 18).lineTo(R, y + 18).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()
        doc.y = y + 26
      }

      // ── ENCABEZADO ──────────────────────────────────────────────────────────
      doc.circle(L + 5, 48, 5).fill(COLOR.verde)
      doc.fillColor(COLOR.tinta).font('B').fontSize(17).text('SANTA CATALINA', L + 16, 40)
      doc.fillColor(COLOR.suave).font('B').fontSize(7)
        .text('CONTROL DOCUMENTAL & GESTIÓN FINANCIERA DE EXPORTACIONES', L + 16, 60)
      doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
        .text('Plataforma de Liquidaciones, Comercio Internacional e Inteligencia Comercial', L + 16, 70)

      const finalizada = liq.status === 'finalized'
      doc.rect(R - 200, 38, 200, 16).fill(COLOR.fondoCabecera)
      doc.fillColor(COLOR.tinta).font('B').fontSize(7)
        .text('INFORME FINANCIERO DEL CONTENEDOR', R - 200, 43, { width: 200, align: 'center' })
      doc.fillColor(COLOR.tinta).font('B').fontSize(9)
        .text(`FOLIO: LIQ-${dispatch.dispatch_code}`, R - 200, 58, { width: 200, align: 'right' })
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Emitido: ${new Date().toLocaleDateString('es-CL')}`, R - 200, 70, { width: 200, align: 'right' })

      doc.rect(R - 110, 80, 110, 13).fill(finalizada ? COLOR.verdeFondo : COLOR.ambarFondo)
      doc.fillColor(finalizada ? COLOR.verde : COLOR.ambar).font('B').fontSize(6.5)
        .text(finalizada ? 'DOCUMENTO FINALIZADO' : 'BORRADOR DE LIQUIDACIÓN', R - 110, 84, { width: 110, align: 'center' })

      doc.moveTo(L, 100).lineTo(R, 100).lineWidth(1.5).strokeColor(COLOR.tinta).stroke()

      // ── DATOS DEL DESPACHO ──────────────────────────────────────────────────
      doc.rect(L, 110, W, 40).fill(COLOR.fondo)
      doc.rect(L, 110, W, 40).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()

      const datos = [
        ['CLIENTE / EXPORTADOR', dispatch.client || '—'],
        ['Nº DE CONTENEDOR', dispatch.container_number || '—'],
        ['MERCADO / DESTINO', dispatch.destination || '—'],
        ['FECHA DE SALIDA', fecha(dispatch.dispatch_date)],
      ]
      datos.forEach(([etiqueta, valor], i) => {
        const x = L + 10 + i * (W / 4)
        doc.fillColor(COLOR.tenue).font('B').fontSize(6).text(etiqueta, x, 119, { width: W / 4 - 12 })
        doc.fillColor(COLOR.tinta).font('B').fontSize(8.5).text(valor, x, 130, { width: W / 4 - 12, lineBreak: false })
      })

      doc.y = 165

      // ── I. VENTA POR EMBALAJE Y CALIBRE ─────────────────────────────────────
      tituloSeccion(`I. Venta de fruta por embalaje y calibre (${currency})`)

      const colVenta = [150, 70, 75, 105, 115]
      const cabVenta = ['Envase / Embalaje', 'Calibre', 'Cajas', `Precio / caja (${simb})`, `Subtotal (${simb})`]

      const filaTabla = (
        valores: string[],
        anchos: number[],
        opciones: { cabecera?: boolean; fondo?: string; negrita?: boolean; alto?: number; color?: string; tam?: number } = {}
      ) => {
        const alto = opciones.alto || 16
        asegurar(alto + 4)
        const y = doc.y
        if (opciones.fondo) doc.rect(L, y, W, alto).fill(opciones.fondo)

        let x = L
        valores.forEach((v, i) => {
          const alinear = i === 0 || (i === 1 && anchos.length === 5) ? 'left' : 'right'
          doc
            .fillColor(opciones.color || (opciones.cabecera ? COLOR.tinta : COLOR.texto))
            .font(opciones.cabecera || opciones.negrita ? 'B' : 'R')
            .fontSize(opciones.tam || (opciones.cabecera ? 6.8 : 7.6))
            .text(v, x + 5, y + (alto - 8) / 2, { width: anchos[i] - 10, align: alinear as any, lineBreak: false })
          x += anchos[i]
        })

        doc.moveTo(L, y + alto).lineTo(R, y + alto).lineWidth(0.4).strokeColor(COLOR.lineaSuave).stroke()
        doc.y = y + alto
      }

      filaTabla(cabVenta, colVenta, { cabecera: true, fondo: COLOR.fondoCabecera })
      rows.forEach((r: any, i: number) => {
        filaTabla(
          [r.envase, r.calibre, r.cajas.toLocaleString('es-CL'), dinero(r.precio), dinero(r.subtotal)],
          colVenta,
          { fondo: i % 2 === 1 ? COLOR.fondo : undefined }
        )
      })
      filaTabla(
        [`TOTAL VENTA BRUTA (${currency})`, '', `${totalCajas.toLocaleString('es-CL')} cajas`, '', dinero(grossSales)],
        colVenta,
        { negrita: true, fondo: COLOR.fondoCabecera, color: COLOR.tinta, alto: 18 }
      )

      doc.y += 14

      // ── II. GASTOS EN DESTINO ───────────────────────────────────────────────
      tituloSeccion(`II. Gastos operativos y deducciones en destino (${currency})`, COLOR.rojo)

      const gastos: [string, number][] = [
        [`Comisión de venta (${Number(liq.commission_percentage) || 0}%)`, Number(liq.commission_amount) || 0],
        ['Flete marítimo', Number(liq.freight_amount) || 0],
        ['Handling / puerto', Number(liq.handling_amount) || 0],
        ['Almacén frigorífico', Number(liq.cold_storage_amount) || 0],
        ['Surveyor / inspección', Number(liq.surveyor_amount) || 0],
        ['Transporte local', Number(liq.transport_amount) || 0],
        ['Otros gastos', Number(liq.other_expenses) || 0],
      ]

      asegurar(80)
      const yGastos = doc.y
      const anchoCol = W / 2
      gastos.forEach(([etiqueta, monto], i) => {
        const x = L + (i % 2) * anchoCol
        const y = yGastos + Math.floor(i / 2) * 15
        doc.fillColor(COLOR.suave).font('R').fontSize(7.5).text(etiqueta, x + 4, y, { width: anchoCol - 90 })
        doc.fillColor(COLOR.texto).font('B').fontSize(7.5)
          .text(dinero(monto), x + anchoCol - 105, y, { width: 100, align: 'right', lineBreak: false })
      })

      const yTotalGastos = yGastos + Math.ceil(gastos.length / 2) * 15 + 4
      doc.rect(L, yTotalGastos, W, 18).fill(COLOR.rojoFondo)
      doc.fillColor(COLOR.rojo).font('B').fontSize(7.5).text('TOTAL DEDUCCIONES EN DESTINO', L + 8, yTotalGastos + 5)
      doc.fillColor(COLOR.rojo).font('B').fontSize(9)
        .text(`- ${dinero(totalExpenses)}`, R - 160, yTotalGastos + 4, { width: 152, align: 'right' })
      doc.y = yTotalGastos + 32

      // ── III. RESUMEN FINANCIERO ─────────────────────────────────────────────
      tituloSeccion('III. Resumen financiero y utilidad del contenedor', COLOR.verde)

      asegurar(120)
      const yRes = doc.y
      const resumen: [string, string, string][] = [
        ['VENTA BRUTA TOTAL', dinero(grossSales), COLOR.tinta],
        ['(-) DEDUCCIONES DESTINO', `- ${dinero(totalExpenses)}`, COLOR.rojo],
        ['(=) IMPORTE NETO A FAVOR', dinero(netAmount), COLOR.verde],
        ['(-) VALOR FOB FACTURADO', dinero(advanceAmount, simbFob), COLOR.tinta],
      ]
      resumen.forEach(([etiqueta, valor, color], i) => {
        const x = L + i * (W / 4)
        doc.fillColor(COLOR.tenue).font('B').fontSize(5.8).text(etiqueta, x, yRes, { width: W / 4 - 8 })
        doc.fillColor(color).font('B').fontSize(9).text(valor, x, yRes + 10, { width: W / 4 - 8, lineBreak: false })
      })

      let yDetalle = yRes + 30
      if (fobCurrency !== currency) {
        doc.fillColor(COLOR.suave).font('R').fontSize(6.5)
          .text(`Equivalencia factura FOB: 1 ${currency} = ${fobExchangeRate} ${fobCurrency}  ·  ${dinero(fobEnMonedaVenta)} en moneda de venta`, L, yDetalle)
        yDetalle += 12
      }

      doc.rect(L, yDetalle, W, 16).fill(COLOR.fondo)
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Abonos recibidos a factura: `, L + 8, yDetalle + 5, { continued: true })
        .fillColor(COLOR.verde).font('B').text(dinero(abonosAmount, simbFob))
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Saldo pendiente de factura FOB: `, L + W / 2, yDetalle + 5, { continued: true })
        .fillColor(COLOR.ambar).font('B').text(dinero(Math.max(advanceAmount - abonosAmount, 0), simbFob))
      yDetalle += 22

      if (currency !== targetCurrency) {
        doc.fillColor(COLOR.suave).font('R').fontSize(6.8)
          .text(
            `Tasa de cambio aplicada (${currency} → ${targetCurrency}): 1 ${currency} = ${exchangeRate} ${targetCurrency}` +
            (liq.rate_provider_info ? `  ·  ${liq.rate_provider_info}` : ''),
            L, yDetalle
          )
        yDetalle += 14
      }

      // Cuadro destacado con el resultado del negocio
      const positivo = finalBalance >= 0
      doc.rect(L, yDetalle, W, 46).fill(positivo ? COLOR.verdeFondo : COLOR.ambarFondo)
      doc.rect(L, yDetalle, W, 46).lineWidth(1).strokeColor(positivo ? COLOR.verde : COLOR.ambar).stroke()
      doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(7.5)
        .text(
          positivo ? 'UTILIDAD NETA TOTAL DEL CONTENEDOR (A FAVOR DEL EXPORTADOR)' : 'RESULTADO POR DEBAJO DEL COSTO FOB FACTURADO',
          L + 12, yDetalle + 8
        )
      doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(19)
        .text(`${simbTarget} ${finalBalanceTarget.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${targetCurrency}`, L + 12, yDetalle + 20)
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Equivalente: ${dinero(finalBalance)}`, R - 210, yDetalle + 28, { width: 198, align: 'right' })

      doc.y = yDetalle + 62

      // ── IV. RANKING POR CALIBRE ─────────────────────────────────────────────
      tituloSeccion('IV. Rentabilidad por calibre (de mayor a menor margen)')

      const colRank = [26, 96, 52, 66, 62, 62, 68, 83]
      filaTabla(
        ['#', 'Embalaje', 'Calibre', 'Cajas (%)', 'Gastos/caja', 'FOB/caja', `Utilidad/caja`, `Aporte (${targetCurrency})`],
        colRank,
        { cabecera: true, fondo: COLOR.fondoCabecera, alto: 18 }
      )

      analisis.forEach((a: any, i: number) => {
        filaTabla(
          [
            `${i + 1}`,
            a.envase,
            a.calibre,
            `${a.cajas.toLocaleString('es-CL')} (${a.porcentajeVolumen.toFixed(1)}%)`,
            `-${dinero(expensePerBox)}`,
            `-${dinero(fobPerBox)}`,
            `${a.utilidadPorCaja >= 0 ? '+' : ''}${dinero(a.utilidadPorCaja)}`,
            dinero(a.aporteTotal, simbTarget),
          ],
          colRank,
          { fondo: i % 2 === 1 ? COLOR.fondo : undefined, color: a.utilidadPorCaja < 0 ? COLOR.rojo : COLOR.texto }
        )
      })

      doc.y += 14

      // ── V. LECTURA GERENCIAL ────────────────────────────────────────────────
      tituloSeccion('V. Lectura gerencial y decisiones de cosecha')

      const grupos: [string, string, string[]][] = [
        ['ESTRELLAS DE EXPORTACIÓN', 'Alto volumen y alto margen: el motor de ganancias del despacho.',
          analisis.filter((a: any) => a.cuadrante === 'ESTRELLA').map((a: any) => `Calibre ${a.calibre} (${a.envase}) · ${dinero(a.utilidadPorCaja)}/caja · ${a.cajas} cajas`)],
        ['NICHOS DE ALTO MARGEN', 'Excelente margen unitario pero poco volumen: conviene embalar más.',
          analisis.filter((a: any) => a.cuadrante === 'NICHO').map((a: any) => `Calibre ${a.calibre} (${a.envase}) · ${dinero(a.utilidadPorCaja)}/caja · ${a.cajas} cajas`)],
        ['VOLUMEN COMMODITY', 'Mucha carga con margen ajustado: renegociar comisión y flete.',
          analisis.filter((a: any) => a.cuadrante === 'COMMODITY').map((a: any) => `Calibre ${a.calibre} (${a.envase}) · ${dinero(a.utilidadPorCaja)}/caja · ${a.cajas} cajas`)],
        ['CALIBRES EN PÉRDIDA', 'Restan valor: renegociar precio mínimo o derivar a mercado interno.',
          analisis.filter((a: any) => a.cuadrante === 'PERDIDA').map((a: any) => `Calibre ${a.calibre} (${a.envase}) · ${dinero(a.utilidadPorCaja)}/caja · ${a.cajas} cajas`)],
      ]

      grupos.forEach(([titulo, explicacion, lineas]) => {
        asegurar(30 + lineas.length * 10)
        const esPerdida = titulo.includes('PÉRDIDA')
        doc.fillColor(esPerdida ? COLOR.rojo : COLOR.tinta).font('B').fontSize(7.5).text(titulo, L + 4, doc.y)
        doc.fillColor(COLOR.suave).font('R').fontSize(6.8).text(explicacion, L + 4, doc.y + 1)
        if (lineas.length === 0) {
          doc.fillColor(COLOR.tenue).font('R').fontSize(7)
            .text(esPerdida ? 'Ningún calibre registró pérdida en este contenedor.' : 'Sin calibres en esta categoría.', L + 12, doc.y + 2)
        } else {
          lineas.forEach(linea => {
            doc.fillColor(COLOR.texto).font('R').fontSize(7).text(`•  ${linea}`, L + 12, doc.y + 1)
          })
        }
        doc.y += 8
      })

      // Dictamen
      asegurar(70)
      const yDic = doc.y
      doc.rect(L, yDic, W, 58).fill(COLOR.fondo)
      doc.rect(L, yDic, W, 58).lineWidth(0.5).strokeColor(COLOR.linea).stroke()
      doc.fillColor(COLOR.indigo).font('B').fontSize(7).text('DICTAMEN EJECUTIVO', L + 10, yDic + 7)
      doc.fillColor(COLOR.texto).font('R').fontSize(7.2).text(
        `La carga se concentra en el calibre ${mayorVolumen?.calibre || '—'} ` +
        `(${mayorVolumen?.cajas || 0} cajas, ${(mayorVolumen?.porcentajeVolumen || 0).toFixed(1)}% del lote), ` +
        `con un promedio de ${cajasMediaPorCalibre.toFixed(0)} cajas por tamaño. ` +
        `El mejor retorno unitario lo entregó el calibre ${mejor?.calibre || '—'} (${dinero(mejor?.utilidadPorCaja || 0)} por caja), ` +
        `con una diferencia de ${dinero((mejor?.utilidadPorCaja || 0) - (peor?.utilidadPorCaja || 0))} respecto del más bajo. ` +
        `Utilidad promedio del contenedor: ${dinero(utilidadMediaPorCaja)} por caja sobre ${totalCajas.toLocaleString('es-CL')} cajas embarcadas.`,
        L + 10, yDic + 19, { width: W - 20, align: 'justify' }
      )
      doc.y = yDic + 70

      // ── FIRMAS ──────────────────────────────────────────────────────────────
      asegurar(60)
      const yFirma = Math.max(doc.y + 20, 700)
      doc.moveTo(L + 30, yFirma).lineTo(L + 210, yFirma).lineWidth(0.5).strokeColor(COLOR.tenue).stroke()
      doc.moveTo(R - 210, yFirma).lineTo(R - 30, yFirma).lineWidth(0.5).strokeColor(COLOR.tenue).stroke()
      doc.fillColor(COLOR.texto).font('B').fontSize(7)
        .text('Emisión & Control Financiero', L + 30, yFirma + 6, { width: 180, align: 'center' })
        .text('Conformidad Cliente / Exportador', R - 210, yFirma + 6, { width: 180, align: 'center' })
      doc.fillColor(COLOR.tenue).font('R').fontSize(6)
        .text('Packing Santa Catalina S.A.', L + 30, yFirma + 17, { width: 180, align: 'center' })
        .text(dispatch.client || 'Firma de aceptación', R - 210, yFirma + 17, { width: 180, align: 'center' })

      // ── PIE DE PÁGINA EN TODAS LAS PÁGINAS ──────────────────────────────────
      const rango = doc.bufferedPageRange()
      for (let i = rango.start; i < rango.start + rango.count; i++) {
        doc.switchToPage(i)
        const margenPrevio = doc.page.margins.bottom
        doc.page.margins.bottom = 10

        doc.moveTo(L, 800).lineTo(R, 800).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()
        doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
          .text(`Informe financiero LIQ-${dispatch.dispatch_code} · Packing Santa Catalina`, L, 807, { width: 350 })
        doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
          .text(`Página ${i + 1} de ${rango.count}`, L, 807, { width: W, align: 'right' })

        doc.page.margins.bottom = margenPrevio
      }

      doc.end()
    })

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
