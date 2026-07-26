'use client'

import React, { useEffect } from 'react'
import { Printer, X, FileText, CheckCircle2, ShieldCheck, DollarSign, TrendingUp, Award, AlertTriangle, BarChart3, HelpCircle } from 'lucide-react'
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
  onClose
}: LiquidationReportModalProps) {
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
    return `${sym} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  // CÁLCULOS AVANZADOS DE INTELIGENCIA COMERCIAL POR CALIBRE
  const safeTotalCajas = totalCajas > 0 ? totalCajas : 1
  const expensePerBox = totalExpenses / safeTotalCajas
  const fobInSalesCurrency = fobCurrency === currency 
    ? advanceAmount 
    : (fobExchangeRate > 0 ? advanceAmount / fobExchangeRate : advanceAmount)
  const fobPerBox = fobInSalesCurrency / safeTotalCajas
  const avgProfitPerBox = finalBalanceInCurrency / safeTotalCajas

  // Análisis por fila de calibre
  const calibreAnalysis = rows.map(r => {
    const destPrice = r.price_per_box || 0
    const destNet = destPrice - expensePerBox
    const profitPerBox = destPrice - expensePerBox - fobPerBox
    const totalProfitRow = profitPerBox * r.cajas
    const totalProfitTargetCurr = totalProfitRow * exchangeRate

    return {
      ...r,
      destPrice,
      destNet,
      expensePerBox,
      fobPerBox,
      profitPerBox,
      totalProfitRow,
      totalProfitTargetCurr
    }
  })

  // Ordenar por utilidad por caja (de mayor a menor)
  const sortedByProfit = [...calibreAnalysis].sort((a, b) => b.profitPerBox - a.profitPerBox)
  const maxProfitCalibre = sortedByProfit[0]
  const minProfitCalibre = sortedByProfit[sortedByProfit.length - 1]

  // Encontrar la mayor utilidad por caja para escalar barras del gráfico
  const maxBarValue = Math.max(...calibreAnalysis.map(c => Math.abs(c.profitPerBox)), 0.01)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:block">
      {/* Contenedor principal del modal (oculto el marco al imprimir) */}
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:bg-white">
        
        {/* BARRA SUPERIOR DE ACCIONES (Oculta al imprimir) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">Informe Comercial de Liquidación & Inteligencia de Calibres</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Descargar PDF
            </button>
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
                INFORME COMERCIAL Y INTELIGENCIA DE MERCADO
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
              {currency !== targetCurrency && (
                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-slate-600 font-medium">
                    Tasa de Cambio Oficial Aplicada ({currency} $\rightarrow$ {targetCurrency}):
                  </span>
                  <span className="font-mono font-bold text-indigo-700">
                    1 {currency} = {exchangeRate} {targetCurrency} {rateProviderInfo ? `[${rateProviderInfo}]` : ''}
                  </span>
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
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  IV. Análisis de Inteligencia Comercial & Rentabilidad por Calibre (Decisión Estratégica)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Desglose de Venta Destino, Gastos y Costo FOB por caja para identificar calibres de mayor y menor margen.
                </p>
              </div>
              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl text-xs font-bold font-mono">
                Utilidad Promedio Contenedor: {formatMoney(avgProfitPerBox)} / caja
              </span>
            </div>

            {/* TABLA COMPARATIVA DE COSTO Y RENTABILIDAD POR CAJA */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold uppercase text-[9.5px]">
                    <th className="border border-slate-300 py-2.5 px-3">Embalaje</th>
                    <th className="border border-slate-300 py-2.5 px-3">Calibre</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Cajas</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Venta Destino / Caja</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Gastos / Caja</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Costo FOB / Caja</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Utilidad Neta / Caja ({currSymbol})</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-right">Contribución Total ({targetCurrency})</th>
                    <th className="border border-slate-300 py-2.5 px-3 text-center">Clasificación Comercial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {calibreAnalysis.map((item, idx) => {
                    const isStar = maxProfitCalibre && item.calibre === maxProfitCalibre.calibre && item.profitPerBox > 0
                    const isCritical = minProfitCalibre && item.calibre === minProfitCalibre.calibre && (item.profitPerBox < avgProfitPerBox)

                    let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300'
                    let badgeLabel = '🟢 Rendimiento Estándar'

                    if (isStar) {
                      badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
                      badgeLabel = '⭐ Máxima Utilidad (Estrella)'
                    } else if (isCritical) {
                      badgeColor = 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                      badgeLabel = '⚠️ Bajo Margen (Revisar)'
                    } else if (item.profitPerBox < 0) {
                      badgeColor = 'bg-red-100 text-red-900 border-red-300 font-bold'
                      badgeLabel = '🔴 Pérdida Neta / Caja'
                    }

                    return (
                      <tr key={idx} className={isStar ? 'bg-emerald-50/40 font-bold' : isCritical ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="border border-slate-300 py-2 px-3 font-semibold">{item.envase}</td>
                        <td className="border border-slate-300 py-2 px-3 font-mono font-bold text-indigo-800">{item.calibre}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono">{item.cajas.toLocaleString()}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono">{formatMoney(item.destPrice)}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono text-red-700">-{formatMoney(item.expensePerBox)}</td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono text-slate-700">-{formatMoney(item.fobPerBox)}</td>
                        <td className={`border border-slate-300 py-2 px-3 text-right font-mono font-black ${
                          item.profitPerBox >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          {item.profitPerBox >= 0 ? '+' : ''}{formatMoney(item.profitPerBox)}
                        </td>
                        <td className="border border-slate-300 py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatMoney(item.totalProfitTargetCurr, targetSymbol)}
                        </td>
                        <td className="border border-slate-300 py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[9.5px] uppercase rounded-full border ${badgeColor}`}>
                            {badgeLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* GRÁFICO COMPARATIVO DE BARRAS DE UTILIDAD POR CAJA */}
            <div className="bg-slate-50 border border-slate-300 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Gráfico Comparativo de Margen Neto por Caja (según Calibre)
              </h4>

              <div className="space-y-2.5 pt-1">
                {calibreAnalysis.map((item, idx) => {
                  const pct = Math.min(Math.max((Math.abs(item.profitPerBox) / maxBarValue) * 100, 8), 100)
                  const isPositive = item.profitPerBox >= 0

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="font-mono text-slate-800">Calibre {item.calibre} ({item.envase})</span>
                        <span className={`font-mono font-bold ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{formatMoney(item.profitPerBox)} / caja
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3.5 overflow-hidden p-0.5 flex items-center">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isPositive
                              ? item.profitPerBox === maxProfitCalibre?.profitPerBox
                                ? 'bg-emerald-600'
                                : 'bg-indigo-600'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* RECOMENDACIONES COMERCIALES Y DE ESTRATEGIA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {maxProfitCalibre && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 uppercase">
                    <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                    Calibre Estrella (Mayor Margen)
                  </div>
                  <p className="text-xs text-emerald-800">
                    El calibre <strong className="font-mono font-bold">{maxProfitCalibre.calibre}</strong> entregó el mejor rendimiento económico con <strong className="font-mono font-bold">+{formatMoney(maxProfitCalibre.profitPerBox)} / caja</strong>. Se recomienda priorizar este calibre en negociaciones futuras para {destination || 'este destino'}.
                  </p>
                </div>
              )}

              {minProfitCalibre && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Calibre Crítico (Menor Margen)
                  </div>
                  <p className="text-xs text-amber-800">
                    El calibre <strong className="font-mono font-bold">{minProfitCalibre.calibre}</strong> tuvo el margen más ajustado (<strong className="font-mono font-bold">{formatMoney(minProfitCalibre.profitPerBox)} / caja</strong>). Evaluar ajustes de precio de venta o redireccionar esta categoría a mercados alternativos.
                  </p>
                </div>
              )}
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
