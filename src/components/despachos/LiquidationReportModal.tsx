'use client'

import React, { useEffect } from 'react'
import { Printer, X, FileText, CheckCircle2, ShieldCheck, DollarSign } from 'lucide-react'
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
  advanceAmount: number // Costo FOB Facturado
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

  const formatMoney = (val: number, sym = currSymbol) => {
    return `${sym} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:block">
      {/* Contenedor principal del modal (oculto el marco al imprimir) */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:bg-white">
        
        {/* BARRA SUPERIOR DE ACCIONES (Oculta al imprimir) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">Vista Previa - Informe Comercial de Liquidación</h3>
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
              <p className="text-[11px] text-slate-400 mt-1">Plataforma de Liquidaciones y Comercio Internacional</p>
            </div>

            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider text-slate-800 mb-1">
                INFORME DE LIQUIDACIÓN
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
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">(-) Costo FOB Facturado</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{formatMoney(advanceAmount)}</span>
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
