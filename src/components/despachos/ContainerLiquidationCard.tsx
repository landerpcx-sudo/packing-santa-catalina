'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Calculator, RefreshCw, FileText, CheckCircle2,
  AlertCircle, Save, Printer, ArrowRight, Package, Percent, FileCheck
} from 'lucide-react'
import { DispatchPacklistItem, DispatchLiquidationItem, DispatchLiquidation } from '@/lib/types'

interface ContainerLiquidationCardProps {
  dispatchId: string
  dispatchCode: string
  isClosed?: boolean
  userId?: string
}

export default function ContainerLiquidationCard({
  dispatchId,
  dispatchCode,
  isClosed = false,
  userId
}: ContainerLiquidationCardProps) {
  const [loading, setLoading] = useState(true)
  const [parsingPacklist, setParsingPacklist] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Datos
  const [packlistItems, setPacklistItems] = useState<DispatchPacklistItem[]>([])
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'CLP'>('EUR')
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
  const [targetCurrency, setTargetCurrency] = useState<'USD' | 'EUR' | 'CLP'>('USD')

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
            // Construir filas a partir de packlist
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

  const formatMoney = (val: number, currSymbol = '€') => {
    return `${currSymbol} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-8 text-center text-gray-400 flex items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        Cargando módulo de liquidación...
      </div>
    )
  }

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
      {/* HEADER DE LIQUIDACIÓN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-emerald-400" />
              Liquidación de Contenedor ({dispatchCode})
            </h2>
            <span className={`px-3 py-0.5 text-xs font-semibold rounded-full border ${
              liquidationStatus === 'finalized'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
            }`}>
              {liquidationStatus === 'finalized' ? 'FINALIZADA' : 'BORRADOR'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Captura de cajas por calibre desde Packlist e ingreso de precios medios de venta por caja.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleParsePacklist}
            disabled={parsingPacklist || isClosed}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/30 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${parsingPacklist ? 'animate-spin' : ''}`} />
            {parsingPacklist ? 'Procesando PDF...' : 'Extraer / Re-procesar Packlist'}
          </button>
        </div>
      </div>

      {/* MENSAJES DE NOTIFICACIÓN */}
      {message && (
        <div className={`p-4 rounded-xl text-sm flex items-center gap-3 border ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
          'bg-blue-500/10 border-blue-500/30 text-blue-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <div className="flex-1">{message.text}</div>
        </div>
      )}

      {/* TABLA DE PRECIOS POR CAJA POR EMBALAJE Y CALIBRE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-400" />
            1. Desglose de Fruta por Embalaje y Calibre (Venta por Caja)
          </h3>
          <span className="text-xs text-gray-400 font-mono">
            Total Cajas: <strong className="text-white">{totalCajas.toLocaleString()}</strong>
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-8 text-center text-gray-400 space-y-3">
            <FileText className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-sm">No hay datos del Packlist cargados en esta liquidación.</p>
            <button
              onClick={handleParsePacklist}
              disabled={parsingPacklist}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
            >
              Extraer Información del Packlist PDF
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950/80 text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-800">
                <tr>
                  <th className="py-3 px-4">Embalaje / Envase</th>
                  <th className="py-3 px-4">Calibre</th>
                  <th className="py-3 px-4 text-right">Cajas Totales</th>
                  <th className="py-3 px-4 text-right">Precio Venta / Caja (€)</th>
                  <th className="py-3 px-4 text-right">Subtotal (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 text-gray-300">
                {rows.map((row, idx) => (
                  <tr key={`${row.envase}_${row.calibre}_${idx}`} className="hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-medium text-white">{row.envase}</td>
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400">{row.calibre}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-200">{row.cajas.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 focus-within:border-indigo-500">
                        <span className="text-gray-500">€</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.price_per_box || ''}
                          onChange={(e) => handlePriceChange(idx, e.target.value)}
                          disabled={isClosed}
                          placeholder="0.00"
                          className="w-24 bg-transparent text-right font-mono font-bold text-white outline-none"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatMoney(row.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-950/90 font-bold border-t border-gray-800 text-white">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-gray-400">Total Venta Bruta Contenedor</td>
                  <td className="py-3 px-4 text-right font-mono">{totalCajas.toLocaleString()} cajas</td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400 text-sm">
                    {formatMoney(grossSales)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: GASTOS Y DEDUCCIONES EN DESTINO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-800">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Percent className="w-4 h-4 text-red-400" />
            2. Gastos en Destino y Comisión
          </h3>

          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Comisión sobre Venta (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(parseFloat(e.target.value) || 0)}
                  disabled={isClosed}
                  className="w-20 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white outline-none focus:border-indigo-500 text-xs"
                />
                <span className="font-mono text-red-400">{formatMoney(commissionAmount)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Flete Marítimo (€)</label>
              <input
                type="number"
                step="0.01"
                value={freight || ''}
                onChange={(e) => setFreight(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Handling / Puerto (€)</label>
              <input
                type="number"
                step="0.01"
                value={handling || ''}
                onChange={(e) => setHandling(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Almacén Frigorífico (€)</label>
              <input
                type="number"
                step="0.01"
                value={coldStorage || ''}
                onChange={(e) => setColdStorage(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Surveyor / Inspección (€)</label>
              <input
                type="number"
                step="0.01"
                value={surveyor || ''}
                onChange={(e) => setSurveyor(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Transporte Local (€)</label>
              <input
                type="number"
                step="0.01"
                value={transport || ''}
                onChange={(e) => setTransport(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-gray-300">Otros Gastos (€)</label>
              <input
                type="number"
                step="0.01"
                value={otherExpenses || ''}
                onChange={(e) => setOtherExpenses(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0.00"
                className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="pt-2 border-t border-gray-800 flex items-center justify-between text-xs font-bold text-red-400">
              <span>TOTAL GASTOS Y DEDUCCIONES</span>
              <span className="font-mono text-sm">-{formatMoney(totalExpenses)}</span>
            </div>
          </div>
        </div>

        {/* SECCIÓN 3: RESUMEN FINANCIERO Y SALDO FINAL */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            3. Resumen y Saldo Final a Transferir
          </h3>

          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-xs text-gray-400">Venta Bruta Total:</span>
              <span className="font-mono font-bold text-white text-sm">{formatMoney(grossSales)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-xs text-gray-400">Total Deducciones:</span>
              <span className="font-mono font-bold text-red-400 text-sm">-{formatMoney(totalExpenses)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-gray-800 pb-3 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-300">Importe Neto a Favor (€):</span>
              <span className="font-mono font-bold text-emerald-400 text-base">{formatMoney(netAmount)}</span>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label className="text-gray-300">Anticipo Recibido (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={advanceAmount || ''}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  disabled={isClosed}
                  placeholder="0.00"
                  className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="text-gray-300">Tipo de Cambio (EUR $\rightarrow$ USD)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                  disabled={isClosed}
                  className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-white outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            </div>

            {/* TARJETA DE SALDO FINAL A TRANSFERIR */}
            <div className="bg-gradient-to-r from-emerald-950/60 to-indigo-950/60 border border-emerald-500/30 rounded-xl p-4 space-y-1">
              <div className="text-[11px] uppercase font-bold text-emerald-400 tracking-wider">
                Saldo Pendiente a Transferir
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-white">
                  $ {finalBalanceTargetCurrency.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  ({formatMoney(finalBalanceInCurrency, '€')})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTONES DE ACCIÓN */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gray-800">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-xl transition"
        >
          <Printer className="w-4 h-4" />
          Imprimir / Exportar
        </button>

        <button
          onClick={() => handleSaveLiquidation('draft')}
          disabled={saving || isClosed}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition border border-gray-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 text-yellow-400" />
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
