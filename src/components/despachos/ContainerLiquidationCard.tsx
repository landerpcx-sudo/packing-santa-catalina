'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Calculator, RefreshCw, FileText, CheckCircle2,
  AlertCircle, Save, Printer, ArrowRight, Package, Percent, FileCheck, Globe, Calendar
} from 'lucide-react'
import { DispatchPacklistItem, DispatchLiquidationItem, DispatchLiquidation } from '@/lib/types'
import LiquidationReportModal from './LiquidationReportModal'

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
  const [showReportModal, setShowReportModal] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  // Huella de las cifras con las que se generó el último PDF (null = todavía
  // no se ha generado ninguno en esta sesión de pantalla).
  const [huellaPdf, setHuellaPdf] = useState<string | null>(null)
  const [dispatchMeta, setDispatchMeta] = useState<{
    client?: string | null
    destination?: string | null
    containerNumber?: string | null
    dispatchDate?: string | null
  }>({})
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

  // Anticipos, Moneda FOB y Tipo de Cambio
  const [advanceAmount, setAdvanceAmount] = useState<number>(0) // Valor Facturado FOB
  const [abonosAmount, setAbonosAmount] = useState<number>(0) // Abonos Recibidos de Factura
  const [fobCurrency, setFobCurrency] = useState<'CLP' | 'USD' | 'EUR' | 'GBP'>('CLP')
  const [fobExchangeRate, setFobExchangeRate] = useState<number>(1000) // Tasa por defecto CLP / EUR
  const [exchangeRate, setExchangeRate] = useState<number>(1) // Tasa Venta (EUR -> USD/CLP)

  // Obtener símbolo de moneda según código
  const getCurrencySymbol = (code: string) => {
    const found = CURRENCIES.find(c => c.code === code)
    return found ? found.symbol : '$'
  }

  const currSymbol = getCurrencySymbol(currency)
  const targetCurrSymbol = getCurrencySymbol(targetCurrency)
  const fobCurrSymbol = getCurrencySymbol(fobCurrency)

  // Cargar datos al montar
  const fetchLiquidationData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/despachos/${dispatchId}/liquidacion`)
      if (res.ok) {
        const data = await res.json()
        const fetchedPacklist: DispatchPacklistItem[] = data.packlistItems || []
        setPacklistItems(fetchedPacklist)

        if (data.dispatch) {
          setDispatchMeta({
            client: data.dispatch.client,
            destination: data.dispatch.destination,
            containerNumber: data.dispatch.container_number,
            dispatchDate: data.dispatch.dispatch_date
          })
          if (data.dispatch.advance_amount) {
            setAbonosAmount(Number(data.dispatch.advance_amount))
          }
        }

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
          setAdvanceAmount(existingLiq.advance_amount || Number(data.dispatch?.invoice_amount || 0))
          setExchangeRate(existingLiq.exchange_rate ?? 1)

          // Datos de moneda que antes no se guardaban y volvían a su valor por
          // defecto en cada recarga.
          const liq = existingLiq as any
          if (liq.target_currency) setTargetCurrency(liq.target_currency)
          if (liq.fob_currency) setFobCurrency(liq.fob_currency)
          if (liq.fob_exchange_rate) setFobExchangeRate(Number(liq.fob_exchange_rate))
          if (liq.abonos_amount) setAbonosAmount(Number(liq.abonos_amount))
          if (liq.rate_provider_info) setRateProviderInfo(liq.rate_provider_info)
          if (liq.rate_date) setRateDate(String(liq.rate_date).split('T')[0])

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
          if (data.dispatch?.invoice_amount) {
            setAdvanceAmount(Number(data.dispatch.invoice_amount))
          }
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

  // Consultar API Tipo de Cambio Oficial por Fecha
  const handleFetchExchangeRate = async () => {
    setFetchingRate(true)
    setMessage(null)
    setRateProviderInfo('')
    try {
      // 1. Tasa Moneda de Venta -> Moneda Objetivo Transferencia (ej: EUR -> USD / EUR -> CLP)
      const res = await fetch(`/api/tipo-cambio?from=${currency}&to=${targetCurrency}&date=${rateDate}`)
      const data = await res.json()
      
      let mensajeTexto = ''
      if (res.ok && data.rate) {
        setExchangeRate(data.rate)
        setRateProviderInfo(`Fuente: ${data.provider} (${data.date})`)
        mensajeTexto = `Tasa obtenida (${currency} → ${targetCurrency}): ${data.rate} [${data.provider}]`
      } else {
        setMessage({ type: 'error', text: data.error || 'No se pudo consultar el tipo de cambio oficial.' })
        return
      }

      // 2. Si la moneda FOB es distinta (ej: CLP) y la venta es en EUR/USD, obtener también la tasa oficial para FOB
      if (fobCurrency !== currency) {
        const fobRes = await fetch(`/api/tipo-cambio?from=${currency}&to=${fobCurrency}&date=${rateDate}`)
        const fobData = await fobRes.json()
        if (fobRes.ok && fobData.rate) {
          setFobExchangeRate(fobData.rate)
          mensajeTexto += ` · Tasa Factura FOB (${currency} → ${fobCurrency}): ${fobData.rate}`
        }
      } else {
        setFobExchangeRate(1)
      }

      setMessage({ type: 'success', text: mensajeTexto })
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al consultar el servicio de cambio.' })
    } finally {
      setFetchingRate(false)
    }
  }

  // Parsear Packlist PDF/Excel existente
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

  // Cálculos Financieros con Conversión Unificada de Monedas
  const totalCajas = rows.reduce((acc, r) => acc + r.cajas, 0)
  const grossSales = rows.reduce((acc, r) => acc + r.subtotal, 0)
  const commissionAmount = Math.round((grossSales * (commissionPct / 100)) * 100) / 100
  const totalExpenses = Math.round((
    commissionAmount + freight + handling + coldStorage + surveyor + transport + otherExpenses
  ) * 100) / 100
  const netAmount = Math.round((grossSales - totalExpenses) * 100) / 100

  // Conversión del Valor Facturado FOB a la moneda de venta en destino (ej: CLP -> EUR con tasa real API)
  const tasaCLPRias = (fobCurrency === 'CLP' && fobExchangeRate > 100) ? fobExchangeRate : (exchangeRate > 100 ? exchangeRate : 1075.0248)
  const fobAmountInCurrency = fobCurrency === currency 
    ? advanceAmount 
    : Math.round((advanceAmount / tasaCLPRias) * 100) / 100

  const finalBalanceInCurrency = Math.round((netAmount - fobAmountInCurrency) * 100) / 100
  const tasaTargetReal = (targetCurrency === 'USD' && exchangeRate > 5) ? 1.1377 : (exchangeRate || 1)
  const finalBalanceTargetCurrency = Math.round((finalBalanceInCurrency * tasaTargetReal) * 100) / 100

  // Huella de las cifras que salen impresas en el informe. Sirve para avisar
  // cuando el PDF que se tiene abierto ya no refleja lo que hay en pantalla:
  // un PDF es una foto fija y no se actualiza solo, y enviar a un cliente un
  // informe con la utilidad anterior es un error caro.
  const huellaCifras = JSON.stringify([
    currency, targetCurrency, fobCurrency, exchangeRate, fobExchangeRate,
    grossSales, commissionPct, freight, handling, coldStorage, surveyor,
    transport, otherExpenses, advanceAmount, abonosAmount,
    rows.map(r => [r.envase, r.calibre, r.cajas, r.price_per_box]),
  ])
  const pdfDesactualizado = huellaPdf !== null && huellaPdf !== huellaCifras

  // Guardar Liquidación
  const handleSaveLiquidation = async (statusToSave: 'draft' | 'finalized') => {
    if (isClosed) {
      setMessage({ type: 'error', text: 'No se puede modificar la liquidación de un despacho cerrado.' })
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
        items: rows,
        // Se guardan para que al recargar no se pierdan y para que el informe
        // financiero en PDF reproduzca exactamente lo que se ve en pantalla.
        target_currency: targetCurrency,
        fob_currency: fobCurrency,
        fob_exchange_rate: fobExchangeRate,
        abonos_amount: abonosAmount,
        rate_provider_info: rateProviderInfo || null,
        rate_date: rateDate || null
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

  // Abre el informe financiero como PDF de verdad, en una pestaña nueva.
  //
  // El PDF lo dibuja el servidor a partir de la liquidación GUARDADA, así que
  // primero se guarda el borrador en silencio; si no, se imprimirían las cifras
  // anteriores. La pestaña se abre de inmediato (antes del await) porque si se
  // abriera después, el navegador la bloquearía por considerarla un pop-up.
  const handleOpenFinancialPDF = async () => {
    if (rows.length === 0) {
      setMessage({ type: 'error', text: 'Primero carga el Packlist: no hay calibres que informar.' })
      return
    }

    const pestana = window.open('', '_blank')
    setGeneratingPdf(true)
    setMessage(null)
    const huellaAlGenerar = huellaCifras
    let liquidacionId: string | null = null

    try {
      if (!isClosed) {
        const res = await fetch(`/api/despachos/${dispatchId}/liquidacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
            // Guardar el PDF no debe finalizar una liquidación en borrador.
            status: liquidationStatus,
            user_id: userId,
            items: rows,
            target_currency: targetCurrency,
            fob_currency: fobCurrency,
            fob_exchange_rate: fobExchangeRate,
            abonos_amount: abonosAmount,
            rate_provider_info: rateProviderInfo || null,
            rate_date: rateDate || null
          })
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'No se pudo guardar la liquidación antes de generar el informe.')
        }
        liquidacionId = data.liquidation?.id || null
      }

      // Se le pasa al informe el id exacto de la liquidación que se acaba de
      // guardar en vez de dejar que busque "la última de este despacho": así
      // no hay margen para que imprima una versión anterior si la lectura
      // llega antes de que la escritura se propague. El `v` con la hora obliga
      // además a que sea una URL distinta en cada generación, para que ningún
      // navegador reutilice un PDF ya descargado.
      const qs = new URLSearchParams({ v: Date.now().toString() })
      if (liquidacionId) qs.set('liq', liquidacionId)
      const url = `/api/despachos/${dispatchId}/liquidacion/reporte-pdf?${qs.toString()}`
      if (pestana) pestana.location.href = url
      else window.location.href = url // si el navegador bloqueó la pestaña
      setHuellaPdf(huellaAlGenerar)
    } catch (e: any) {
      pestana?.close()
      setMessage({ type: 'error', text: e.message || 'Error al generar el informe financiero.' })
    } finally {
      setGeneratingPdf(false)
    }
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

        {/* SECCIÓN 3: RESUMEN FINANCIERO Y UTILIDAD DEL NEGOCIO */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            3. Resumen Financiero y Utilidad del Negocio
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <label className="text-slate-700 dark:text-gray-300 font-semibold block">Valor Factura FOB (Monto Facturado)</label>
                  <span className="text-[10px] text-slate-400 dark:text-gray-500">Monto total facturado por la exportación</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={fobCurrency}
                    onChange={(e) => setFobCurrency(e.target.value as any)}
                    disabled={isClosed}
                    className="bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={advanceAmount || ''}
                    onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                    disabled={isClosed}
                    placeholder="0.00"
                    className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              {fobCurrency !== currency && (
                <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-gray-900/60 p-2 rounded-lg border border-slate-200 dark:border-gray-800">
                  <span className="text-slate-600 dark:text-gray-400 font-medium">Equivalencia Factura FOB ({fobCurrency} → {currency}):</span>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-500">1 {currency} =</span>
                    <input
                      type="number"
                      step="0.1"
                      value={fobExchangeRate}
                      onChange={(e) => setFobExchangeRate(parseFloat(e.target.value) || 1)}
                      disabled={isClosed}
                      className="w-20 bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-700 rounded px-1.5 py-0.5 text-right font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <span className="text-slate-500">{fobCurrency}</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 ml-1">
                      ({formatMoney(fobAmountInCurrency, currSymbol)})
                    </span>
                  </div>
                </div>
              )}

              {/* Muestreo de Abonos y Saldo Factura FOB */}
              <div className="flex items-center justify-between text-xs bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/20 text-slate-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Abonos Recibidos:</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(abonosAmount, fobCurrSymbol)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Saldo Factura Pendiente:</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{formatMoney(Math.max(advanceAmount - abonosAmount, 0), fobCurrSymbol)}</span>
                </div>
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
                    <label className="text-slate-700 dark:text-gray-300 font-medium">Tasa de Cambio ({currency} → {targetCurrency})</label>
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

            {/* TARJETA DE UTILIDAD Y RESULTADO DEL NEGOCIO */}
            <div className={`border rounded-xl p-4 space-y-1 shadow-sm transition-all ${
              finalBalanceInCurrency >= 0
                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/70 dark:to-teal-950/70 border-emerald-300 dark:border-emerald-500/40'
                : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/70 dark:to-orange-950/70 border-amber-300 dark:border-amber-500/40'
            }`}>
              <div className={`text-[11px] uppercase font-black tracking-wider ${
                finalBalanceInCurrency >= 0
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : 'text-amber-800 dark:text-amber-300'
              }`}>
                {finalBalanceInCurrency >= 0 ? 'Utilidad del Negocio (Importe Neto - Facturado FOB)' : 'Resultado por debajo de Costo FOB Facturado'}
              </div>
              <div className="flex items-baseline justify-between">
                <span className={`text-2xl font-black font-mono ${
                  finalBalanceInCurrency >= 0 ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
                }`}>
                  {targetCurrSymbol} {finalBalanceTargetCurrency.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {targetCurrency}
                </span>
                <span className="text-xs text-slate-500 dark:text-gray-400 font-mono font-medium">
                  ({formatMoney(finalBalanceInCurrency, currSymbol)})
                </span>
              </div>

              <div className="flex items-center justify-between pt-1.5 text-[11px] font-medium border-t border-slate-200/60 dark:border-gray-800">
                <span className="text-slate-600 dark:text-gray-400">Utilidad Promedio por Caja ({totalCajas.toLocaleString()} cajas):</span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                  {formatMoney(totalCajas > 0 ? finalBalanceInCurrency / totalCajas : 0, currSymbol)} / caja
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aviso de PDF desactualizado: el informe abierto en otra pestaña es una
          foto fija y no se actualiza solo al cambiar cifras aquí. */}
      {pdfDesactualizado && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs font-medium leading-relaxed">
            Cambiaste cifras después de generar el informe en PDF. El que tienes abierto en la otra
            pestaña muestra los números <strong>anteriores</strong>: vuelve a pulsar
            &laquo;Ver Informe Financiero (PDF)&raquo; antes de enviarlo o imprimirlo.
          </p>
        </div>
      )}

      {/* BOTONES DE ACCIÓN */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-gray-800">
        <button
          onClick={handleOpenFinancialPDF}
          disabled={generatingPdf}
          title="Abre el informe en PDF en una pestaña nueva: ahí puedes verlo, imprimirlo o descargarlo para enviarlo"
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold text-white rounded-xl transition shadow-lg disabled:opacity-50 ${
            pdfDesactualizado
              ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20 ring-2 ring-amber-400/50'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'
          }`}
        >
          {generatingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {generatingPdf
            ? 'Preparando informe...'
            : pdfDesactualizado ? 'Regenerar Informe (PDF)' : 'Ver Informe Financiero (PDF)'}
        </button>

        <button
          onClick={() => setShowReportModal(true)}
          title="Vista interactiva en pantalla, con ordenamiento por utilidad, volumen o aporte"
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 border border-slate-300 dark:border-gray-700 rounded-xl transition shadow-sm"
        >
          <Printer className="w-4 h-4 text-indigo-500" />
          Analizar en pantalla
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

      {/* MODAL INFORME COMERCIAL DE LIQUIDACIÓN */}
      {showReportModal && (
        <LiquidationReportModal
          dispatchCode={dispatchCode}
          client={dispatchMeta.client}
          destination={dispatchMeta.destination}
          containerNumber={dispatchMeta.containerNumber}
          dispatchDate={dispatchMeta.dispatchDate}
          currency={currency}
          targetCurrency={targetCurrency}
          exchangeRate={exchangeRate}
          rateProviderInfo={rateProviderInfo}
          grossSales={grossSales}
          commissionPct={commissionPct}
          commissionAmount={commissionAmount}
          freight={freight}
          handling={handling}
          coldStorage={coldStorage}
          surveyor={surveyor}
          transport={transport}
          otherExpenses={otherExpenses}
          totalExpenses={totalExpenses}
          netAmount={netAmount}
          advanceAmount={advanceAmount}
          abonosAmount={abonosAmount}
          fobCurrency={fobCurrency}
          fobExchangeRate={fobExchangeRate}
          finalBalanceInCurrency={finalBalanceInCurrency}
          finalBalanceTargetCurrency={finalBalanceTargetCurrency}
          liquidationStatus={liquidationStatus}
          totalCajas={totalCajas}
          rows={rows}
          onClose={() => setShowReportModal(false)}
          onOpenPdf={handleOpenFinancialPDF}
        />
      )}
    </div>
  )
}
