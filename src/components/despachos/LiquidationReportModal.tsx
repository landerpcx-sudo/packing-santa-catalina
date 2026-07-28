'use client'

import React, { useState, useEffect } from 'react'
import { Printer, Download, X, FileText, CheckCircle2, ShieldCheck, DollarSign, TrendingUp, Award, AlertTriangle, BarChart3, HelpCircle, ArrowUpDown, Target, Layers, ChevronRight } from 'lucide-react'
import { CURRENCIES } from './ContainerLiquidationCard'

interface LiquidationReportModalProps {
  dispatchCode: string
  client?: string | null
  destination?: string | null
  containerNumber?: string | null
  dispatchDate?: string | null
  currency: string
  targetCurrency: string
  exchangeRate: number
  rateProviderInfo?: string
  grossSales: number
  commissionPct: number
  commissionAmount: number
  freight: number
  handling: number
  coldStorage: number
  surveyor: number
  transport: number
  otherExpenses: number
  totalExpenses: number
  netAmount: number
  advanceAmount: number // Costo FOB Facturado (Monto Factura)
  abonosAmount?: number // Abonos recibidos contra la factura
  fobCurrency?: string
  fobExchangeRate?: number
  finalBalanceInCurrency: number
  finalBalanceTargetCurrency: number
  liquidationStatus: 'draft' | 'finalized'
  totalCajas: number
  rows: Array<{
    envase: string
    calibre: string
    cajas: number
    price_per_box: number
    subtotal: number
  }>
  onClose: () => void
  // Abre el informe financiero en PDF real (generado en el servidor).
  onOpenPdf?: () => void
}

