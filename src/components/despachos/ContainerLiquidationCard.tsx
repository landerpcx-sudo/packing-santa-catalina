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

  // Costos de Planta a Puerto (Gastos de Origen)
  const [inlandFreight, setInlandFreight] = useState<number>(0)
  const [customsBrokerage, setCustomsBrokerage] = useState<number>(0)
  const [phytosanitarySag, setPhytosanitarySag] = useState<number>(0)
  const [portExpensesOrigin, setPortExpensesOrigin] = useState<number>(0)
  const [inlandInsurance, setInlandInsurance] = useState<number>(0)
  const [otherOriginExpenses, setOtherOriginExpenses] = useState<number>(0)

  // Anticipos, Moneda EXW / Origen y Tipo de Cambio
  const [advanceAmount, setAdvanceAmount] = useState<number>(0) // Valor Facturado EXW
  const [abonosAmount, setAbonosAmount] = useState<number>(0) // Abonos Recibidos de Factura EXW
  const [fobCurrency, setFobCurrency] = useState<'CLP' | 'USD' | 'EUR' | 'GBP'>('CLP')
  const [fobExchangeRate, setFobExchangeRate] = useState<number>(1000) // Tasa por defecto CLP / EUR
  const [exchangeRate, setExchangeRate] = useState<number>(1000) // Tasa Venta (EUR/USD -> CLP)

  // Obtener símbolo de moneda según código
  const getCurrencySymbol = (code: string) => {
    const found = CURRENCIES.find(c => c.code === code)
    return found ? found.symbol : '$'
  }

  const currSymbol = getCurrencySymbol(currency)
  const targetCurrSymbol = getCurrencySymbol(targetCurrency)
  const fobCurrSymbol = '$ CLP'

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
          const initialAdvance = (existingLiq.advance_amount && Number(existingLiq.advance_amount) > 0)
            ? Number(existingLiq.advance_amount)
            : Number(data.dispatch?.invoice_amount || 0)
          setAdvanceAmount(initialAdvance)

          const loadedRate = Number(existingLiq.exchange_rate)
          if (existingLiq.currency !== 'CLP' && (!loadedRate || loadedRate <= 5)) {
            setExchangeRate(1050)
          } else {
            setExchangeRate(loadedRate || 1000)
          }

          // Costos de Planta a Puerto (Gastos de Origen en CLP)
          if (existingLiq.inland_freight !== undefined) setInlandFreight(Number(existingLiq.inland_freight) || 0)
          if (existingLiq.customs_brokerage !== undefined) setCustomsBrokerage(Number(existingLiq.customs_brokerage) || 0)
          if (existingLiq.phytosanitary_sag !== undefined) setPhytosanitarySag(Number(existingLiq.phytosanitary_sag) || 0)
          if (existingLiq.port_expenses_origin !== undefined) setPortExpensesOrigin(Number(existingLiq.port_expenses_origin) || 0)
          if (existingLiq.inland_insurance !== undefined) setInlandInsurance(Number(existingLiq.inland_insurance) || 0)
          if (existingLiq.other_origin_expenses !== undefined) setOtherOriginExpenses(Number(existingLiq.other_origin_expenses) || 0)

          // Datos adicionales
          const liq = existingLiq as any
          if (liq.target_currency) setTargetCurrency(liq.target_currency)
          setFobCurrency('CLP')
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

  // Consultar API Tipo de Cambio Oficial (Moneda Destino -> CLP Pesos Chilenos)
  const handleFetchExchangeRate = async () => {
    if (currency === 'CLP') {
      setExchangeRate(1)
      setFobExchangeRate(1)
      setMessage({ type: 'info', text: 'La moneda de venta es CLP: la tasa de cambio es 1.00.' })
      return
    }
    setFetchingRate(true)
    setMessage(null)
    setRateProviderInfo('')
    try {
      const res = await fetch(`/api/tipo-cambio?from=${currency}&to=CLP&date=${rateDate}`)
      const data = await res.json()
      
      if (res.ok && data.rate) {
        setExchangeRate(data.rate)
        setFobExchangeRate(data.rate)
        setRateProviderInfo(`Fuente: ${data.provider} (${data.date || rateDate})`)
        setMessage({ type: 'success', text: `Tasa obtenida (1 ${currency} = $ ${data.rate.toLocaleString('es-CL')} CLP) [${data.provider}]` })
      } else {
        setMessage({ type: 'error', text: data.error || 'No se pudo consultar el tipo de cambio oficial.' })
      }
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

  // Cálculos Financieros: Origen 100% en Pesos Chilenos (CLP) y Destino en Moneda de Venta
  const totalCajas = rows.reduce((acc, r) => acc + r.cajas, 0)
  const grossSales = rows.reduce((acc, r) => acc + r.subtotal, 0)
  const commissionAmount = Math.round((grossSales * (commissionPct / 100)) * 100) / 100
  const totalExpenses = Math.round((
    commissionAmount + freight + handling + coldStorage + surveyor + transport + otherExpenses
  ) * 100) / 100
  const netAmount = Math.round((grossSales - totalExpenses) * 100) / 100

  // Costos de Planta a Puerto (Gastos Origen en CLP)
  const originExpensesTotal = Math.round((
    inlandFreight + customsBrokerage + phytosanitarySag + portExpensesOrigin + inlandInsurance + otherOriginExpenses
  ) * 100) / 100

  // Costo FOB Real en Puerto (CLP) = Factura EXW + Costos Planta a Puerto
  const realFobCLP = Math.round((advanceAmount + originExpensesTotal) * 100) / 100

  // Conversión de Moneda (Moneda Destino -> CLP)
  const tasaCLP = currency === 'CLP' ? 1 : (exchangeRate || 1)
  const netAmountCLP = currency === 'CLP' ? netAmount : Math.round((netAmount * tasaCLP) * 100) / 100
  const realFobInCurrency = currency === 'CLP' ? realFobCLP : Math.round((realFobCLP / (tasaCLP || 1)) * 100) / 100

  // Utilidad Real del Negocio
  const finalBalanceCLP = Math.round((netAmountCLP - realFobCLP) * 100) / 100
  const finalBalanceSalesCurrency = currency === 'CLP' ? finalBalanceCLP : Math.round((finalBalanceCLP / (tasaCLP || 1)) * 100) / 100
  const finalBalanceInCurrency = finalBalanceSalesCurrency // Compatibilidad prop modal

  // Huella de las cifras que salen impresas en el informe.
  const huellaCifras = JSON.stringify([
    currency, targetCurrency, fobCurrency, exchangeRate, fobExchangeRate,
    grossSales, commissionPct, freight, handling, coldStorage, surveyor,
    transport, otherExpenses, advanceAmount, abonosAmount,
    inlandFreight, customsBrokerage, phytosanitarySag, portExpensesOrigin, inlandInsurance, otherOriginExpenses,
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
        target_currency: targetCurrency,
        fob_currency: fobCurrency,
        fob_exchange_rate: fobExchangeRate,
        abonos_amount: abonosAmount,
        rate_provider_info: rateProviderInfo || null,
        rate_date: rateDate || null,
        // Costos de Planta a Puerto
        inland_freight: inlandFreight,
        customs_brokerage: customsBrokerage,
        phytosanitary_sag: phytosanitarySag,
        port_expenses_origin: portExpensesOrigin,
        inland_insurance: inlandInsurance,
        other_origin_expenses: otherOriginExpenses,
        origin_expenses_total: originExpensesTotal,
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
            rate_date: rateDate || null,
            inland_freight: inlandFreight,
            customs_brokerage: customsBrokerage,
            phytosanitary_sag: phytosanitarySag,
            port_expenses_origin: portExpensesOrigin,
            inland_insurance: inlandInsurance,
            other_origin_expenses: otherOriginExpenses,
            origin_expenses_total: originExpensesTotal,
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

      {/* SECCIÓN 1: ORIGEN (FRUTA EN PLANTA EXW Y COSTOS PLANTA A PUERTO EN CLP) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            1. ORIGEN: Fruta en Planta (EXW) y Costos de Planta a Puerto (CLP $)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1.1 FACTURA FRUTA EN PLANTA (EXW) */}
          <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-gray-800 pb-2">
              <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                1.1. Factura Fruta en Planta (EXW)
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                Monto total facturado por la fruta producida en packing (Pesos Chilenos)
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-semibold">Monto Factura EXW:</label>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-gray-300 text-xs px-2 py-1 bg-slate-200/60 dark:bg-gray-800 rounded-lg">CLP ($)</span>
                <input
                  type="number"
                  step="1"
                  value={advanceAmount || ''}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  disabled={isClosed}
                  placeholder="0"
                  className="w-36 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-right font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            </div>

            {/* Muestreo de Abonos y Saldo Factura EXW */}
            <div className="flex items-center justify-between text-xs bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/20 text-slate-700 dark:text-gray-300">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Abonos Recibidos:</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(abonosAmount, '$ CLP')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Saldo Pendiente EXW:</span>
                <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{formatMoney(Math.max(advanceAmount - abonosAmount, 0), '$ CLP')}</span>
              </div>
            </div>
          </div>

          {/* 1.2 COSTOS DE PLANTA A PUERTO (GASTOS ORIGEN) */}
          <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
            <div className="border-b border-slate-200 dark:border-gray-800 pb-2">
              <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                1.2. Costos de Planta a Puerto (Gastos Origen)
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                Gastos logísticos para mover el contenedor desde la planta hasta el puerto ($ CLP)
              </p>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Flete Terrestre (Planta a Puerto) ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={inlandFreight || ''}
                onChange={(e) => setInlandFreight(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Agente de Aduana / Tramitación ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={customsBrokerage || ''}
                onChange={(e) => setCustomsBrokerage(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Inspección / Certificados SAG ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={phytosanitarySag || ''}
                onChange={(e) => setPhytosanitarySag(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Gastos Portuarios Origen / THC ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={portExpensesOrigin || ''}
                onChange={(e) => setPortExpensesOrigin(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Seguro Terrestre Local ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={inlandInsurance || ''}
                onChange={(e) => setInlandInsurance(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 dark:text-gray-300 font-medium">Otros Gastos de Origen ($ CLP)</label>
              <input
                type="number"
                step="1"
                value={otherOriginExpenses || ''}
                onChange={(e) => setOtherOriginExpenses(parseFloat(e.target.value) || 0)}
                disabled={isClosed}
                placeholder="0"
                className="w-32 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-gray-800 flex items-center justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <span>TOTAL COSTOS PLANTA A PUERTO ($ CLP)</span>
              <span className="font-mono text-sm">{formatMoney(originExpensesTotal, '$ CLP')}</span>
            </div>

            {/* RESUMEN COSTO FOB REAL CALCULADO */}
            <div className="mt-2 flex items-center justify-between text-xs bg-indigo-500/10 p-2.5 rounded-lg border border-indigo-500/20 font-bold text-slate-900 dark:text-white">
              <span className="uppercase text-[11px] text-indigo-900 dark:text-indigo-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                (=) Costo FOB Real en Puerto (Origen):
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-300 text-sm">
                {formatMoney(realFobCLP, '$ CLP')} {currency !== 'CLP' && `(${formatMoney(realFobInCurrency, currSymbol)})`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: VENTA Y DEDUCCIONES EN DESTINO */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-gray-200 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            2. DESTINO: Venta Bruta y Gastos en Destino ({currency})
          </h3>
          <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
            Total Cajas: <strong className="text-slate-900 dark:text-white font-bold">{totalCajas.toLocaleString()}</strong>
          </span>
        </div>

        {/* 2.1 TABLA DE PRECIOS POR CAJA POR EMBALAJE Y CALIBRE */}
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

        {/* 2.2 GASTOS Y DEDUCCIONES EN DESTINO */}
        <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-bold text-red-900 dark:text-red-300 uppercase tracking-wide flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-red-500" />
            2.2. Gastos en Destino y Comisión ({currency})
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-3">
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
                <label className="text-slate-700 dark:text-gray-300 font-medium">Handling / Puerto Destino ({currSymbol})</label>
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
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-700 dark:text-gray-300 font-medium">Almacén Frigorífico Destino ({currSymbol})</label>
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
                <label className="text-slate-700 dark:text-gray-300 font-medium">Surveyor / Inspección Destino ({currSymbol})</label>
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
                <label className="text-slate-700 dark:text-gray-300 font-medium">Transporte Local Destino ({currSymbol})</label>
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
                <label className="text-slate-700 dark:text-gray-300 font-medium">Otros Gastos Destino ({currSymbol})</label>
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
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-gray-800 flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
            <span>TOTAL GASTOS Y DEDUCCIONES EN DESTINO ({currSymbol})</span>
            <span className="font-mono text-sm">-{formatMoney(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: RESUMEN FINANCIERO Y RESULTADO REAL DEL NEGOCIO */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-gray-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          3. Resumen Financiero y Utilidad Real del Negocio
        </h3>

        {/* CAMBIO DE MONEDA: DE PUERTO A DESTINO Y VENTA (EUR/USD -> CLP) */}
        {currency !== 'CLP' && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Cambio de Moneda ({currency} → CLP Pesos Chilenos)
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-gray-400 mt-0.5">
                  Los costos de puerto a destino y venta están en <strong>{currency}</strong>. Aplica el cambio de moneda a pesos Chilenos:
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <input
                    type="date"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                    disabled={isClosed}
                    className="bg-transparent text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFetchExchangeRate}
                  disabled={fetchingRate || isClosed}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingRate ? 'animate-spin' : ''}`} />
                  {fetchingRate ? 'Consultando...' : 'Obtener Cambio API'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-indigo-100 dark:border-indigo-900/50 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-700 dark:text-gray-300 font-medium">Tasa de Cambio Oficial:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">1 {currency} =</span>
                <input
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                  disabled={isClosed}
                  className="w-28 bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 text-xs"
                />
                <span className="font-mono font-bold text-slate-900 dark:text-white">CLP</span>
              </div>

              {rateProviderInfo && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">{rateProviderInfo}</span>
              )}
            </div>
          </div>
        )}

        <div className="bg-slate-50/80 dark:bg-gray-950/60 border border-slate-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-200 dark:border-gray-800 pb-4 text-xs">
            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-slate-200 dark:border-gray-800">
              <span className="text-slate-500 dark:text-gray-400 block text-[11px]">Venta Bruta Total ({currency}):</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-base block mt-0.5">{formatMoney(grossSales, currSymbol)}</span>
              {currency !== 'CLP' && (
                <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">(= {formatMoney(grossSales * tasaCLP, '$ CLP')})</span>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-slate-200 dark:border-gray-800">
              <span className="text-slate-500 dark:text-gray-400 block text-[11px]">Total Deducciones Destino ({currency}):</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-400 text-base block mt-0.5">-{formatMoney(totalExpenses, currSymbol)}</span>
              {currency !== 'CLP' && (
                <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">(= -{formatMoney(totalExpenses * tasaCLP, '$ CLP')})</span>
              )}
            </div>

            <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">Importe Neto a Favor ({currency}):</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-base block mt-0.5">{formatMoney(netAmount, currSymbol)}</span>
              {currency !== 'CLP' && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 font-mono">(= {formatMoney(netAmountCLP, '$ CLP')})</span>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-1 border-b border-slate-200 dark:border-gray-800 pb-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-gray-400 font-medium">(-) Factura Fruta EXW (Planta):</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {formatMoney(advanceAmount, '$ CLP')} {currency !== 'CLP' && `(${formatMoney(advanceAmount / tasaCLP, currSymbol)})`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-gray-400 font-medium">(-) Costos de Planta a Puerto (Origen):</span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                {formatMoney(originExpensesTotal, '$ CLP')} {currency !== 'CLP' && `(${formatMoney(originExpensesTotal / tasaCLP, currSymbol)})`}
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-200/70 dark:bg-gray-900 p-2.5 rounded-lg font-bold text-slate-900 dark:text-white border border-slate-300 dark:border-gray-700">
              <span className="uppercase text-[11px] text-slate-700 dark:text-gray-300">(=) Costo FOB Real en Puerto (Origen):</span>
              <span className="font-mono text-indigo-700 dark:text-indigo-300 text-sm">
                {formatMoney(realFobCLP, '$ CLP')} {currency !== 'CLP' && `(${formatMoney(realFobInCurrency, currSymbol)})`}
              </span>
            </div>
          </div>

          {/* TARJETA DE UTILIDAD Y RESULTADO DEL NEGOCIO */}
          <div className={`border rounded-xl p-4 space-y-2 shadow-sm transition-all ${
            finalBalanceCLP >= 0
              ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/70 dark:to-teal-950/70 border-emerald-300 dark:border-emerald-500/40'
              : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/70 dark:to-orange-950/70 border-amber-300 dark:border-amber-500/40'
          }`}>
            <div className={`text-[11px] uppercase font-black tracking-wider ${
              finalBalanceCLP >= 0
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-amber-800 dark:text-amber-300'
            }`}>
              {finalBalanceCLP >= 0 ? 'Utilidad del Negocio (Importe Neto en CLP - Costo FOB Real en CLP)' : 'Resultado por debajo de Costo FOB Real'}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={`text-2xl font-black font-mono ${
                finalBalanceCLP >= 0 ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
              }`}>
                {formatMoney(finalBalanceCLP, '$ CLP')}
              </span>
              {currency !== 'CLP' && (
                <span className="text-sm text-slate-700 dark:text-gray-300 font-mono font-bold">
                  ({formatMoney(finalBalanceSalesCurrency, currSymbol)} {currency})
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-[11px] font-medium border-t border-slate-200/60 dark:border-gray-800">
              <span className="text-slate-600 dark:text-gray-400">Utilidad Promedio por Caja ({totalCajas.toLocaleString()} cajas):</span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                {formatMoney(totalCajas > 0 ? finalBalanceCLP / totalCajas : 0, '$ CLP')} / caja
                {currency !== 'CLP' && ` (${formatMoney(totalCajas > 0 ? finalBalanceSalesCurrency / totalCajas : 0, currSymbol)} ${currency}/caja)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTONES DE ACCIÓN */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-gray-800">

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
          finalBalanceTargetCurrency={finalBalanceCLP}
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
