'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Plus, Trash2, DollarSign, Calendar, FileText,
  CheckCircle2, AlertCircle, Save, Receipt, ArrowRight, Sparkles
} from 'lucide-react'
import { AdvancePayment } from '@/lib/types'
import { useToast } from '@/components/layout/Toast'

interface AdvancePaymentsModalProps {
  isOpen: boolean
  onClose: () => void
  dispatchId: string
  dispatchCode: string
  containerNumber?: string | null
  invoiceAmount?: number | null
  initialPayments?: AdvancePayment[] | null
  initialAdvanceAmount?: number | null
  isClosed?: boolean
  onSaved: () => void
}

export default function AdvancePaymentsModal({
  isOpen,
  onClose,
  dispatchId,
  dispatchCode,
  containerNumber,
  invoiceAmount,
  initialPayments,
  initialAdvanceAmount,
  isClosed = false,
  onSaved
 }: AdvancePaymentsModalProps) {
  const toast = useToast()
  const [payments, setPayments] = useState<AdvancePayment[]>([])
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Sincronizar estado cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      if (initialPayments && initialPayments.length > 0) {
        setPayments([...initialPayments])
      } else if (initialAdvanceAmount && initialAdvanceAmount > 0) {
        // Si no hay lista pero sí un advance_amount histórico
        setPayments([
          {
            id: 'legacy-1',
            amount: Number(initialAdvanceAmount),
            date: new Date().toISOString().split('T')[0],
            note: 'Abono registrado'
          }
        ])
      } else {
        setPayments([])
      }
      setNewAmount('')
      setNewNote('')
      setNewDate(new Date().toISOString().split('T')[0])
    }
  }, [isOpen, initialPayments, initialAdvanceAmount])

  if (!isOpen) return null

  const formatCLP = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return '$0'
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(val)
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    const clean = dateStr.split('T')[0]
    const parts = clean.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }

  const totalAbonado = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const facturado = Number(invoiceAmount) || 0
  const saldoPendiente = facturado - totalAbonado
  const pctPagado = facturado > 0 ? Math.min(100, Math.max(0, Math.round((totalAbonado / facturado) * 100))) : 0

  const handleAddPayment = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (isClosed) {
      toast.warning('No se pueden modificar abonos de un despacho cerrado.')
      return
    }

    const montoNum = parseFloat(newAmount.replace(/[^0-9]/g, ''))
    if (!montoNum || isNaN(montoNum) || montoNum <= 0) {
      toast.error('Por favor ingresa un monto válido mayor a 0.')
      return
    }

    const nuevoItem: AdvancePayment = {
      id: crypto.randomUUID ? crypto.randomUUID() : `abono-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      amount: montoNum,
      date: newDate || new Date().toISOString().split('T')[0],
      note: newNote.trim() || `Abono #${payments.length + 1}`,
      created_at: new Date().toISOString()
    }

    setPayments(prev => [...prev, nuevoItem])
    setNewAmount('')
    setNewNote('')
    setNewDate(new Date().toISOString().split('T')[0])
    toast.success('Abono agregado a la lista temporal.')
  }

  const handleRemovePayment = (id: string) => {
    if (isClosed) {
      toast.warning('No se pueden modificar abonos de un despacho cerrado.')
      return
    }
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  const handleSave = async () => {
    if (isClosed) {
      toast.warning('No se pueden modificar abonos de un despacho cerrado.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/despachos/${dispatchId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          advance_payments: payments
        })
      })

      if (res.ok) {
        toast.success('Abonos guardados y total recalculado exitosamente.')
        onSaved()
        onClose()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar los abonos.')
      }
    } catch (err) {
      toast.error('Error de red al intentar guardar los abonos.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Abonos y Adelantos de Factura
                <span className="text-xs px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-mono">
                  {dispatchCode}
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                {containerNumber ? `Contenedor ${containerNumber} · ` : ''}Registra pagos parciales y se sumarán automáticamente.
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
        <div className="p-6 pb-2 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {/* Facturado */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Monto Factura
              </span>
              <span className="text-base font-bold text-white block mt-0.5">
                {formatCLP(facturado)}
              </span>
            </div>

            {/* Total Abonado */}
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-indigo-300 block tracking-wider">
                Total Abonado ({payments.length})
              </span>
              <span className="text-base font-bold text-indigo-300 block mt-0.5">
                {formatCLP(totalAbonado)}
              </span>
            </div>

            {/* Saldo Restante */}
            <div className={`rounded-xl p-3 border ${
              saldoPendiente <= 0 && facturado > 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <span className="text-[10px] uppercase font-bold block tracking-wider opacity-80">
                Saldo Pendiente
              </span>
              <span className="text-base font-bold block mt-0.5">
                {formatCLP(saldoPendiente)} {saldoPendiente <= 0 && facturado > 0 ? '✓' : ''}
              </span>
            </div>
          </div>

          {/* Barra de progreso de pago */}
          {facturado > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Progreso de recaudación</span>
                <span className="font-semibold text-white">{pctPagado}%</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
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

        {/* Contenido Scrollable */}
        <div className="p-6 pt-2 overflow-y-auto space-y-5 flex-1">
          
          {/* Formulario para agregar nuevo abono */}
          {!isClosed && (
            <form onSubmit={handleAddPayment} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>Registrar nuevo pago / abono</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Monto */}
                <div className="sm:col-span-4 relative">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Monto ($ CLP)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Ej: 5000000"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400/50"
                    />
                  </div>
                </div>

                {/* Fecha */}
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Fecha</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400/50 [color-scheme:dark]"
                  />
                </div>

                {/* Detalle / Glosa */}
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Detalle / Referencia</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej: Anticipo 30%, Transf #492"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400/50"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Lista de Abonos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Desglose de Pagos ({payments.length})
              </span>
              <span>Total acumulado: <strong className="text-white font-bold">{formatCLP(totalAbonado)}</strong></span>
            </div>

            {payments.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <Receipt className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                <p className="text-sm font-medium text-gray-300">No hay abonos registrados</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isClosed ? 'El despacho está cerrado.' : 'Ingresa el monto del primer abono en el formulario superior.'}
                </p>
              </div>
            ) : (
              <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-white/[0.01]">
                {payments.map((p, index) => (
                  <div
                    key={p.id || index}
                    className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {p.note || `Abono #${index + 1}`}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-500" />
                            {formatDate(p.date)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold font-mono text-indigo-300">
                        {formatCLP(p.amount)}
                      </span>
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(p.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Eliminar este abono"
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
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="text-xs text-gray-400">
            {payments.length} {payments.length === 1 ? 'pago registrado' : 'pagos registrados'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            {!isClosed && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Guardando...' : 'Guardar y Recalcular'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