export default function LiquidationReportModal({
  dispatchCode,
  client,
  destination,
  containerNumber,
  dispatchDate,
  currency,
  targetCurrency,
  exchangeRate,
  rateProviderInfo,
  grossSales,
  commissionPct,
  commissionAmount,
  freight,
  handling,
  coldStorage,
  surveyor,
  transport,
  otherExpenses,
  totalExpenses,
  netAmount,
  advanceAmount,
  abonosAmount = 0,
  fobCurrency = 'CLP',
  fobExchangeRate = 1000,
  finalBalanceInCurrency,
  finalBalanceTargetCurrency,
  liquidationStatus,
  totalCajas,
  rows,
  onClose,
  onOpenPdf
}: LiquidationReportModalProps) {
  // Estado interactivo de ordenamiento
  const [sortBy, setSortBy] = useState<'profitPerBox' | 'boxes' | 'totalContribution'>('profitPerBox')

  // Manejo de tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const getSymbol = (code: string) => {
    const found = CURRENCIES.find(c => c.code === code)
    return found ? found.symbol : '$'
  }

  const currSymbol = getSymbol(currency)
  const targetSymbol = getSymbol(targetCurrency)
  const fobCurrSymbol = getSymbol(fobCurrency)

  const formatMoney = (val: number, sym = currSymbol) => {
    const isCLP = sym.includes('CLP') || (sym === '$' && currency === 'CLP')
    const decimals = isCLP ? 0 : 2
    const num = isCLP ? Math.round(val) : val
    return `${sym} ${num.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  // CÁLCULOS AVANZADOS DE INTELIGENCIA COMERCIAL POR CALIBRE
  const safeTotalCajas = totalCajas > 0 ? totalCajas : 1
  const expensePerBox = totalExpenses / safeTotalCajas
  const tasaCLPOtorgada = currency === 'CLP' ? 1 : (exchangeRate || 1)
  const fobInSalesCurrency = currency === 'CLP' 
    ? advanceAmount 
    : (advanceAmount / (tasaCLPOtorgada || 1))
  const fobPerBox = fobInSalesCurrency / safeTotalCajas
  const avgProfitPerBox = finalBalanceInCurrency / safeTotalCajas
  const avgBoxesPerCalibre = safeTotalCajas / (rows.length || 1)

  // Análisis por fila de calibre con métricas gerenciales
  const calibreAnalysis = rows.map(r => {
    const destPrice = r.price_per_box || 0
    const destNet = destPrice - expensePerBox
    const profitPerBox = destPrice - expensePerBox - fobPerBox
    const totalProfitRow = profitPerBox * r.cajas
    const totalProfitTargetCurr = totalProfitRow * exchangeRate
    const volumePct = (r.cajas / safeTotalCajas) * 100
    const breakEvenPrice = expensePerBox + fobPerBox

    // Clasificación en Matriz 2x2
    const isHighVolume = r.cajas >= avgBoxesPerCalibre
    const isHighMargin = profitPerBox >= avgProfitPerBox

    let quadrant: 'ESTRELLA' | 'NICHO' | 'COMMODITY' | 'DEFICITARIO' = 'COMMODITY'
    if (profitPerBox < 0) {
      quadrant = 'DEFICITARIO'
    } else if (isHighVolume && isHighMargin) {
      quadrant = 'ESTRELLA'
    } else if (!isHighVolume && isHighMargin) {
      quadrant = 'NICHO'
    } else {
      quadrant = 'COMMODITY'
    }

    return {
      ...r,
      destPrice,
      destNet,
      expensePerBox,
      fobPerBox,
      profitPerBox,
      totalProfitRow,
      totalProfitTargetCurr,
      volumePct,
      breakEvenPrice,
      quadrant
    }
  })

  // Ordenamiento dinámico según preferencia
  const sortedCalibres = [...calibreAnalysis].sort((a, b) => {
    if (sortBy === 'profitPerBox') return b.profitPerBox - a.profitPerBox
    if (sortBy === 'boxes') return b.cajas - a.cajas
    if (sortBy === 'totalContribution') return b.totalProfitTargetCurr - a.totalProfitTargetCurr
    return 0
  })

  const maxProfitCalibre = [...calibreAnalysis].sort((a, b) => b.profitPerBox - a.profitPerBox)[0]
  const minProfitCalibre = [...calibreAnalysis].sort((a, b) => a.profitPerBox - b.profitPerBox)[0]
  const maxVolumeCalibre = [...calibreAnalysis].sort((a, b) => b.cajas - a.cajas)[0]

  // Encontrar máximos para escalar barras del gráfico
  const maxProfitBar = Math.max(...calibreAnalysis.map(c => Math.abs(c.profitPerBox)), 0.01)
  const maxVolumeBar = Math.max(...calibreAnalysis.map(c => c.cajas), 1)

  // Impresión aislada: marca el <body> mientras dura el diálogo para que el
  // CSS de impresión oculte la página del despacho que está detrás del modal.
  // Antes salía impreso el despacho completo y el informe quedaba al final.
  const handlePrintOrPDF = () => {
    document.body.classList.add('imprimiendo-informe')
    const limpiar = () => {
      document.body.classList.remove('imprimiendo-informe')
      window.removeEventListener('afterprint', limpiar)
    }
    window.addEventListener('afterprint', limpiar)
    window.print()
    // Respaldo por si el navegador no dispara afterprint (Safari antiguo).
    setTimeout(limpiar, 3000)
  }

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:block cursor-pointer"
    >
      {/* Contenedor principal del modal (oculto el marco al imprimir) */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:bg-white cursor-default"
      >
        
        {/* BARRA SUPERIOR DE ACCIONES (Oculta al imprimir) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">Sistema Gerencial de Decisiones & Inteligencia de Mercados</h3>
          </div>
          <div className="flex items-center gap-3">
            {onOpenPdf && (
              <button
                onClick={onOpenPdf}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
                title="Abre el PDF en una pestaña nueva para imprimirlo o descargarlo"
              >
                <Download className="w-4 h-4" />
                Abrir PDF para imprimir o enviar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DOCUMENTO IMPRIMIBLE COMERCIAL */}
        <div id="commercial-report-print" className="p-8 sm:p-10 overflow-y-auto flex-1 bg-white text-slate-900 print:p-6 print:overflow-visible print:bg-white print:text-black space-y-6">
          
          {/* ENCABEZADO INSTITUCIONAL DE LA EMPRESA */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-emerald-600 rounded-full inline-block" />
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">SANTA CATALINA</h1>
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">Control Documental & Gestión Financiera de Exportaciones</p>
              <p className="text-[11px] text-slate-400 mt-1">Plataforma de Liquidaciones, Comercio Internacional & Inteligencia Comercial</p>
            </div>

            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider text-slate-800 mb-1">
                INFORME COMERCIAL Y DECISIONES GERENCIALES
              </div>
              <p className="text-sm font-mono font-bold text-slate-900">FOLIO: LIQ-{dispatchCode}</p>
              <p className="text-[11px] text-slate-500">Fecha Emisión: {new Date().toLocaleDateString('es-CL')}</p>
              <span className={`inline-block px-2 py-0.5 mt-1 text-[10px] font-bold uppercase rounded ${
                liquidationStatus === 'finalized' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                Estado: {liquidationStatus === 'finalized' ? 'DOCUMENTO FINALIZADO' : 'BORRADOR DE LIQUIDACIÓN'}
              </span>
            </div>
          </div>

          {/* DATOS OPERATIVOS DEL DESPACHO / CONTENEDOR */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Cliente / Exportador</span>
              <span className="font-bold text-slate-900 text-sm truncate block">{client || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Nº de Contenedor</span>
              <span className="font-mono font-bold text-indigo-700 text-sm block">{containerNumber || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Mercado / Destino</span>
              <span className="font-bold text-slate-900 text-sm block">{destination || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Fecha de Salida</span>
              <span className="font-mono font-bold text-slate-900 text-sm block">{formatDate(dispatchDate)}</span>
            </div>
          </div>

          {/* SECCIÓN I: DESGLOSE DE VENTA POR EMBALAJE Y CALIBRE */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                I. Desglose Comprobado de Venta de Fruta (Venta por Caja en {currency})
              </h3>
              <span className="text-xs font-mono font-bold text-slate-600">Total Cajas: {totalCajas.toLocaleString()}</span>
            </div>

            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  <th className="border border-slate-300 py-2 px-3">Envase / Embalaje</th>
                  <th className="border border-slate-300 py-2 px-3">Calibre</th>
                  <th className="border border-slate-300 py-2 px-3 text-right">Cajas Totales</th>
                  <th className="border border-slate-300 py-2 px-3 text-right">Precio Venta / Caja ({currSymbol})</th>
                  <th className="border border-slate-300 py-2 px-3 text-right">Subtotal Venta ({currSymbol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                {rows.map((r, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="border border-slate-300 py-2 px-3 font-semibold">{r.envase}</td>
                    <td className="border border-slate-300 py-2 px-3 font-mono font-bold text-indigo-700">{r.calibre}</td>
                    <td className="border border-slate-300 py-2 px-3 text-right font-mono">{r.cajas.toLocaleString()}</td>
                    <td className="border border-slate-300 py-2 px-3 text-right font-mono">{formatMoney(r.price_per_box)}</td>
                    <td className="border border-slate-300 py-2 px-3 text-right font-mono font-bold text-slate-900">{formatMoney(r.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                  <td colSpan={2} className="border border-slate-300 py-2.5 px-3 uppercase text-[10px]">Total Venta Bruta Contenedor ({currency})</td>
                  <td className="border border-slate-300 py-2.5 px-3 text-right font-mono">{totalCajas.toLocaleString()} cajas</td>
                  <td className="border border-slate-300 py-2.5 px-3"></td>
                  <td className="border border-slate-300 py-2.5 px-3 text-right font-mono text-sm text-emerald-800">{formatMoney(grossSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* SECCIÓN II: DEDUCCIONES Y GASTOS EN DESTINO */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              II. Gastos Operativos y Deducciones en Destino ({currency})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border border-slate-300 rounded-xl p-3 bg-slate-50">
              <div>
                <span className="text-slate-500 text-[10px] block">Comisión Venta ({commissionPct}%)</span>
                <span className="font-mono font-bold text-red-700">{formatMoney(commissionAmount)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Flete Marítimo</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(freight)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Handling / Puerto</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(handling)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Almacén Frigorífico</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(coldStorage)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Surveyor / Inspección</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(surveyor)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Transporte Local</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(transport)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Otros Gastos</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(otherExpenses)}</span>
              </div>
              <div className="bg-red-50 border border-red-200 p-1.5 rounded-lg">
                <span className="text-red-700 font-bold text-[10px] uppercase block">Total Deducciones</span>
                <span className="font-mono font-black text-red-700 text-sm">-{formatMoney(totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* SECCIÓN III: ESTADO FINANCIERO Y UTILIDAD TOTAL DEL NEGOCIO */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              III. Resumen Financiero y Utilidad Total del Contenedor
            </h3>

            <div className="border border-slate-300 rounded-2xl p-5 space-y-3 bg-white">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-slate-200 pb-3">
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">Venta Bruta Total</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{formatMoney(grossSales)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">(-) Deducciones Destino</span>
                  <span className="font-mono font-bold text-red-700 text-sm">-{formatMoney(totalExpenses)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">(=) Importe Neto A Favor</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{formatMoney(netAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">(-) Valor FOB Facturado</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{formatMoney(advanceAmount, fobCurrSymbol)}</span>
                  {fobCurrency !== currency && (
                    <span className="block text-[10px] text-slate-500 font-mono">({formatMoney(fobInSalesCurrency, currSymbol)})</span>
                  )}
                </div>
              </div>

              {/* Detalle de Abonos a Factura FOB */}
              <div className="flex flex-wrap items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700 gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Abonos Recibidos a Factura: </span>
                  <strong className="font-mono font-bold text-emerald-700">{formatMoney(abonosAmount, fobCurrSymbol)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Saldo Pendiente de Factura FOB: </span>
                  <strong className="font-mono font-bold text-amber-700">{formatMoney(Math.max(advanceAmount - abonosAmount, 0), fobCurrSymbol)}</strong>
                </div>
              </div>

              {/* Tasa de Cambio */}
              {currency !== 'CLP' && (
                <div className="flex flex-wrap items-center justify-between text-xs bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100 gap-2">
                  <span className="text-slate-600 font-medium">
                    Tasa de Cambio Oficial ({currency} → CLP): <strong className="font-mono text-indigo-700">1 {currency} = $ {exchangeRate.toLocaleString('es-CL')} CLP</strong>
                  </span>
                  {rateProviderInfo && (
                    <span className="text-indigo-600 text-[11px] font-medium">[{rateProviderInfo}]</span>
                  )}
                </div>
              )}

              {/* CUADRO DESTACADO DE UTILIDAD DEL NEGOCIO */}
              <div className={`p-5 rounded-2xl border-2 space-y-1 ${
                finalBalanceInCurrency >= 0
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                  : 'bg-amber-50 border-amber-400 text-amber-900'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider">
                    {finalBalanceInCurrency >= 0 ? 'UTILIDAD NETO TOTAL DEL CONTENEDOR (A FAVOR EXPORTADOR)' : 'RESULTADO POR DEBAJO DE COSTO FOB FACTURADO'}
                  </span>
                  <span className="text-xs font-mono font-bold">Moneda Final: {targetCurrency}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-3xl font-black font-mono tracking-tight">
                    {targetSymbol} {finalBalanceTargetCurrency.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {targetCurrency}
                  </span>
                  <span className="text-xs font-mono font-bold opacity-80">
                    (Equivalente: {formatMoney(finalBalanceInCurrency, currSymbol)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN IV: INTELIGENCIA COMERCIAL Y ANÁLISIS DE RENTABILIDAD POR CALIBRE */}
          <div className="space-y-4 pt-4 border-t-2 border-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  IV. Ranking Ordenado & Análisis de Rentabilidad por Calibre (Mejor a Menor Rendimiento)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Calibres ordenados estrictamente de mayor a menor margen neta por caja.
                </p>
              </div>

              {/* BARRA INTERACTIVA DE CONTROLES DE ORDENAMIENTO (Oculta al imprimir) */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-300 print:hidden text-xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase px-2">Ordenar por:</span>
                <button
                  type="button"
                  onClick={() => setSortBy('profitPerBox')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                    sortBy === 'profitPerBox' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <DollarSign className="w-3 h-3 inline mr-1" />
                  Utilidad / Caja
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('boxes')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                    sortBy === 'boxes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3 inline mr-1" />
                  Curva de Calibres (Volumen)
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('totalContribution')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                    sortBy === 'totalContribution' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Award className="w-3 h-3 inline mr-1" />
                  Aporte Total ($)
                </button>
              </div>
            </div>

            {/* TABLA RANKING COMPARATIVO DE COSTO Y RENTABILIDAD POR CAJA */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold uppercase text-[9.5px]">
                    <th className="border border-slate-300 py-2.5 px-2 text-center w-8">Rank</th>
                    <th className="border border-slate-300 py-2.5 px-3">Embalaje</th>
                    <th className="border border-slate-300 py-2.5 px-3">Calibre</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Cajas (% Carga)</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Venta Destino</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Gastos / Caja</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Costo FOB / Caja</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Break-Even (Punto Eq.)</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Utilidad Neta / Caja ({currSymbol})</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Contribución Total ({targetCurrency})</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-center">Cuadrante Gerencial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {sortedCalibres.map((item, idx) => {
                    const rankNum = idx + 1
                    const isFirst = rankNum === 1
                    const isLast = rankNum === sortedCalibres.length && item.profitPerBox < 0

                    let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300'
                    let badgeLabel = '🟢 COMMODITY'

                    if (item.quadrant === 'ESTRELLA') {
                      badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
                      badgeLabel = '⭐⭐ ESTRELLA EXPORTACIÓN'
                    } else if (item.quadrant === 'NICHO') {
                      badgeColor = 'bg-teal-100 text-teal-900 border-teal-300 font-bold'
                      badgeLabel = '⭐ NICHO ALTO MARGEN'
                    } else if (item.quadrant === 'DEFICITARIO') {
                      badgeColor = 'bg-red-100 text-red-900 border-red-300 font-bold'
                      badgeLabel = '🔴 PÉRDIDA NETA'
                    }

                    return (
                      <tr key={idx} className={isFirst ? 'bg-emerald-50/50 font-bold' : isLast ? 'bg-red-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="border border-slate-300 py-2 px-2 text-center font-black font-mono text-indigo-900 text-xs">
                          #{rankNum}
                        </td>
                        <td className="border border-slate-300 py-2 px-3 font-semibold">{item.envase}</td>
                        <td className="border border-slate-300 py-2 px-3 font-mono font-bold text-indigo-800">{item.calibre}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono">
                          {item.cajas.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">({item.volumePct.toFixed(1)}%)</span>
                        </td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono">{formatMoney(item.destPrice)}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono text-red-700">-{formatMoney(item.expensePerBox)}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono text-slate-700">-{formatMoney(item.fobPerBox)}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono text-slate-500 font-bold">{formatMoney(item.breakEvenPrice)}</td>
                        <td className={`border border-slate-300 py-2 px-3 text-right font-mono font-black ${
                          item.profitPerBox >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          {item.profitPerBox >= 0 ? '+' : ''}{formatMoney(item.profitPerBox)}
                        </td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatMoney(item.totalProfitTargetCurr, targetSymbol)}
                        </td>
                        <td className="border border-slate-300 py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[9px] uppercase rounded-full border ${badgeColor}`}>
                            {badgeLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* GRÁFICO COMPACTO SINTÉTICO: CURVA DE CALIBRES Y MARGEN DE COSECHA */}
            <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-3 print-avoid-break" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  Matriz Sintética de Curva de Calibres & Margen de Cosecha
                </h4>
                <span className="text-[10px] font-mono text-slate-500">
                  Orden: <strong className="text-indigo-700 uppercase">{sortBy === 'profitPerBox' ? 'Utilidad/Caja' : sortBy === 'boxes' ? 'Curva Volumen' : 'Aporte $'}</strong>
                </span>
              </div>

              {/* MATRIZ DE FILAS SINTÉTICAS (VISTA DE UN VISTAZO) */}
              <div className="space-y-2">
                {sortedCalibres.map((item, idx) => {
                  const profitPct = Math.min(Math.max((Math.abs(item.profitPerBox) / maxProfitBar) * 100, 8), 100)
                  const isPositive = item.profitPerBox >= 0

                  return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                      {/* IDENTIFICACIÓN Y CURVA DE CAJAS */}
                      <div className="flex items-center gap-2.5 min-w-[220px]">
                        <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-mono text-[10px] font-bold">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-mono font-bold text-slate-900 text-xs">
                            Calibre {item.calibre} <span className="text-[10px] text-slate-500 font-normal">({item.envase})</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {item.cajas.toLocaleString()} cajas • <strong className="text-indigo-700">{item.volumePct.toFixed(1)}% del lote</strong>
                          </div>
                        </div>
                      </div>

                      {/* BARRA DE RENTABILIDAD NETA Y MARGEN */}
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400">Break-even: {formatMoney(item.breakEvenPrice)}</span>
                          <span className={`font-black ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{formatMoney(item.profitPerBox)} / caja
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex items-center border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isPositive
                                ? idx === 0 ? 'bg-emerald-600' : 'bg-indigo-600'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${profitPct}%` }}
                          />
                        </div>
                      </div>

                      {/* CONTRIBUCIÓN TOTAL EN MONEDA OBJETIVO */}
                      <div className="text-right min-w-[110px] font-mono">
                        <span className="text-[9px] text-slate-400 block uppercase font-bold">Aporte Total</span>
                        <span className="font-bold text-slate-900 text-xs">{formatMoney(item.totalProfitTargetCurr, targetSymbol)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* DICTAMEN EJECUTIVO DE INTELIGENCIA FRUTÍCOLA */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-1.5 text-xs text-indigo-950">
                <div className="flex items-center gap-2 font-black uppercase text-[10.5px] text-indigo-900">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Dictamen Ejecutivo Frutícola Comercial (Análisis de Cosecha & Mercado)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] pt-1">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100 space-y-0.5">
                    <strong className="text-indigo-900 block text-[10px] uppercase font-bold">1. Perfil de Curva de Cosecha:</strong>
                    <p className="text-slate-700 leading-snug">
                      La carga presenta una concentración relevante en <strong className="text-indigo-900">Calibre {maxVolumeCalibre?.calibre || '—'} ({maxVolumeCalibre?.cajas || 0} cajas, {maxVolumeCalibre?.volumePct.toFixed(1)}% del lote)</strong>. La curva promedio promedia {avgBoxesPerCalibre.toFixed(0)} cajas por tamaño.
                    </p>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100 space-y-0.5">
                    <strong className="text-indigo-900 block text-[10px] uppercase font-bold">2. Calibre Máxima Utilidad:</strong>
                    <p className="text-slate-700 leading-snug">
                      El mejor retorno unitario lo entregó el <strong className="text-emerald-800">Calibre {maxProfitCalibre?.calibre || '—'} (+{formatMoney(maxProfitCalibre?.profitPerBox || 0)} / caja)</strong>, superando por {formatMoney((maxProfitCalibre?.profitPerBox || 0) - (minProfitCalibre?.profitPerBox || 0))} al calibre más bajo.
                    </p>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100 space-y-0.5">
                    <strong className="text-indigo-900 block text-[10px] uppercase font-bold">3. Directriz para Packing & Campo:</strong>
                    <p className="text-slate-700 leading-snug">
                      Se recomienda ajustar la labor de raleo en huerto y potenciar el embalaje de fruta mediana-grande. Derivar fruta de calibre menor a mercado interno o industria para optimizar el retorno de fletes marítimos.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN V: MATRIZ DE DECISIONES DE COSECHA & EXPORTACIÓN 2x2 (INICIA EN PÁGINA 2) */}
            <div className="space-y-3 pt-6 border-t-2 border-slate-300 page-break-before" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-1">
                <Target className="w-4 h-4 text-indigo-600" />
                V. Matriz Gerencial 2x2 de Decisiones de Cosecha & Comercialización
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* CUADRANTE 1: ESTRELLAS DE EXPORTACIÓN */}
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 space-y-2 print-avoid-break" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <div className="flex items-center justify-between text-emerald-900 font-bold uppercase border-b border-emerald-200 pb-1">
                    <span className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-600" />
                      ⭐⭐ Estrellas de Exportación
                    </span>
                    <span className="text-[10px] font-normal">Alto Volumen + Alto Margen</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Motor principal de ganancias del despacho. Se recomienda priorizar la selección y envío masivo de estos calibres a {destination || 'este mercado'}.
                  </p>

                  <div className="space-y-1 pt-1">
                    {calibreAnalysis.filter(c => c.quadrant === 'ESTRELLA').map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-emerald-200 font-mono text-[11px] text-emerald-900 font-bold">
                        <span>Calibre {c.calibre} ({c.envase})</span>
                        <span>+{formatMoney(c.profitPerBox)} / caja ({c.cajas} cajas)</span>
                      </div>
                    ))}
                    {calibreAnalysis.filter(c => c.quadrant === 'ESTRELLA').length === 0 && (
                      <p className="text-[11px] text-emerald-600 italic">No hay calibres en esta categoría en este contenedor.</p>
                    )}
                  </div>
                </div>

                {/* CUADRANTE 2: NICHOS DE ALTO MARGEN */}
                <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4 space-y-2 print-avoid-break" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <div className="flex items-center justify-between text-teal-900 font-bold uppercase border-b border-teal-200 pb-1">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-teal-600" />
                      ⭐ Nichos de Alto Margen
                    </span>
                    <span className="text-[10px] font-normal">Bajo Volumen + Alto Margen</span>
                  </div>
                  <p className="text-[11px] text-teal-800">
                    Excelente margen unitario pero poco volumen en el contenedor. Oportunidad para aumentar el embalaje de este calibre en futuras cosechas.
                  </p>

                  <div className="space-y-1 pt-1">
                    {calibreAnalysis.filter(c => c.quadrant === 'NICHO').map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-teal-200 font-mono text-[11px] text-teal-900 font-bold">
                        <span>Calibre {c.calibre} ({c.envase})</span>
                        <span>+{formatMoney(c.profitPerBox)} / caja ({c.cajas} cajas)</span>
                      </div>
                    ))}
                    {calibreAnalysis.filter(c => c.quadrant === 'NICHO').length === 0 && (
                      <p className="text-[11px] text-teal-600 italic">No hay calibres en esta categoría en este contenedor.</p>
                    )}
                  </div>
                </div>

                {/* CUADRANTE 3: VOLUMEN COMMODITY */}
                <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 space-y-2 print-avoid-break" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <div className="flex items-center justify-between text-slate-900 font-bold uppercase border-b border-slate-200 pb-1">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-600" />
                      🟢 Volumen Commodity
                    </span>
                    <span className="text-[10px] font-normal">Alto Volumen + Margen Estándar</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Mucha carga enviada con margen ajustado. Se recomienda renegociar comisiones y tarifas flete marítimo para mejorar su rentabilidad global.
                  </p>

                  <div className="space-y-1 pt-1">
                    {calibreAnalysis.filter(c => c.quadrant === 'COMMODITY').map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200 font-mono text-[11px] text-slate-800">
                        <span>Calibre {c.calibre} ({c.envase})</span>
                        <span>+{formatMoney(c.profitPerBox)} / caja ({c.cajas} cajas)</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CUADRANTE 4: CALIBRES CRÍTICOS / PÉRDIDA */}
                <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-2 print-avoid-break" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <div className="flex items-center justify-between text-red-900 font-bold uppercase border-b border-red-200 pb-1">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      🔴 Calibres Críticos / Pérdida Neta
                    </span>
                    <span className="text-[10px] font-normal">Pérdida por Caja</span>
                  </div>
                  <p className="text-[11px] text-red-800">
                    Restan valor a la exportación. Se sugiere renegociar precio mínimo en destino o desviar estas categorías a mercado interno / industria de jugo.
                  </p>

                  <div className="space-y-1 pt-1">
                    {calibreAnalysis.filter(c => c.quadrant === 'DEFICITARIO').map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-red-200 font-mono text-[11px] text-red-900 font-bold">
                        <span>Calibre {c.calibre} ({c.envase})</span>
                        <span className="text-red-700">{formatMoney(c.profitPerBox)} / caja ({c.cajas} cajas)</span>
                      </div>
                    ))}
                    {calibreAnalysis.filter(c => c.quadrant === 'DEFICITARIO').length === 0 && (
                      <p className="text-[11px] text-emerald-700 font-semibold">¡Excelente! Ningún calibre registró pérdida neta en este contenedor.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* PIE DE FIRMAS Y CONFORMIDAD INSTITUCIONAL */}
          <div className="pt-8 grid grid-cols-2 gap-12 text-center text-xs print:pt-12">
            <div className="border-t border-slate-400 pt-2 space-y-1">
              <p className="font-bold text-slate-900">Emisión & Control Financiero</p>
              <p className="text-[10px] text-slate-500">Packing Santa Catalina S.A.</p>
            </div>
            <div className="border-t border-slate-400 pt-2 space-y-1">
              <p className="font-bold text-slate-900">Conformidad Cliente / Exportador</p>
              <p className="text-[10px] text-slate-500">{client || 'Firma de Aceptación'}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
