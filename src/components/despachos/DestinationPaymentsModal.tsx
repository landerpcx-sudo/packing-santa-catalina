'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Plus, Trash2, Calendar, FileText,
  Save, Receipt, ArrowRight, DollarSign, CheckCircle2
} from 'lucide-react'
import { DestinationPayment } from '@/lib/types'
import { useToast } from '@/components/layout/Toast'

interface DestinationPaymentsModalProps {
  isOpen: boolean
  onClose: () => void
  currency: string
  currencySymbol: string
  exchangeRate: number
  grossSalesToCollect: number // Venta bruta menos notas de crédito
  initialPayments?: DestinationPayment[] | null
  isClosed?: boolean
  onSave: (payments: DestinationPayment[]) => void
}

export default function DestinationPaymentsModal({
  isOpen,
  onClose,
  currency,
  currencySymbol,
  exchangeRate,
  grossSalesToCollect,
  initialPayments,
  isClosed = false,
  onSave
}: DestinationPaymentsModalProps) {
  const toast = useToast()
  const [payments, setPayments] = useState<DestinationPayment[]>([])
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newRef, setNewRef] = useState('')
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    if (isOpen) {
      setPayments(initialPayments && initialPayments.length > 0 ? [...initialPayments] : [])
      setNewAmount('')
      setNewRef('')
      setNewNote('')
      setNewDate(new Date().toISOString().split('T')[0])
    }
  }, [isOpen, initialPayments])

  if (!isOpen) return null

  const formatMoney = (val: number) => {
    return `${currencySymbol} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(val)
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return dateStr
  }

  const totalAbonado = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const saldoPendiente = Math.max(0, grossSalesToCollect - totalAbonado)
  const pctPagado = grossSalesToCollect > 0 ? Math.min(100, Math.round((totalAbonado / grossSalesToCollect) * 100)) : 0

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (isClosed) {
      toast.warning('No se pueden modificar datos de un despacho cerrado.')
      return
    }

    const montoNum = parseFloat(newAmount.replace(/[^0-9.]/g, ''))
    if (!montoNum || isNaN(montoNum) || montoNum <= 0) {
      toast.error('Por favor ingresa un monto válido mayor a 0.')
      return
    }

    const nuevoPago: DestinationPayment = {
      id: crypto.randomUUID ? crypto.randomUUID() : `dest-pago-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      amount: montoNum,
      date: newDate || new Date().toISOString().split('T')[0],
      reference: newRef.trim() || undefined,
      note: newNote.trim() || `Abono Destino #${payments.length + 1}`,
      created_at: new Date().toISOString()
    }

    setPayments(prev => [...prev, nuevoPago])
    setNewAmount('')
    setNewRef('')
    setNewNote('')
    setNewDate(new Date().toISOString().split('T')[0])
    toast.success('Abono registrado.')
  }

  const handleRemove = (id: string) => {
    if (isClosed) {
      toast.warning('No se pueden modificar datos de un despacho cerrado.')
      return
    }
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  const handleSaveAndApply = () => {
    onSave(payments)
    toast.success('Abonos del comprador guardados en la liquidación.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Abonos Recibidos del Comprador en Destino
              </h3>
              <p className="text-xs text-gray-400">
                Pagos y transferencias recibidas en {currency}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen Superior */}
        <div className="p-6 pb-2 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Total a Cobrar
              </span>
              <span className="text-sm font-bold text-white block mt-0.5">
                {formatMoney(grossSalesToCollect)}
              </span>
            </div>

            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-indigo-300 block tracking-wider">
                Total Abonado ({payments.length})
              </span>
              <span className="text-sm font-bold text-indigo-300 block mt-0.5">
                {formatMoney(totalAbonado)}
              </span>
            </div>

            <div className={`rounded-xl p-3 border ${
              saldoPendiente <= 0 && grossSalesToCollect > 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <span className="text-[10px] uppercase font-bold block tracking-wider opacity-80">
                Saldo por Cobrar
              </span>
              <span className="text-sm font-bold block mt-0.5">
                {formatMoney(saldoPendiente)}
              </span>
              {currency !== 'CLP' && exchangeRate > 1 && (
                <span className="text-[10px] block opacity-70 mt-0.5 font-mono">
                  ≈ {formatCLP(saldoPendiente * exchangeRate)}
                </span>
              )}
            </div>
          </div>

          {/* Barra de progreso */}
          {grossSalesToCollect > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Progreso de recaudación destino</span>
                <span className="font-semibold text-white">{pctPagado}%</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    pctPagado >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${pctPagado}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="p-6 pt-2 overflow-y-auto space-y-4 flex-1">
          
          {/* Formulario */}
          {!isClosed && (
            <form onSubmit={handleAdd} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Registrar Abono del Comprador</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Monto */}
                <div className="sm:col-span-4">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Monto ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ej: 8000.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>

                {/* Fecha */}
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Fecha</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400/50 [color-scheme:dark]"
                  />
                </div>

                {/* Ref Swift */}
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Referencia Swift / Doc</label>
                  <input
                    type="text"
                    placeholder="Ej: Swift #TRF-9024"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>

                {/* Detalle */}
                <div className="sm:col-span-12">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Detalle / Glosa</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej: Anticipo 50% de la carga"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400/50"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Lista */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Desglose de Abonos Recibidos ({payments.length})
              </span>
            </div>

            {payments.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <p className="text-xs text-gray-400">No hay abonos del cliente en destino registrados aún.</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Ingresa los pagos en la moneda de venta ({currency}).</p>
              </div>
            ) : (
              <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-white/[0.01]">
                {payments.map((p, index) => (
                  <div
                    key={p.id || index}
                    className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {p.note || `Abono #${index + 1}`}
                        {p.reference && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                            {p.reference}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        <span>{formatDate(p.date)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        {formatMoney(p.amount)}
                      </span>
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => handleRemove(p.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            Cerrar
          </button>
          {!isClosed && (
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Aplicar y Guardar</span>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
