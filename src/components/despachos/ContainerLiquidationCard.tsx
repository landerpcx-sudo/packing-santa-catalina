'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Calculator, RefreshCw, FileText, CheckCircle2,
  AlertCircle, Save, Printer, ArrowRight, Package, Percent, FileCheck, Globe, Calendar
} from 'lucide-react'
import { DispatchPacklistItem, DispatchLiquidationItem, DispatchLiquidation } from '@/lib/types'

interface ContainerLiquidationCardProps {
  dispatchId: string
  dispatchCode: string
  isClosed?: boolean
  userId?: string
}

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro (EUR €)' },
  { code: 'USD', symbol: '$', label: 'Dólar Estadounidense (USD $)' },
  { code: 'CLP', symbol: '$', label: 'Peso Chileno (CLP $)' },
  { code: 'GBP', symbol: '£', label: 'Libra Esterlina (GBP £)' },
  { code: 'CAD', symbol: '$', label: 'Dólar Canadiense (CAD $)' },
  { code: 'BRL', symbol: 'R$', label: 'Real Brasileño (BRL R$)' },
  { code: 'CNY', symbol: '¥', label: 'Yuan Chino (CNY ¥)' },
]

export default function ContainerLiquidationCard({
  dispatchId,
  dispatchCode,
  isClosed = false,
  userId
}: ContainerLiquidationCardProps) {
  const [loading, setLoading] = useState(true)
  const [parsingPacklist, setParsingPacklist] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Datos
  const [packlistItems, setPacklistItems] = useState<DispatchPacklistItem[]>([])
  const [currency, setCurrency] = useState<'EUR' | 'USD' | 'CLP' | 'GBP' | 'CAD' | 'BRL' | 'CNY'>('EUR')
  const [targetCurrency, setTargetCurrency] = useState<'EUR' | 'USD' | 'CLP' | 'GBP' | 'CAD' | 'BRL' | 'CNY'>('USD')
  const [rateDate, setRateDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [rateProviderInfo, setRateProviderInfo] = useState<string>('')
  const [liquidationStatus, setLiquidationStatus] = useState<'draft' | 'finalized'>('draft')

  // Filas de precios por caja por calibre/embalaje
  const [rows, setRows] = useState<Array<{
    packlist_item_id?: string
    envase: string
    calibre: string
    cajas: number
    price_per_box: number
    subtotal: number
  }>>([])

  // Gastos
  const [commissionPct, setCommissionPct] = useState<number>(10)
  const [freight, setFreight] = useState<number>(0)
  const [handling, setHandling] = useState<number>(0)
  const [coldStorage, setColdStorage] = useState<number>(0)
  const [surveyor, setSurveyor] = useState<number>(0)
  const [transport, setTransport] = useState<number>(0)
  const [otherExpenses, setOtherExpenses] = useState<number>(0)

  // Anticipos y Tipo de Cambio
  const [advanceAmount, setAdvanceAmount] = useState<number>(0)
  const [exchangeRate, setExchangeRate] = useState<number>(1)

  // Obtener símbolo de moneda según código
  const getCurrencySymbol = (code: string) => {
    const found = CURRENCIES.find(c => c.code === code)
    return found ? found.symbol : '$'
  }

  const currSymbol = getCurrencySymbol(currency)
  const targetCurrSymbol = getCurrencySymbol(targetCurrency)

  // Cargar datos al montar
  const fetchLiquidationData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/despachos/${dispatchId}/liquidacion`)
      if (res.ok) {
        const data = await res.json()
        const fetchedPacklist: DispatchPacklistItem[] = data.packlistItems || []
        setPacklistItems(fetchedPacklist)

        const existingLiq: DispatchLiquidation | null = data.liquidation
        if (existingLiq) {
          setCurrency((existingLiq.currency as any) || 'EUR')
          setLiquidationStatus(existingLiq.status || 'draft')
          setCommissionPct(existingLiq.commission_percentage ?? 10)
          setFreight(existingLiq.freight_amount ?? 0)
          setHandling(existingLiq.handling_amount ?? 0)
          setColdStorage(existingLiq.cold_storage_amount ?? 0)
          setSurveyor(existingLiq.surveyor_amount ?? 0)
          setTransport(existingLiq.transport_amount ?? 0)
          setOtherExpenses(existingLiq.other_expenses ?? 0)
          setAdvanceAmount(existingLiq.advance_amount ?? 0)
          setExchangeRate(existingLiq.exchange_rate ?? 1)

          if (existingLiq.items && existingLiq.items.length > 0) {
            setRows(existingLiq.items.map(it => ({
              packlist_item_id: it.packlist_item_id || undefined,
              envase: it.envase,
              calibre: it.calibre,
              cajas: it.cajas,
              price_per_box: it.price_per_box || 0,
              subtotal: it.subtotal || (it.cajas * (it.price_per_box || 0))
            })))
          } else if (fetchedPacklist.length > 0) {
            setRows(fetchedPacklist.map(pk => ({
              packlist_item_id: pk.id,
              envase: pk.envase,
              calibre: pk.calibre,
              cajas: pk.cajas,
              price_per_box: 0,
              subtotal: 0
            })))
          }
        } else if (fetchedPacklist.length > 0) {
          setRows(fetchedPacklist.map(pk => ({
            packlist_item_id: pk.id,
            envase: pk.envase,
            calibre: pk.calibre,
            cajas: pk.cajas,
            price_per_box: 0,
            subtotal: 0
          })))
        }
      }
    } catch (e) {
      console.error('Error al cargar liquidación:', e)
    } finally {
      setLoading(false)
    }
  }, [dispatchId])

  useEffect(() => {
    fetchLiquidationData()
  }, [fetchLiquidationData])

  // Consultar tipo de cambio a la API oficial según fecha
  const handleFetchExchangeRate = async () => {
    if (currency === targetCurrency) {
      setExchangeRate(1)
      setRateProviderInfo('Misma moneda (1:1)')
      return
    }
    setFetchingRate(true)
    try {
      const res = await fetch(`/api/tipo-cambio?from=${currency}&to=${targetCurrency}&date=${rateDate}`)
      const data = await res.json()
      if (res.ok && data.rate) {
        setExchangeRate(data.rate)
        setRateProviderInfo(data.provider || 'API Divisas')
        setMessage({
          type: 'info',
          text: `Tipo de cambio (${currency} $\\rightarrow$ ${targetCurrency}) según fecha ${rateDate}: 1 ${currency} = ${data.rate} ${targetCurrency} [Fuente: ${data.provider}]`
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'No se pudo obtener la tasa de cambio.' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al consultar servicio de tipo de cambio.' })
    } finally {
      setFetchingRate(false)
    }
  }

  // Ejecutar extracción de Packlist PDF
  const handleParsePacklist = async () => {
    setParsingPacklist(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/despachos/${dispatchId}/packlist/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (res.ok && data.items) {
        setPacklistItems(data.items)
        setRows(data.items.map((pk: DispatchPacklistItem) => ({
          packlist_item_id: pk.id,
          envase: pk.envase,
          calibre: pk.calibre,
          cajas: pk.cajas,
          price_per_box: 0,
          subtotal: 0
        })))
        setMessage({ type: 'success', text: `¡Packlist procesado con éxito! Se agruparon ${data.items.length} combinaciones de embalaje y calibre.` })
      } else {
        setMessage({ type: 'error', text: data.error || data.warning || 'No se pudo procesar el Packlist.' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error de conexión al procesar el Packlist.' })
    } finally {
      setParsingPacklist(false)
    }
  }

  // Actualizar precio de venta por caja para una fila
  const handlePriceChange = (index: number, valStr: string) => {
    const price = parseFloat(valStr) || 0
    setRows(prev => {
      const copy = [...prev]
      copy[index].price_per_box = price
      copy[index].subtotal = Math.round(copy[index].cajas * price * 100) / 100
      return copy
    })
  }

  // Cálculos Financieros
  const totalCajas = rows.reduce((acc, r) => acc + r.cajas, 0)
  const grossSales = rows.reduce((acc, r) => acc + r.subtotal, 0)
  const commissionAmount = Math.round((grossSales * (commissionPct / 100)) * 100) / 100
  const totalExpenses = Math.round((
    commissionAmount + freight + handling + coldStorage + surveyor + transport + otherExpenses
  ) * 100) / 100
  const netAmount = Math.round((grossSales - totalExpenses) * 100) / 100
  const finalBalanceInCurrency = Math.round((netAmount - advanceAmount) * 100) / 100
  const finalBalanceTargetCurrency = Math.round((finalBalanceInCurrency * exchangeRate) * 100) / 100

  // Guardar Liquidación
  const handleSaveLiquidation = async (statusToSave: 'draft' | 'finalized') => {
    if (isClosed) {
      alert('No se puede modificar la liquidación de un despacho cerrado.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        currency,
        gross_sales: grossSales,
        commission_percentage: commissionPct,
        commission_amount: commissionAmount,
        freight_amount: freight,
        handling_amount: handling,
        cold_storage_amount: coldStorage,
        surveyor_amount: surveyor,
        transport_amount: transport,
        other_expenses: otherExpenses,
        total_expenses: totalExpenses,
        net_amount: netAmount,
        advance_amount: advanceAmount,
        exchange_rate: exchangeRate,
        final_balance: finalBalanceInCurrency,
        status: statusToSave,
        user_id: userId,
        items: rows
      }

      const res = await fetch(`/api/despachos/${dispatchId}/liquidacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        setLiquidationStatus(statusToSave)
        setMessage({
          type: 'success',
          text: statusToSave === 'finalized'
            ? '¡Liquidación de contenedor finalizada y guardada exitosamente!'
            : 'Borrador de liquidación guardado correctamente.'
        })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Error al guardar la liquidación.' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error de red al intentar guardar.' })
    } finally {
      setSaving(false)
    }
  }

  const formatMoney = (val: number, symbol = currSymbol) => {
    return `${symbol} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="bg-white/80 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-800 rounded-xl p-8 text-center text-slate-500 dark:text-gray-400 flex items-center justify-center gap-3 shadow-lg">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-500 dark:text-indigo-400" />
        Cargando módulo de liquidación...
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900/80 border border-slate-200 dark:border-gray-800 rounded-2xl p-6 shadow-xl dark:shadow-2xl space-y-6">
      {/* HEADER DE LIQUIDACIÓN Y SELECTOR DE MONEDA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-gray-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              Liquidación de Contenedor ({dispatchCode})
            </h2>
            <span className={`px-3 py-0.5 text-xs font-semibold rounded-full border ${
              liquidationStatus === 'finalized'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
            }`}>
              {liquidationStatus === 'finalized' ? 'FINALIZADA' : 'BORRADOR'}
            </span>
          </div>

          {/* Selector de Moneda de Venta Primaria */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-gray-300 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              Moneda de Venta de Cajas:
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              disabled={isClosed}
              className="bg-slate-50 dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition shadow-sm"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleParsePacklist}
            disabled={parsingPacklist || isClosed}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-600/30 transition disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${parsingPacklist ? 'animate-spin' : ''}`} />
            {parsingPacklist ? 'Procesando PDF...' : 'Extraer / Re-procesar Packlist'}
          </button>
        </div>
      </div>

      {/* MENSAJES DE NOTIFICACIÓN */}
      {message && (
        <div className={`p-4 rounded-xl text-sm flex items-center gap-3 border ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' :
          message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' :
          'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <div className="flex-1">{message.text}</div>
        </div>
      )}

      {/* TABLA DE PRECIOS POR CAJA POR EMBALAJE Y CALIBRE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            1. Desglose de Fruta por Embalaje y Calibre (Venta por Caja en {currency})
          </h3>
          <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
            Total Cajas: <strong className="text-slate-900 dark:text-white font-bold">{totalCajas.toLocaleString()}</strong>
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="bg-slate-50 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-8 text-center text-slate-500 dark:text-gray-400 space-y-3">
            <FileText className="w-10 h-10 text-slate-400 dark:text-gray-600 mx-auto" />
            <p className="text-sm font-medium">No hay datos del Packlist cargados en esta liquidación.</p>
            <button
              onClick={handleParsePacklist}
              disabled={parsingPacklist}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-md"
            >
              Extraer Información del Packlist PDF
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-gray-800 rounded-xl shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-gray-950/80 text-slate-600 dark:text-gray-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-gray-800">
                <tr>
                  <th className="py-3 px-4">Embalaje / Envase</th>
                  <th className="py-3 px-4">Calibre</th>
                  <th className="py-3 px-4 text-right">Cajas Totales</th>
                  <th className="py-3 px-4 text-right">Precio Venta / Caja ({currSymbol})</th>
                  <th className="py-3 px-4 text-right">Subtotal ({currSymbol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-gray-800/60 text-slate-700 dark:text-gray-300">
                {rows.map((row, idx) => (
                  <tr key={`${row.envase}_${row.calibre}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{row.envase}</td>
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{row.calibre}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-800 dark:text-gray-200">{row.cajas.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1 bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 focus-within:border-indigo-500 shadow-inner">
                        <span className="text-slate-400 dark:text-gray-500 font-bold">{currSymbol}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.price_per_box || ''}
                          onChange={(e) => handlePriceChange(idx, e.target.value)}
                          disabled={isClosed}
                          placeholder="0.00"
                          className="w-24 bg-transparent text-right font-mono font-bold text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(row.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-gray-950/90 font-bold border-t border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-slate-500 dark:text-gray-400">Total Venta Bruta Contenedor ({currency})</td>
                  <td className="py-3 px-4 text-right font-mono">{totalCajas.toLocaleString()} cajas</td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                    {formatMoney(grossSales)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: GASTOS Y DEDUCCIONES EN DESTINO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-gray-800">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
            <Percent className="w-4 h-4 text-red-500 dark:text-red-400" />
            2. Gastos en Destino y Comisión ({currency})
          </h3>

          <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Comisión sobre Venta (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(parseFloat(e.target.value) || 0)}
                  disabled={isClosed}
                  className="w-20 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                />
                <span className="font-mono text-red-600 dark:text-red-400 font-bold">{formatMoney(commissionAmount)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Flete Marítimo ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={freight || ''}
                onChange={(e) => setFreight(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Handling / Puerto ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={handling || ''}
                onChange={(e) => setHandling(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Almacén Frigorífico ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={coldStorage || ''}
                onChange={(e) => setColdStorage(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Surveyor / Inspección ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={surveyor || ''}
                onChange={(e) => setSurveyor(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Transporte Local ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={transport || ''}
                onChange={(e) => setTransport(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Otros Gastos ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                value={otherExpenses || ''}
                onChange={(e) => setOtherExpenses(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-gray-800 flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
              <span>TOTAL GASTOS Y DEDUCCIONES</span>
              <span className="font-mono text-sm">-{formatMoney(totalExpenses)}</span>
            </div>
          </div>
        </div>

        {/* SECCIÓN 3: RESUMEN FINANCIERO Y CONVERSIÓN DE MONEDA A TRANSFERIR */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            3. Resumen y Conversión a Moneda Final
          </h3>

          <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-800 pb-3">
              <span className="text-xs text-slate-500 dark:text-gray-400">Venta Bruta Total ({currency}):</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{formatMoney(grossSales)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-800 pb-3">
              <span className="text-xs text-slate-500 dark:text-gray-400">Total Deducciones ({currency}):</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-400 text-sm">-{formatMoney(totalExpenses)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-800 pb-3 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Importe Neto a Favor ({currSymbol}):</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-base">{formatMoney(netAmount)}</span>
            </div>

            <div className="space-y-3 pt-1 border-b border-slate-200 dark:border-gray-800 pb-3">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-700 dark:text-gray-300 font-medium">Anticipo Recibido ({currSymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  value={advanceAmount || ''}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  disabled={isClosed}
                  placeholder="0.00"
                  className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              {/* Selector de Moneda Objetivo y Tasa por Fecha API */}
              <div className="bg-slate-100 dark:bg-gray-900/80 border border-slate-200 dark:border-gray-800 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-700 dark:text-gray-300">Moneda Final Transferencia:</span>
                  <select
                    value={targetCurrency}
                    onChange={(e) => setTargetCurrency(e.target.value as any)}
                    disabled={isClosed}
                    className="bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-slate-600 dark:text-gray-400 font-medium">Fecha Cambio:</span>
                    <input
                      type="date"
                      value={rateDate}
                      onChange={(e) => setRateDate(e.target.value)}
                      disabled={isClosed}
                      className="bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-0.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleFetchExchangeRate}
                    disabled={fetchingRate || isClosed}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-sm disabled:opacity-50"
                  >
                    <Globe className={`w-3.5 h-3.5 ${fetchingRate ? 'animate-spin' : ''}`} />
                    {fetchingRate ? 'Consultando...' : 'Obtener Cambio API'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <label className="text-slate-700 dark:text-gray-300 font-medium">Tasa de Cambio ({currency} $\rightarrow$ {targetCurrency})</label>
                    {rateProviderInfo && (
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400">{rateProviderInfo}</p>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                    disabled={isClosed}
                    className="w-24 bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* TARJETA DE SALDO FINAL A TRANSFERIR */}
            <div className="bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-emerald-950/60 dark:to-indigo-950/60 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 space-y-1 shadow-sm">
              <div className="text-[11px] uppercase font-bold text-emerald-800 dark:text-emerald-400 tracking-wider">
                Saldo Pendiente a Transferir ({targetCurrency})
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                  {targetCurrSymbol} {finalBalanceTargetCurrency.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {targetCurrency}
                </span>
                <span className="text-xs text-slate-500 dark:text-gray-400 font-mono font-medium">
                  ({formatMoney(finalBalanceInCurrency, currSymbol)})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTONES DE ACCIÓN */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-gray-800">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 border border-slate-300 dark:border-gray-700 rounded-xl transition"
        >
          <Printer className="w-4 h-4" />
          Imprimir / Exportar
        </button>

        <button
          onClick={() => handleSaveLiquidation('draft')}
          disabled={saving || isClosed}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-800 dark:text-white rounded-xl transition border border-slate-300 dark:border-gray-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 text-amber-500 dark:text-yellow-400" />
          Guardar Borrador
        </button>

        <button
          onClick={() => handleSaveLiquidation('finalized')}
          disabled={saving || isClosed}
          className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition shadow-lg shadow-emerald-900/30 disabled:opacity-50"
        >
          <FileCheck className="w-4 h-4" />
          Finalizar Liquidación
        </button>
      </div>
    </div>
  )
}
