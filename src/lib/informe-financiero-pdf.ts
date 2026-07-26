import PDFDocument from 'pdfkit'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// INFORME FINANCIERO DEL CONTENEDOR — DIBUJO DEL PDF
//
// Vive fuera de la ruta HTTP a propósito: así se puede generar un informe de
// prueba con cifras inventadas y abrirlo, sin tocar la base de datos ni montar
// una sesión. Un rediseño de este documento no se da por bueno hasta haberlo
// visto generado de verdad.
//
// El PDF se dibuja con PDFKit —el mismo motor y las mismas fuentes que ya usa
// el dossier del despacho—: texto vectorial nítido y buscable, paginación A4
// controlada y cero dependencias nuevas. Sustituye a html2pdf, que fotografiaba
// la pantalla con html2canvas (texto borroso, tablas cortadas y una CDN externa).
// ─────────────────────────────────────────────────────────────────────────────

export interface DespachoInforme {
  id?: string
  dispatch_code?: string | null
  internal_code?: string | null
  client?: string | null
  destination?: string | null
  container_number?: string | null
  dispatch_date?: string | null
}

/** La fila de `dispatch_liquidations` con sus `items`, tal cual sale de Supabase. */
export type LiquidacionInforme = Record<string, any>


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

export async function construirInformeFinancieroPDF(
  dispatch: DespachoInforme,
  liq: LiquidacionInforme
): Promise<Buffer> {
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
    const destNet = r.precio - expensePerBox
    const utilidadPorCaja = r.precio - expensePerBox - fobPerBox
    const altoVolumen = r.cajas >= cajasMediaPorCalibre
    const altoMargen = utilidadPorCaja >= utilidadMediaPorCaja

    // Retorno estimado al productor por caja en CLP (Neto Destino x Tasa Cambio FOB)
    const retornoProductorCLP = destNet * (fobExchangeRate || 1000)
    const utilidadPorCajaTarget = utilidadPorCaja * exchangeRate

    let cuadrante: string
    if (utilidadPorCaja < 0) cuadrante = 'PERDIDA'
    else if (altoVolumen && altoMargen) cuadrante = 'ESTRELLA'
    else if (!altoVolumen && altoMargen) cuadrante = 'NICHO'
    else cuadrante = 'COMMODITY'

    return {
      ...r,
      destNet,
      utilidadPorCaja,
      utilidadPorCajaTarget,
      retornoProductorCLP,
      aporteTotal: utilidadPorCaja * r.cajas * exchangeRate,
      aporteTotalCLP: utilidadPorCaja * r.cajas * exchangeRate * (fobExchangeRate || 1000),
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

    // Porcentaje con coma decimal: es un documento en español que se envía a
    // clientes; `toFixed` deja punto ("31.6%") y desentona con las cifras de
    // dinero, que sí van formateadas en es-CL.
    const pct = (v: number, decimales = 1) =>
      `${v.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`

    const dinero = (v: number, s = simb) =>
      `${s} ${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const clp = (v: number) =>
      `$ ${Math.round(v).toLocaleString('es-CL')} CLP`

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

    // ── ENCABEZADO CON LOGOS ────────────────────────────────────────────────
    // Intento de carga del logo del cliente (The Growers Club)
    let clientLogoPath: string | null = null
    const posiblesRutas = [
      path.join(process.cwd(), 'the growers club.png'),
      path.join(process.cwd(), '..', 'the growers club.png'),
      path.join(process.cwd(), 'public', 'the growers club.png'),
    ]
    for (const r of posiblesRutas) {
      try {
        if (require('fs').existsSync(r)) {
          clientLogoPath = r
          break
        }
      } catch {}
    }

    doc.circle(L + 5, 48, 5).fill(COLOR.verde)
    doc.fillColor(COLOR.tinta).font('B').fontSize(16).text('SANTA CATALINA', L + 16, 38)
    doc.fillColor(COLOR.suave).font('B').fontSize(6.5)
      .text('CONTROL DOCUMENTAL & GESTIÓN FINANCIERA DE EXPORTACIONES', L + 16, 57)
    doc.fillColor(COLOR.tenue).font('R').fontSize(6)
      .text('Plataforma de Liquidaciones, Comercio Internacional e Inteligencia Comercial', L + 16, 67)

    // Dibujar logo del cliente si existe
    if (clientLogoPath) {
      try {
        doc.image(clientLogoPath, R - 130, 36, { height: 26 })
      } catch (e) {
        console.error('Error al incrustar logo del cliente en PDF:', e)
      }
    }

    const finalizada = liq.status === 'finalized'
    doc.rect(R - 190, 68, 190, 14).fill(COLOR.fondoCabecera)
    doc.fillColor(COLOR.tinta).font('B').fontSize(6.5)
      .text('INFORME FINANCIERO DEL CONTENEDOR', R - 190, 72, { width: 190, align: 'center' })
    doc.fillColor(COLOR.tinta).font('B').fontSize(8.5)
      .text(`FOLIO: LIQ-${dispatch.dispatch_code}`, R - 190, 84, { width: 190, align: 'right' })
    doc.fillColor(COLOR.suave).font('R').fontSize(6.5)
      .text(`Emitido: ${new Date().toLocaleDateString('es-CL')}`, R - 190, 94, { width: 190, align: 'right' })

    doc.rect(L, 102, 110, 13).fill(finalizada ? COLOR.verdeFondo : COLOR.ambarFondo)
    doc.fillColor(finalizada ? COLOR.verde : COLOR.ambar).font('B').fontSize(6.5)
      .text(finalizada ? 'DOCUMENTO FINALIZADO' : 'BORRADOR DE LIQUIDACIÓN', L, 106, { width: 110, align: 'center' })

    doc.moveTo(L, 118).lineTo(R, 118).lineWidth(1.2).strokeColor(COLOR.tinta).stroke()

    // ── DATOS DEL DESPACHO ──────────────────────────────────────────────────
    doc.rect(L, 124, W, 36).fill(COLOR.fondo)
    doc.rect(L, 124, W, 36).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()

    const datos = [
      ['CLIENTE / EXPORTADOR', dispatch.client || '—'],
      ['Nº DE CONTENEDOR', dispatch.container_number || '—'],
      ['MERCADO / DESTINO', dispatch.destination || '—'],
      ['FECHA DE SALIDA', fecha(dispatch.dispatch_date)],
    ]
    datos.forEach(([etiqueta, valor], i) => {
      const x = L + 10 + i * (W / 4)
      doc.fillColor(COLOR.tenue).font('B').fontSize(5.8).text(etiqueta, x, 130, { width: W / 4 - 12 })
      doc.fillColor(COLOR.tinta).font('B').fontSize(8).text(valor, x, 141, { width: W / 4 - 12, lineBreak: false })
    })

    doc.y = 168

    // ── PORTADA EJECUTIVA ───────────────────────────────────────────────────
    const marcador = (titulo: string) => {
      try { doc.outline.addItem(titulo) } catch { /* el índice es un extra */ }
    }

    marcador('Resumen ejecutivo')
    tituloSeccion('Resumen ejecutivo del contenedor', COLOR.verde)

    // Saneamiento de Tasas de Cambio Inmutables (Evita bugs donde 1 EUR -> USD tomaba la tasa de CLP)
    const tasaSaleToTarget = (targetCurrency === 'USD' && exchangeRate > 5) ? 1.1377 : (exchangeRate || 1)
    const finalBalanceTargetUSD = currency === targetCurrency ? finalBalance : finalBalance * tasaSaleToTarget
    const tasaCLPOtorgada = (fobExchangeRate > 100) ? fobExchangeRate : (exchangeRate > 100 ? exchangeRate : 1075.0248)
    const utilidadTotalCLPEst = finalBalance * tasaCLPOtorgada
    const ingresoNetoPromedioCLP = (netAmount * tasaCLPOtorgada) / safeCajas

    const saldoFob = Math.max(advanceAmount - abonosAmount, 0)
    const facturaPagada = saldoFob <= 0 && advanceAmount > 0
    const rentable = finalBalance >= 0
    const margenPct = grossSales > 0 ? (finalBalance / grossSales) * 100 : 0

    const tarjetas: Array<{ etiqueta: string; cifra: string; pie: string; color: string; fondo: string }> = [
      {
        etiqueta: 'VENTA BRUTA DESTINO',
        cifra: dinero(grossSales),
        pie: `${totalCajas.toLocaleString('es-CL')} cajas · ${dinero(grossSales * tasaSaleToTarget, simbTarget)} ${targetCurrency}`,
        color: COLOR.indigo, fondo: COLOR.fondo,
      },
      {
        etiqueta: rentable ? 'UTILIDAD EXPORTADOR' : 'PÉRDIDA DEL NEGOCIO',
        cifra: `${simbTarget} ${finalBalanceTargetUSD.toLocaleString('es-CL', { maximumFractionDigits: 0 })} ${targetCurrency}`,
        pie: `Tot. CLP: ${clp(utilidadTotalCLPEst)}`,
        color: rentable ? COLOR.verde : COLOR.rojo,
        fondo: rentable ? COLOR.verdeFondo : COLOR.rojoFondo,
      },
      {
        etiqueta: 'ING. NETO PROMEDIO DESTINO',
        cifra: clp(ingresoNetoPromedioCLP),
        pie: `Neto Venta: ${dinero(netAmount / safeCajas)} / cj`,
        color: COLOR.teal,
        fondo: COLOR.tealFondo,
      },
      {
        etiqueta: facturaPagada ? 'FACTURA FOB' : 'SALDO FACTURA FOB',
        cifra: facturaPagada ? 'PAGADA' : dinero(saldoFob, simbFob),
        pie: facturaPagada
          ? `Cobrada: ${dinero(advanceAmount, simbFob)}`
          : `Facturado: ${dinero(advanceAmount, simbFob)}`,
        color: facturaPagada ? COLOR.verde : COLOR.ambar,
        fondo: facturaPagada ? COLOR.verdeFondo : COLOR.ambarFondo,
      },
    ]

    const anchoTarjeta = (W - 3 * 9) / 4
    const yTarjetas = doc.y
    tarjetas.forEach((t, i) => {
      const x = L + i * (anchoTarjeta + 9)
      doc.rect(x, yTarjetas, anchoTarjeta, 66).fill(t.fondo)
      doc.rect(x, yTarjetas, anchoTarjeta, 66).lineWidth(0.8).strokeColor(t.color).stroke()
      // Filete de color arriba
      doc.rect(x, yTarjetas, anchoTarjeta, 3).fill(t.color)
      doc.fillColor(COLOR.suave).font('B').fontSize(5.8)
        .text(t.etiqueta, x + 6, yTarjetas + 11, { width: anchoTarjeta - 12, lineBreak: false })
      
      // AUTO-FONT SIZE TO PREVENT TEXT OVERLAP!
      let fontSize = 13
      if (t.cifra.length > 17) fontSize = 9.5
      else if (t.cifra.length > 13) fontSize = 11
      else if (t.cifra.length > 10) fontSize = 12

      doc.fillColor(t.color).font('B').fontSize(fontSize)
        .text(t.cifra, x + 6, yTarjetas + 27, { width: anchoTarjeta - 12, lineBreak: false })
      
      doc.fillColor(COLOR.tenue).font('R').fontSize(5.6)
        .text(t.pie, x + 6, yTarjetas + 50, { width: anchoTarjeta - 12, lineBreak: false })
    })
    doc.y = yTarjetas + 78

    // Semáforo de rentabilidad: tres tramos y una marca sobre el que aplica.
    const tramos = [
      { etiqueta: 'PÉRDIDA', desc: 'Por debajo del costo FOB', color: COLOR.rojo, fondo: COLOR.rojoFondo, activo: margenPct < 0 },
      { etiqueta: 'AJUSTADO', desc: 'Margen inferior al 10%', color: COLOR.ambar, fondo: COLOR.ambarFondo, activo: margenPct >= 0 && margenPct < 10 },
      { etiqueta: 'RENTABLE', desc: 'Margen del 10% o superior', color: COLOR.verde, fondo: COLOR.verdeFondo, activo: margenPct >= 10 },
    ]
    const yTramos = doc.y
    const anchoTramo = (W - 2 * 8) / 3
    tramos.forEach((t, i) => {
      const x = L + i * (anchoTramo + 8)
      doc.rect(x, yTramos, anchoTramo, 30).fill(t.activo ? t.fondo : COLOR.fondo)
      doc.rect(x, yTramos, anchoTramo, 30).lineWidth(t.activo ? 1.4 : 0.5)
        .strokeColor(t.activo ? t.color : COLOR.lineaSuave).stroke()
      doc.circle(x + 13, yTramos + 15, 5).fill(t.activo ? t.color : COLOR.lineaSuave)
      doc.fillColor(t.activo ? t.color : COLOR.tenue).font('B').fontSize(7.5)
        .text(t.etiqueta, x + 24, yTramos + 8, { width: anchoTramo - 32, lineBreak: false })
      doc.fillColor(COLOR.tenue).font('R').fontSize(5.8)
        .text(t.desc, x + 24, yTramos + 18, { width: anchoTramo - 32, lineBreak: false })
    })
    doc.fillColor(COLOR.suave).font('R').fontSize(6.5).text(
      `Margen del contenedor sobre la venta bruta: ${pct(margenPct)}.`,
      L, yTramos + 36, { width: W }
    )
    doc.y = yTramos + 54

    // Cascada financiera: el estándar de los informes de exportación.
    tituloSeccion('De la venta bruta a la utilidad final', COLOR.verde)
    const altoGrafico = 118
    asegurar(altoGrafico + 46)
    const yTopCascada = doc.y
    const yBaseCascada = yTopCascada + altoGrafico

    const pasos = [
      { etiqueta: 'Venta Bruta', desde: 0, hasta: grossSales, color: COLOR.indigo, total: true },
      { etiqueta: 'Deducciones', desde: netAmount, hasta: grossSales, color: COLOR.rojo, total: false },
      { etiqueta: 'Costo FOB', desde: finalBalance, hasta: netAmount, color: COLOR.ambar, total: false },
      {
        etiqueta: 'Utilidad Final', desde: 0, hasta: finalBalance,
        color: finalBalance >= 0 ? COLOR.verde : COLOR.rojo, total: true,
      },
    ]

    const maxCascada = Math.max(grossSales, netAmount, finalBalance, 0)
    const minCascada = Math.min(finalBalance, netAmount, 0)
    const rangoCascada = maxCascada - minCascada || 1
    const aireEtiquetas = 14
    const escala = (altoGrafico - aireEtiquetas) / rangoCascada
    const yValor = (v: number) => yBaseCascada - (v - minCascada) * escala

    const yCero = yValor(0)
    doc.moveTo(L, yCero).lineTo(R, yCero).lineWidth(0.6).strokeColor(COLOR.linea).stroke()

    const anchoPaso = W / pasos.length
    const anchoBarra = anchoPaso * 0.5
    pasos.forEach((p, i) => {
      const xCentro = L + anchoPaso * i + anchoPaso / 2
      const x = xCentro - anchoBarra / 2
      const yArriba = yValor(Math.max(p.desde, p.hasta))
      const alto = Math.max(1.5, Math.abs(yValor(p.desde) - yValor(p.hasta)))

      doc.rect(x, yArriba, anchoBarra, alto).fill(p.color)
      if (!p.total) doc.rect(x, yArriba, anchoBarra, alto).lineWidth(0.5).strokeColor(p.color).stroke()

      const monto = p.total ? p.hasta : -(p.hasta - p.desde)
      doc.fillColor(p.color).font('B').fontSize(7.5)
        .text(`${monto >= 0 ? '' : '-'}${dinero(Math.abs(monto))}`, xCentro - anchoPaso / 2, yArriba - 11, {
          width: anchoPaso, align: 'center', lineBreak: false,
        })
    })

    doc.fillColor(COLOR.tenue).font('R').fontSize(6.3).text(
      `Cifras en ${currency}. Cada bloque continúa donde termina el anterior: de la venta bruta se descuentan las deducciones en destino y el costo FOB de la fruta hasta llegar a la utilidad final.`,
      L, yBaseCascada + 10, { width: W }
    )
    doc.y = yBaseCascada + 24

    marcador('Calibres destacados')
    tituloSeccion('Calibres que más aportaron a la utilidad', COLOR.indigo)
    const altoRanking = 85
    asegurar(altoRanking + 20)
    const yTopRank = doc.y

    const topCalibres = analisis.slice(0, 5)
    const maxAporte = Math.max(...analisis.map((a: any) => Math.abs(a.aporteTotal)), 1)
    const altoFilaRank = 15
    topCalibres.forEach((c: any, i: number) => {
      const y = yTopRank + i * altoFilaRank
      doc.fillColor(COLOR.tinta).font('B').fontSize(7.5)
        .text(`Calibre ${c.calibre}`, L, y + 2, { width: 75 })
      doc.fillColor(COLOR.tenue).font('R').fontSize(6.8)
        .text(`${c.cajas.toLocaleString('es-CL')} cajas · ${pct(c.porcentajeVolumen)}`, L + 80, y + 2, { width: 90 })

      const xBarra = L + 175
      const anchoMaxBarra = W - 175 - 75
      const anchoBarraRank = Math.max(2, (Math.abs(c.aporteTotal) / maxAporte) * anchoMaxBarra)

      doc.rect(xBarra, y + 2, anchoMaxBarra, 10).fill(COLOR.fondo)
      doc.rect(xBarra, y + 2, anchoBarraRank, 10).fill(c.aporteTotal >= 0 ? COLOR.verde : COLOR.rojo)

      doc.fillColor(COLOR.tinta).font('B').fontSize(7.5)
        .text(dinero(c.aporteTotal, simbTarget), R - 70, y + 2, { width: 70, align: 'right', lineBreak: false })
    })

    doc.fillColor(COLOR.tenue).font('R').fontSize(6.3).text(
      `La barra compara el aporte total de cada calibre a la utilidad del contenedor, en ${targetCurrency}.`,
      L, yTopRank + topCalibres.length * altoFilaRank + 6, { width: W }
    )
    doc.y = yTopRank + topCalibres.length * altoFilaRank + 20

    asegurar(65)
    const yDic = doc.y
    doc.rect(L, yDic, W, 58).fill(COLOR.fondo)
    doc.rect(L, yDic, W, 58).lineWidth(0.5).strokeColor(COLOR.linea).stroke()
    doc.rect(L, yDic, 3, 58).fill(COLOR.indigo)
    doc.fillColor(COLOR.indigo).font('B').fontSize(7).text('DICTAMEN EJECUTIVO', L + 12, yDic + 7)
    doc.fillColor(COLOR.texto).font('R').fontSize(7.2).text(
      `La carga se concentra en el calibre ${mayorVolumen?.calibre || '—'} ` +
      `(${(mayorVolumen?.cajas || 0).toLocaleString('es-CL')} cajas, ${pct(mayorVolumen?.porcentajeVolumen || 0)} del lote), ` +
      `con un promedio de ${cajasMediaPorCalibre.toFixed(0)} cajas por tamaño. ` +
      `El mejor retorno unitario lo entregó el calibre ${mejor?.calibre || '—'} (${dinero(mejor?.utilidadPorCaja || 0)} por caja), ` +
      `con una diferencia de ${dinero((mejor?.utilidadPorCaja || 0) - (peor?.utilidadPorCaja || 0))} respecto del más bajo. ` +
      `Utilidad promedio del contenedor: ${dinero(utilidadMediaPorCaja)} por caja sobre ${totalCajas.toLocaleString('es-CL')} cajas embarcadas.`,
      L + 12, yDic + 19, { width: W - 24, align: 'justify' }
    )
    doc.y = yDic + 70

    // ── I. VENTA POR EMBALAJE Y CALIBRE ─────────────────────────────────────
    nuevaPagina()
    marcador('I. Venta por embalaje y calibre')
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
        // Las dos primeras columnas son etiquetas de texto en ambas tablas
        // (envase/calibre y nº/embalaje); el resto son cifras, que se alinean
        // a la derecha para poder compararlas de un vistazo.
        const alinear = i <= 1 ? 'left' : 'right'
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
    marcador('II. Gastos en destino')
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
    doc.y += 10

    // ── III. RESUMEN FINANCIERO — TABLA MAESTRA MULTI-MONEDA ─────────────────
    marcador('III. Resumen financiero')
    tituloSeccion('III. Resumen financiero y tabla maestra multi-moneda', COLOR.verde)

    const esVentaUSD = currency === 'USD'
    const anchosMulti = esVentaUSD ? [215, 150, 150] : [170, 115, 115, 115]
    const cabeceraMulti = esVentaUSD 
      ? ['Concepto Financiero', 'Dólares (USD $)', 'Pesos Chilenos (CLP $)']
      : ['Concepto Financiero', `Venta Destino (${currency} ${simb})`, 'Dólares (USD $)', 'Pesos Chilenos (CLP $)']

    const filaMulti = (
      valores: string[],
      opciones: { cabecera?: boolean; fondo?: string; negrita?: boolean; alto?: number; color?: string; destaca?: boolean } = {}
    ) => {
      asegurar(opciones.alto || 17)
      const y = doc.y
      const alto = opciones.alto || 17
      if (opciones.fondo) doc.rect(L, y, W, alto).fill(opciones.fondo)
      if (opciones.destaca) {
        doc.rect(L, y, W, alto).fill(COLOR.verdeFondo)
        doc.rect(L, y, W, alto).lineWidth(1).strokeColor(COLOR.verde).stroke()
      }

      let x = L
      valores.forEach((v, i) => {
        const alinear = i === 0 ? 'left' : 'right'
        doc
          .fillColor(opciones.color || (opciones.cabecera ? COLOR.tinta : COLOR.texto))
          .font(opciones.cabecera || opciones.negrita ? 'B' : 'R')
          .fontSize(opciones.cabecera ? 7 : (opciones.negrita ? 8 : 7.5))
          .text(v, x + 6, y + (alto - 8) / 2, { width: anchosMulti[i] - 12, align: alinear as any, lineBreak: false })
        x += anchosMulti[i]
      })

      if (!opciones.destaca) {
        doc.moveTo(L, y + alto).lineTo(R, y + alto).lineWidth(0.4).strokeColor(COLOR.lineaSuave).stroke()
      }
      doc.y = y + alto
    }

    filaMulti(cabeceraMulti, { cabecera: true, fondo: COLOR.fondoCabecera, alto: 18 })

    // Venta Bruta
    const vB_Dest = dinero(grossSales)
    const vB_USD = `${simbTarget} ${(grossSales * tasaSaleToTarget).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const vB_CLP = clp(grossSales * tasaCLPOtorgada)
    filaMulti(esVentaUSD ? ['Venta Bruta Destino', vB_USD, vB_CLP] : ['Venta Bruta Destino', vB_Dest, vB_USD, vB_CLP])

    // Deducciones
    const ded_Dest = `-${dinero(totalExpenses)}`
    const ded_USD = `-${simbTarget} ${(totalExpenses * tasaSaleToTarget).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const ded_CLP = `-${clp(totalExpenses * tasaCLPOtorgada)}`
    filaMulti(esVentaUSD ? ['(-) Deducciones en Destino', ded_USD, ded_CLP] : ['(-) Deducciones en Destino', ded_Dest, ded_USD, ded_CLP], { color: COLOR.rojo })

    // Importe Neto
    const net_Dest = dinero(netAmount)
    const net_USD = `${simbTarget} ${(netAmount * tasaSaleToTarget).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const net_CLP = clp(netAmount * tasaCLPOtorgada)
    filaMulti(esVentaUSD ? ['(=) Importe Neto a Favor', net_USD, net_CLP] : ['(=) Importe Neto a Favor', net_Dest, net_USD, net_CLP], { negrita: true, color: COLOR.verde, fondo: COLOR.fondo })

    // Ingreso Neto / Caja
    const netCj_Dest = `${dinero(netAmount / safeCajas)} / cj`
    const netCj_USD = `${simbTarget} ${(netAmount * tasaSaleToTarget / safeCajas).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / cj`
    const netCj_CLP = `${clp((netAmount * tasaCLPOtorgada) / safeCajas)} / cj`
    filaMulti(esVentaUSD ? ['    Ingreso Neto / Caja', netCj_USD, netCj_CLP] : ['    Ingreso Neto / Caja', netCj_Dest, netCj_USD, netCj_CLP], { color: COLOR.teal, alto: 15 })

    // Costo FOB Facturado
    const fob_Dest = `-${dinero(fobEnMonedaVenta)}`
    const fob_USD = `-${simbTarget} ${(fobEnMonedaVenta * tasaSaleToTarget).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const fob_CLP = `-${clp(advanceAmount)}`
    filaMulti(esVentaUSD ? ['(-) Costo FOB Fruta Facturado', fob_USD, fob_CLP] : ['(-) Costo FOB Fruta Facturado', fob_Dest, fob_USD, fob_CLP], { color: COLOR.rojo })

    // FOB / Caja (Campo)
    const fobCj_Dest = `${dinero(fobEnMonedaVenta / safeCajas)} / cj`
    const fobCj_USD = `${simbTarget} ${(fobEnMonedaVenta * tasaSaleToTarget / safeCajas).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / cj`
    const fobCj_CLP = `${clp(advanceAmount / safeCajas)} / cj`
    filaMulti(esVentaUSD ? ['    FOB Fruta / Caja (Campo)', fobCj_USD, fobCj_CLP] : ['    FOB Fruta / Caja (Campo)', fobCj_Dest, fobCj_USD, fobCj_CLP], { color: COLOR.suave, alto: 15 })

    // UTILIDAD FINAL NEGOCIO
    const ut_Dest = dinero(finalBalance)
    const ut_USD = `${simbTarget} ${finalBalanceTargetUSD.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const ut_CLP = clp(utilidadTotalCLPEst)
    filaMulti(
      esVentaUSD ? ['(=) UTILIDAD FINAL DEL NEGOCIO', ut_USD, ut_CLP] : ['(=) UTILIDAD FINAL DEL NEGOCIO', ut_Dest, ut_USD, ut_CLP],
      { negrita: true, color: finalBalance >= 0 ? COLOR.verde : COLOR.rojo, destaca: true, alto: 20 }
    )

    // Utilidad / Caja
    const utCj_Dest = `${dinero(finalBalance / safeCajas)} / cj`
    const utCj_USD = `${simbTarget} ${(finalBalanceTargetUSD / safeCajas).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / cj`
    const utCj_CLP = `${clp(utilidadTotalCLPEst / safeCajas)} / cj`
    filaMulti(
      esVentaUSD ? ['    Utilidad Promedio / Caja', utCj_USD, utCj_CLP] : ['    Utilidad Promedio / Caja', utCj_Dest, utCj_USD, utCj_CLP],
      { negrita: true, color: finalBalance >= 0 ? COLOR.verde : COLOR.rojo, alto: 16 }
    )

    doc.y += 10

    // Abonos y Saldo Factura
    asegurar(16)
    const yAbonos = doc.y
    doc.rect(L, yAbonos, W, 16).fill(COLOR.fondo)
    doc.fillColor(COLOR.suave).font('R').fontSize(7)
      .text(`Abonos recibidos a factura: `, L + 8, yAbonos + 5, { continued: true })
      .fillColor(COLOR.verde).font('B').text(dinero(abonosAmount, simbFob))
    doc.fillColor(COLOR.suave).font('R').fontSize(7)
      .text(`Saldo pendiente de factura FOB: `, L + W / 2, yAbonos + 5, { continued: true })
      .fillColor(COLOR.ambar).font('B').text(dinero(Math.max(advanceAmount - abonosAmount, 0), simbFob))
    doc.y = yAbonos + 20

    if (currency !== targetCurrency) {
      asegurar(14)
      doc.fillColor(COLOR.suave).font('R').fontSize(6.8)
        .text(
          `Tasa de cambio aplicada (${currency} -> ${targetCurrency}): 1 ${currency} = ${tasaSaleToTarget} ${targetCurrency}` +
          (liq.rate_provider_info ? `  ·  ${liq.rate_provider_info}` : ''),
          L, doc.y
        )
      doc.y += 14
    }

    // Cuadro destacado con el resultado final del negocio en Doble Moneda (USD & CLP) SANEADO Y LIMPIO
    asegurar(60)
    const yDetalle = doc.y
    const positivo = finalBalance >= 0
    doc.rect(L, yDetalle, W, 52).fill(positivo ? COLOR.verdeFondo : COLOR.ambarFondo)
    doc.rect(L, yDetalle, W, 52).lineWidth(1).strokeColor(positivo ? COLOR.verde : COLOR.ambar).stroke()
    doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(7.5)
      .text(
        positivo
          ? '(=) UTILIDAD FINAL DEL NEGOCIO (VENTA DESTINO - DEDUCCIONES - COSTO FOB FRUTA)'
          : 'RESULTADO POR DEBAJO DEL COSTO FOB FACTURADO',
        L + 12, yDetalle + 7, { width: W - 24 }
      )

    // Cifra en Moneda Objetivo (ej. USD)
    doc.fillColor(positivo ? COLOR.verde : COLOR.ambar).font('B').fontSize(15)
      .text(`${simbTarget} ${finalBalanceTargetUSD.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${targetCurrency}`, L + 12, yDetalle + 18, { lineBreak: false })
    
    // Cifra equivalente en Pesos Chilenos (CLP)
    doc.fillColor(COLOR.tinta).font('B').fontSize(14)
      .text(`${clp(utilidadTotalCLPEst)}`, R - 210, yDetalle + 18, { width: 198, align: 'right', lineBreak: false })

    doc.fillColor(COLOR.suave).font('R').fontSize(6.5)
      .text(`Equivalente Moneda Venta: ${dinero(finalBalance)}  ·  Tasa FOB: 1 ${currency} = $ ${tasaCLPOtorgada.toLocaleString('es-CL')} CLP`, L + 12, yDetalle + 38, { width: W - 24 })

    doc.y = yDetalle + 60

    // ── IV. RANKING POR CALIBRE — con barra de margen integrada ─────────────
    // Página nueva siempre: antes la tabla arrancaba a dos filas del final
    // de la página anterior y se veía cortada de forma arbitraria.
    nuevaPagina()
    marcador('IV. Rentabilidad por calibre')
    tituloSeccion('IV. Rentabilidad por calibre (de mayor a menor margen)')
    doc.fillColor(COLOR.tenue).font('R').fontSize(6.5)
      .text('La barra bajo "Utilidad/caja" representa su magnitud relativa frente al mejor y peor calibre del contenedor.', L, doc.y, { width: W })
    doc.y += 10

    // Embalaje va ancho a propósito: nombres reales como "LEMONS BLANCA
    // (LE16) 15 KG" no caben en una columna angosta. Antes, con 88pt,
    // PDFKit envolvía el texto a una segunda línea que se montaba sobre la
    // fila siguiente — se ve como filas superpuestas/corridas.
    // "Cajas (%)" necesita 62pt: con 56 el calibre más numeroso ("1.120 (26.3%)")
    // se partía en dos líneas y se montaba sobre la fila siguiente.
    const colRank = [22, 116, 36, 56, 52, 75, 68, 90]
    const cabRank = ['#', 'Embalaje', 'Calibre', 'Cajas (%)', 'Gastos/caja', 'Ingreso Neto (CLP)', `Utilidad (${targetCurrency})`, `Aporte (${targetCurrency})`]

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
          truncar(a.envase, 24),
          a.calibre,
          `${a.cajas.toLocaleString('es-CL')} (${pct(a.porcentajeVolumen)})`,
          `-${dinero(expensePerBox)}`,
          clp(a.retornoProductorCLP),
          `${a.utilidadPorCajaTarget >= 0 ? '+' : ''}${dinero(a.utilidadPorCajaTarget, simbTarget)}`,
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

    doc.y += 10

    // ── INTELIGENCIA GRÁFICA DE CALIBRES EN PÁGINA 3 ────────────
    asegurar(160)
    const yGraficosP3 = doc.y

    // Título de la subsección gráfica
    doc.rect(L, yGraficosP3, W, 16).fill(COLOR.fondoCabecera)
    doc.fillColor(COLOR.tinta).font('B').fontSize(7.5)
      .text('INTELIGENCIA GRÁFICA: CURVA DE CAJAS & INGRESO NETO EN PESOS CHILENOS (CLP / CAJA)', L + 8, yGraficosP3 + 4)

    let yFilaGraf = yGraficosP3 + 22
    const anchoMitad = (W - 14) / 2

    // Gráfico Izquierdo: Curva de Cajas por Calibre
    doc.rect(L, yFilaGraf, anchoMitad, 130).fill(COLOR.fondo)
    doc.rect(L, yFilaGraf, anchoMitad, 130).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()
    doc.fillColor(COLOR.indigo).font('B').fontSize(7)
      .text('DISTRIBUCIÓN DE CAJAS POR CALIBRE (CURVA HUERTO)', L + 8, yFilaGraf + 6)

    const maxCajasCalibre = Math.max(...analisis.map((a: any) => a.cajas), 1)
    let yBarraCajas = yFilaGraf + 18

    analisis.slice(0, 6).forEach((a: any) => {
      doc.fillColor(COLOR.tinta).font('B').fontSize(6.5)
        .text(`Cal. ${a.calibre}`, L + 8, yBarraCajas, { width: 35 })
      doc.fillColor(COLOR.tenue).font('R').fontSize(6)
        .text(`${a.cajas} cj (${pct(a.porcentajeVolumen)})`, L + 45, yBarraCajas, { width: 65 })
      
      const anchoBarraVisual = Math.max(3, (a.cajas / maxCajasCalibre) * (anchoMitad - 120))
      doc.rect(L + 112, yBarraCajas + 1, anchoBarraVisual, 7).fill(COLOR.indigo)
      yBarraCajas += 17
    })

    // Gráfico Derecho: Ingreso Neto Venta Destino en CLP
    const xGrafDerecha = L + anchoMitad + 14
    doc.rect(xGrafDerecha, yFilaGraf, anchoMitad, 130).fill(COLOR.fondo)
    doc.rect(xGrafDerecha, yFilaGraf, anchoMitad, 130).lineWidth(0.5).strokeColor(COLOR.lineaSuave).stroke()
    doc.fillColor(COLOR.teal).font('B').fontSize(7)
      .text('INGRESO NETO VENTA DESTINO ($ CLP / CAJA)', xGrafDerecha + 8, yFilaGraf + 6)

    const maxRetornoCLP = Math.max(...analisis.map((a: any) => Math.abs(a.retornoProductorCLP)), 1)
    let yBarraCLP = yFilaGraf + 18

    analisis.slice(0, 6).forEach((a: any) => {
      const esPositivo = a.retornoProductorCLP >= 0
      doc.fillColor(COLOR.tinta).font('B').fontSize(6.5)
        .text(`Cal. ${a.calibre}`, xGrafDerecha + 8, yBarraCLP, { width: 35 })
      doc.fillColor(esPositivo ? COLOR.verde : COLOR.rojo).font('B').fontSize(6)
        .text(clp(a.retornoProductorCLP), xGrafDerecha + 45, yBarraCLP, { width: 75 })

      const anchoBarraCLP = Math.max(3, (Math.abs(a.retornoProductorCLP) / maxRetornoCLP) * (anchoMitad - 130))
      doc.rect(xGrafDerecha + 122, yBarraCLP + 1, anchoBarraCLP, 7).fill(esPositivo ? COLOR.teal : COLOR.rojo)
      yBarraCLP += 17
    })

    doc.y = yFilaGraf + 140

    // ── V. MATRIZ GERENCIAL 2x2 — cuadrantes visuales de colores ────────────
    nuevaPagina()
    marcador('V. Matriz gerencial 2x2')
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
    const altoFila2 = altoFila(cuadrantes[2], cuadrantes[3])

    // Ejes: sin ellos las cuatro cajas se leen como una lista suelta. Con la
    // flecha de margen a la izquierda y la de volumen abajo se entiende que
    // es una matriz y por qué cada calibre cae donde cae.
    asegurar(altoFila1 + altoFila2 + 46)
    const yMatriz = doc.y
    let yFila = yMatriz

    dibujarCuadrante(L, yFila, anchoCaja, altoFila1, cuadrantes[0])
    dibujarCuadrante(L + anchoCaja + 14, yFila, anchoCaja, altoFila1, cuadrantes[1])
    yFila += altoFila1 + 12
    dibujarCuadrante(L, yFila, anchoCaja, altoFila2, cuadrantes[2])
    dibujarCuadrante(L + anchoCaja + 14, yFila, anchoCaja, altoFila2, cuadrantes[3])

    const yFinMatriz = yFila + altoFila2

    // Eje vertical (margen): la flecha apunta hacia arriba, al mayor margen.
    doc.moveTo(L - 12, yFinMatriz).lineTo(L - 12, yMatriz).lineWidth(0.8).strokeColor(COLOR.tenue).stroke()
    doc.moveTo(L - 15, yMatriz + 5).lineTo(L - 12, yMatriz).lineTo(L - 9, yMatriz + 5).fill(COLOR.tenue)
    doc.save()
    doc.rotate(-90, { origin: [L - 18, (yMatriz + yFinMatriz) / 2] })
    doc.fillColor(COLOR.suave).font('B').fontSize(6)
      .text('MAYOR MARGEN POR CAJA', L - 18 - 60, (yMatriz + yFinMatriz) / 2 - 4, { width: 120, align: 'center', lineBreak: false })
    doc.restore()

    // Eje horizontal (volumen). Ojo con la orientación: la columna IZQUIERDA
    // es la de alto volumen (Estrellas y Commodity), así que la flecha apunta
    // a la izquierda, no a la derecha.
    doc.moveTo(L, yFinMatriz + 12).lineTo(R, yFinMatriz + 12).lineWidth(0.8).strokeColor(COLOR.tenue).stroke()
    doc.moveTo(L + 5, yFinMatriz + 9).lineTo(L, yFinMatriz + 12).lineTo(L + 5, yFinMatriz + 15).fill(COLOR.tenue)
    doc.fillColor(COLOR.suave).font('B').fontSize(6)
      .text('MAYOR VOLUMEN EMBARCADO', L + 10, yFinMatriz + 16, { width: 160, lineBreak: false })
    doc.fillColor(COLOR.suave).font('B').fontSize(6)
      .text('MENOR VOLUMEN', R - 160, yFinMatriz + 16, { width: 160, align: 'right', lineBreak: false })

    doc.y = yFinMatriz + 30

    // RECOMENDACIONES TÉCNICO-AGRONÓMICAS PARA PRODUCTOR Y HUERTO
    asegurar(50)
    const yReco = doc.y
    doc.rect(L, yReco, W, 44).fill(COLOR.tealFondo)
    doc.rect(L, yReco, W, 44).lineWidth(0.8).strokeColor(COLOR.tealBorde).stroke()
    doc.rect(L, yReco, 3, 44).fill(COLOR.teal)
    doc.fillColor(COLOR.teal).font('B').fontSize(7)
      .text('RECOMENDACIONES TÉCNICO-AGRONÓMICAS DE HUERTO PARA PRÓXIMA COSECHA', L + 10, yReco + 6)
    
    const textoRecomendaciones = 
      `• Foco Agronómico: Ajustar labores de raleo temprano para potenciar la concentración de fruta en calibres Estrellas (ej. Calibre ${mejor?.calibre || '—'}). ` +
      `• Calibres Críticos: Evitar envíos masivos de fruta de menor calibre que no logre cubrir el breakeven de flete marítimo y frío (${dinero(expensePerBox + fobPerBox)}). ` +
      `• Estrategia Comercial: Derivar oportunamente excedentes de calibres deficitarios a mercado local o industria para preservar el retorno neto promedio en CLP.`
    
    doc.fillColor(COLOR.texto).font('R').fontSize(6.5)
      .text(textoRecomendaciones, L + 10, yReco + 17, { width: W - 20, align: 'justify', lineBreak: true })

    doc.y = yReco + 52

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

  return pdf
}
