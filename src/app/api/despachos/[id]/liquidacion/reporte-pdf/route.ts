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
  verdeBorde: '#6ee7b7',
  rojo: '#b91c1c',
  rojoFondo: '#fef2f2',
  rojoBorde: '#fca5a5',
  indigo: '#4338ca',
  ambar: '#b45309',
  ambarFondo: '#fffbeb',
  teal: '#0f766e',
  tealFondo: '#f0fdfa',
  tealBorde: '#5eead4',
}

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

    const freight = Number(liq.freight_amount) || 0
    const transport = Number(liq.transport_amount) || 0
    const fleteYTransporte = freight + transport

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
    const maxUtilidadAbs = Math.max(...analisis.map((a: any) => Math.abs(a.utilidadPorCaja)), 0.01)

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

      // La versión de Roboto empaquetada pierde la 'i'/'l' cuando siguen a una
      // 'f' minúscula ("financiero" -> "fnanciero", "flete" -> "fete"):
      // PDFKit sustituye la ligadura tipográfica fi/fl y el subset de la
      // fuente no la trae completa.
      //
      // Dos intentos previos no sirvieron: un espacio de ancho cero entre
      // letras (esta fuente lo trata como espacio real: "frigorí ico") y
      // desactivar la ligadura vía `features: ['-liga']` (esta versión de
      // PDFKit lo ignora en silencio). Lo que sí funciona: partir el texto en
      // el punto exacto entre la "f" y la "i"/"l" y dibujarlo como dos
      // llamadas encadenadas con `continued: true` — el motor de fuentes
      // nunca ve ambas letras juntas en la misma pasada, así que no arma la
      // ligadura. Es el mismo patrón que ya se usa más abajo para las líneas
      // "Abonos recibidos: <monto>".
      const _text = doc.text.bind(doc)
      ;(doc as any).text = function (t: any, ...args: any[]) {
        if (typeof t !== 'string' || !/f[il]/.test(t)) return _text(t, ...args)

        const partes = t.split(/(?<=f)(?=[il])/g)
        const ultimo = args[args.length - 1]
        const tieneOpciones = ultimo && typeof ultimo === 'object' && !Array.isArray(ultimo)
        const opciones = tieneOpciones ? ultimo : {}
        const posicion = tieneOpciones ? args.slice(0, -1) : args

        let resultado: any
        partes.forEach((parte, i) => {
          const esUltimo = i === partes.length - 1
          resultado = i === 0
            ? _text(parte, ...posicion, { ...opciones, continued: !esUltimo })
            : _text(parte, { continued: !esUltimo })
        })
        return resultado
      }

      const L = 40                    // margen izquierdo
      const W = 515                   // ancho útil
      const R = L + W                 // borde derecho
      const LIMITE_Y = 780            // debajo de esto, se considera "sin espacio"

      doc.addPage()
      doc.font('R')

      const dinero = (v: number, s = simb) =>
        `${s} ${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

      const fecha = (f?: string | null) => {
        if (!f) return '—'
        const [y, m, d] = f.split('T')[0].split('-')
        return `${d}/${m}/${y}`
      }

      // Deja espacio o salta de página si no cabe lo que viene. Devuelve si
      // saltó, para poder repetir encabezados de tabla en la página nueva.
      const asegurar = (alto: number): boolean => {
        if (doc.y + alto > LIMITE_Y) {
          doc.addPage()
          doc.y = 50
          return true
        }
        return false
      }

      const nuevaPagina = () => { doc.addPage(); doc.y = 50 }

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

      // Dibuja una fila de tabla. Puede pintar una barra de progreso detrás del
      // texto de una columna (para el ranking por calibre): así el número va
      // acompañado de su propio gráfico, sin gastar una sección aparte.
      const filaTabla = (
        valores: string[],
        anchos: number[],
        opciones: {
          cabecera?: boolean; fondo?: string; negrita?: boolean; alto?: number; color?: string; tam?: number
          barra?: { columna: number; pct: number; color: string }
        } = {}
      ): boolean => {
        const alto = opciones.alto || 16
        const salto = asegurar(alto + 4)
        const y = doc.y
        if (opciones.fondo) doc.rect(L, y, W, alto).fill(opciones.fondo)

        if (opciones.barra) {
          let xBarra = L
          for (let i = 0; i < opciones.barra.columna; i++) xBarra += anchos[i]
          const anchoCelda = anchos[opciones.barra.columna]
          const anchoBarra = Math.max(2, anchoCelda * Math.min(1, Math.max(0, opciones.barra.pct)))
          doc.rect(xBarra + 2, y + alto - 3, anchoBarra - 4, 2).fill(opciones.barra.color)
        }

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
        return salto
      }

      const truncarVenta = (s: string) => (s.length > 32 ? `${s.slice(0, 29)}...` : s)

      filaTabla(cabVenta, colVenta, { cabecera: true, fondo: COLOR.fondoCabecera })
      rows.forEach((r: any, i: number) => {
        filaTabla(
          [truncarVenta(r.envase), r.calibre, r.cajas.toLocaleString('es-CL'), dinero(r.precio), dinero(r.subtotal)],
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
        ['Flete marítimo', freight],
        ['Handling / puerto', Number(liq.handling_amount) || 0],
        ['Almacén frigorífico', Number(liq.cold_storage_amount) || 0],
        ['Surveyor / inspección', Number(liq.surveyor_amount) || 0],
        ['Transporte local', transport],
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
      doc.y = yTotalGastos + 24
      doc.fillColor(COLOR.tenue).font('R').fontSize(6.3)
        .text('Incluye flete marítimo y transporte local a destino, además de comisión, handling, frío y surveyor.', L, doc.y, { width: W })
      doc.y += 12

      // ── III. RESUMEN FINANCIERO — CASCADA HASTA LA UTILIDAD FINAL ───────────
      // Fila a fila, para que se vea con toda claridad la resta del flete +
      // transporte (ya dentro de "Deducciones") y del costo FOB facturado,
      // hasta llegar a la utilidad real que le queda a la exportadora.
      tituloSeccion('III. Resumen financiero y utilidad del contenedor', COLOR.verde)

      const filaResumen = (
        etiqueta: string, valor: string,
        opciones: { color?: string; negrita?: boolean; nota?: string; tam?: number } = {}
      ) => {
        asegurar(20)
        const y = doc.y
        doc.fillColor(opciones.color || COLOR.texto).font(opciones.negrita ? 'B' : 'R').fontSize(opciones.tam || 8.5)
          .text(etiqueta, L, y, { width: 320 })
        doc.fillColor(opciones.color || COLOR.texto).font('B').fontSize(opciones.tam || 8.5)
          .text(valor, L + 320, y, { width: W - 320, align: 'right' })
        doc.y = y + (opciones.tam || 8.5) + 5
        if (opciones.nota) {
          doc.fillColor(COLOR.tenue).font('R').fontSize(6.3).text(opciones.nota, L, doc.y, { width: W })
          doc.y += 10
        }
      }

      const lineaSeparadora = () => {
        doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()
        doc.y += 6
      }

      filaResumen('Venta Bruta Total', dinero(grossSales))
      filaResumen('(-) Deducciones en Destino (incl. flete y transporte)', `- ${dinero(totalExpenses)}`, { color: COLOR.rojo })
      lineaSeparadora()
      filaResumen('(=) Importe Neto a Favor', dinero(netAmount), { negrita: true, color: COLOR.verde, tam: 9.5 })
      filaResumen(
        '(-) Costo FOB Facturado (valor de la fruta ya pagado)',
        `- ${dinero(advanceAmount, simbFob)}`,
        {
          color: COLOR.rojo,
          nota: fobCurrency !== currency
            ? `Equivalencia: 1 ${currency} = ${fobExchangeRate} ${fobCurrency}  ->  ${dinero(fobEnMonedaVenta)} en moneda de venta`
            : undefined,
        }
      )
      lineaSeparadora()

      asegurar(16)
      doc.rect(L, doc.y, W, 16).fill(COLOR.fondo)
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Abonos recibidos a factura: `, L + 8, doc.y + 5, { continued: true })
        .fillColor(COLOR.verde).font('B').text(dinero(abonosAmount, simbFob))
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Saldo pendiente de factura FOB: `, L + W / 2, doc.y + 5, { continued: true })
        .fillColor(COLOR.ambar).font('B').text(dinero(Math.max(advanceAmount - abonosAmount, 0), simbFob))
      doc.y += 22

      if (currency !== targetCurrency) {
        asegurar(14)
        doc.fillColor(COLOR.suave).font('R').fontSize(6.8)
          .text(
            `Tasa de cambio aplicada (${currency} -> ${targetCurrency}): 1 ${currency} = ${exchangeRate} ${targetCurrency}` +
            (liq.rate_provider_info ? `  ·  ${liq.rate_provider_info}` : ''),
            L, doc.y
          )
        doc.y += 14
      }

      // Cuadro destacado con el resultado final del negocio
      asegurar(50)
      const yDetalle = doc.y
      const positivo = finalBalance >= 0
      doc.rect(L, yDetalle, W, 46).fill(positivo ? COLOR.verdeFondo : COLOR.ambarFondo)
      doc.rect(L, yDetalle, W, 46).lineWidth(1).strokeColor(positivo ? COLOR.verde : COLOR.ambar).stroke()
      doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(7.5)
        .text(
          positivo
            ? '(=) UTILIDAD FINAL DEL NEGOCIO PARA LA EXPORTADORA (VENTA - GASTOS - FOB)'
            : 'RESULTADO POR DEBAJO DEL COSTO FOB FACTURADO',
          L + 12, yDetalle + 8, { width: W - 24 }
        )
      doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(19)
        .text(`${simbTarget} ${finalBalanceTarget.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${targetCurrency}`, L + 12, yDetalle + 20)
      doc.fillColor(COLOR.suave).font('R').fontSize(7)
        .text(`Equivalente: ${dinero(finalBalance)}`, R - 210, yDetalle + 28, { width: 198, align: 'right' })

      doc.y = yDetalle + 62

      // ── IV. RANKING POR CALIBRE — con barra de margen integrada ─────────────
      // Página nueva siempre: antes la tabla arrancaba a dos filas del final
      // de la página anterior y se veía cortada de forma arbitraria.
      nuevaPagina()
      tituloSeccion('IV. Rentabilidad por calibre (de mayor a menor margen)')
      doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
        .text('La barra bajo "Utilidad/caja" representa su magnitud relativa frente al mejor y peor calibre del contenedor.', L, doc.y, { width: W })
      doc.y += 10

      // Embalaje va ancho a propósito: nombres reales como "LEMONS BLANCA
      // (LE16) 15 KG" no caben en una columna angosta. Antes, con 88pt,
      // PDFKit envolvía el texto a una segunda línea que se montaba sobre la
      // fila siguiente — se ve como filas superpuestas/corridas.
      const colRank = [20, 149, 42, 56, 50, 48, 60, 90]
      const cabRank = ['#', 'Embalaje', 'Calibre', 'Cajas (%)', 'Gastos/caja', 'FOB/caja', 'Utilidad/caja', `Aporte (${targetCurrency})`]

      // Red de seguridad adicional: si aun así un nombre no entra en una
      // línea, se recorta con puntos suspensivos en vez de desbordar la fila.
      const truncar = (s: string, maxChars: number) => (s.length > maxChars ? `${s.slice(0, maxChars - 3)}...` : s)

      filaTabla(cabRank, colRank, { cabecera: true, fondo: COLOR.fondoCabecera, alto: 18 })

      analisis.forEach((a: any, i: number) => {
        // Si la fila no cabe, se rompe página ANTES de dibujarla y se repite
        // el encabezado — así nunca queda una fila "huérfana" sin sus títulos.
        if (doc.y + 20 > LIMITE_Y) {
          nuevaPagina()
          filaTabla(cabRank, colRank, { cabecera: true, fondo: COLOR.fondoCabecera, alto: 18 })
        }
        filaTabla(
          [
            `${i + 1}`,
            truncar(a.envase, 26),
            a.calibre,
            `${a.cajas.toLocaleString('es-CL')} (${a.porcentajeVolumen.toFixed(1)}%)`,
            `-${dinero(expensePerBox)}`,
            `-${dinero(fobPerBox)}`,
            `${a.utilidadPorCaja >= 0 ? '+' : ''}${dinero(a.utilidadPorCaja)}`,
            dinero(a.aporteTotal, simbTarget),
          ],
          colRank,
          {
            fondo: i % 2 === 1 ? COLOR.fondo : undefined,
            color: a.utilidadPorCaja < 0 ? COLOR.rojo : COLOR.texto,
            barra: {
              columna: 6,
              pct: Math.abs(a.utilidadPorCaja) / maxUtilidadAbs,
              color: a.utilidadPorCaja >= 0 ? COLOR.verdeBorde : COLOR.rojoBorde,
            },
          }
        )
      })

      doc.y += 14

      // Dictamen ejecutivo — resumen narrativo de la tabla anterior
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

      // ── V. MATRIZ GERENCIAL 2x2 — cuadrantes visuales de colores ────────────
      // Antes eran listas de texto plano; se restituye la matriz visual que
      // tenía la vista en pantalla, con un color por cuadrante.
      nuevaPagina()
      tituloSeccion('V. Matriz gerencial 2x2 de decisiones de cosecha')

      const cuadrantes = [
        {
          titulo: 'ESTRELLAS DE EXPORTACIÓN', sub: 'Alto volumen + alto margen',
          desc: 'Motor principal de ganancias: prioriza su venta.',
          bg: COLOR.verdeFondo, borde: COLOR.verdeBorde, texto: COLOR.verde,
          items: analisis.filter((a: any) => a.cuadrante === 'ESTRELLA'),
        },
        {
          titulo: 'NICHOS DE ALTO MARGEN', sub: 'Bajo volumen + alto margen',
          desc: 'Buen retorno unitario: conviene embalar más.',
          bg: COLOR.tealFondo, borde: COLOR.tealBorde, texto: COLOR.teal,
          items: analisis.filter((a: any) => a.cuadrante === 'NICHO'),
        },
        {
          titulo: 'VOLUMEN COMMODITY', sub: 'Alto volumen + margen estándar',
          desc: 'Mucha carga con margen ajustado: renegociar comisión y flete.',
          bg: COLOR.fondo, borde: COLOR.linea, texto: COLOR.texto,
          items: analisis.filter((a: any) => a.cuadrante === 'COMMODITY'),
        },
        {
          titulo: 'CALIBRES EN PÉRDIDA', sub: 'Resultado negativo',
          desc: 'Restan valor: renegociar precio o derivar a mercado interno.',
          bg: COLOR.rojoFondo, borde: COLOR.rojoBorde, texto: COLOR.rojo,
          items: analisis.filter((a: any) => a.cuadrante === 'PERDIDA'),
        },
      ]

      const anchoCaja = (W - 14) / 2
      const dibujarCuadrante = (x: number, y: number, w: number, h: number, c: typeof cuadrantes[number]) => {
        doc.rect(x, y, w, h).fill(c.bg)
        doc.rect(x, y, w, h).lineWidth(1).strokeColor(c.borde).stroke()
        doc.fillColor(c.texto).font('B').fontSize(7.5).text(c.titulo, x + 10, y + 8, { width: w - 20 })
        doc.fillColor(c.texto).font('R').fontSize(6).text(c.sub.toUpperCase(), x + 10, y + 19, { width: w - 20 })
        doc.fillColor(COLOR.texto).font('R').fontSize(6.5).text(c.desc, x + 10, y + 29, { width: w - 20 })
        let yItem = y + 42
        if (c.items.length === 0) {
          doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
            .text('Sin calibres en esta categoría.', x + 10, yItem, { width: w - 20 })
        } else {
          c.items.forEach((it: any) => {
            const envaseCorto = it.envase.length > 18 ? `${it.envase.slice(0, 15)}...` : it.envase
            doc.fillColor(c.texto).font('B').fontSize(6.5)
              .text(`Calibre ${it.calibre} (${envaseCorto})`, x + 10, yItem, { width: w - 90, lineBreak: false })
            doc.fillColor(c.texto).font('B').fontSize(6.5)
              .text(`${dinero(it.utilidadPorCaja)}/caja`, x + w - 82, yItem, { width: 72, align: 'right', lineBreak: false })
            yItem += 10.5
          })
        }
      }

      // Alto dinámico por fila de cuadrantes, según cuántos calibres listar.
      const altoFila = (a: typeof cuadrantes[number], b: typeof cuadrantes[number]) =>
        Math.max(70, 46 + Math.max(a.items.length, b.items.length, 1) * 10.5)

      const altoFila1 = altoFila(cuadrantes[0], cuadrantes[1])
      asegurar(altoFila1)
      let yFila = doc.y
      dibujarCuadrante(L, yFila, anchoCaja, altoFila1, cuadrantes[0])
      dibujarCuadrante(L + anchoCaja + 14, yFila, anchoCaja, altoFila1, cuadrantes[1])
      doc.y = yFila + altoFila1 + 12

      const altoFila2 = altoFila(cuadrantes[2], cuadrantes[3])
      asegurar(altoFila2)
      yFila = doc.y
      dibujarCuadrante(L, yFila, anchoCaja, altoFila2, cuadrantes[2])
      dibujarCuadrante(L + anchoCaja + 14, yFila, anchoCaja, altoFila2, cuadrantes[3])
      doc.y = yFila + altoFila2 + 20

      // ── FIRMAS ──────────────────────────────────────────────────────────────
      asegurar(60)
      const yFirma = doc.y + 20
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
