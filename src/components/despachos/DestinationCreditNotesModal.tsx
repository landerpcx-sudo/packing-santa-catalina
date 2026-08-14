'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Plus, Trash2, Calendar, FileText,
  Save, AlertTriangle, ArrowRight, DollarSign
} from 'lucide-react'
import { DestinationCreditNote } from '@/lib/types'
import { useToast } from '@/components/layout/Toast'

interface DestinationCreditNotesModalProps {
  isOpen: boolean
  onClose: () => void
  currency: string
  currencySymbol: string
  grossSales: number
  initialCreditNotes?: DestinationCreditNote[] | null
  isClosed?: boolean
  onSave: (notes: DestinationCreditNote[]) => void
}

export default function DestinationCreditNotesModal({
  isOpen,
  onClose,
  currency,
  currencySymbol,
  grossSales,
  initialCreditNotes,
  isClosed = false,
  onSave
}: DestinationCreditNotesModalProps) {
  const toast = useToast()
  const [creditNotes, setCreditNotes] = useState<DestinationCreditNote[]>([])
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    if (isOpen) {
      setCreditNotes(initialCreditNotes && initialCreditNotes.length > 0 ? [...initialCreditNotes] : [])
      setNewAmount('')
      setNewNote('')
      setNewDate(new Date().toISOString().split('T')[0])
    }
  }, [isOpen, initialCreditNotes])

  if (!isOpen) return null

  const formatMoney = (val: number) => {
    return `${currencySymbol} ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return dateStr
  }

  const totalNotasCredito = creditNotes.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  const ventaAjustada = Math.max(0, grossSales - totalNotasCredito)

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

    const nuevaNota: DestinationCreditNote = {
      id: crypto.randomUUID ? crypto.randomUUID() : `nc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      amount: montoNum,
      date: newDate || new Date().toISOString().split('T')[0],
      note: newNote.trim() || `Nota de Crédito #${creditNotes.length + 1}`,
      created_at: new Date().toISOString()
    }

    setCreditNotes(prev => [...prev, nuevaNota])
    setNewAmount('')
    setNewNote('')
    setNewDate(new Date().toISOString().split('T')[0])
    toast.success('Nota de crédito agregada.')
  }

  const handleRemove = (id: string) => {
    if (isClosed) {
      toast.warning('No se pueden modificar datos de un despacho cerrado.')
      return
    }
    setCreditNotes(prev => prev.filter(c => c.id !== id))
  }

  const handleSaveAndApply = () => {
    onSave(creditNotes)
    toast.success('Notas de crédito aplicadas a la liquidación.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Notas de Crédito / Revalorizaciones en Destino
              </h3>
              <p className="text-xs text-gray-400">
                Ajustes por condición de fruta o acuerdos comerciales en {currency}.
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
                Venta Bruta Original
              </span>
              <span className="text-sm font-bold text-white block mt-0.5">
                {formatMoney(grossSales)}
              </span>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-red-300 block tracking-wider">
                Total Notas de Crédito ({creditNotes.length})
              </span>
              <span className="text-sm font-bold text-red-400 block mt-0.5">
                -{formatMoney(totalNotasCredito)}
              </span>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-300 block tracking-wider">
                Venta Ajustada a Cobrar
              </span>
              <span className="text-sm font-bold text-emerald-300 block mt-0.5">
                {formatMoney(ventaAjustada)}
              </span>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6 pt-2 overflow-y-auto space-y-4 flex-1">
          
          {/* Formulario */}
          {!isClosed && (
            <form onSubmit={handleAdd} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Agregar Nota de Crédito / Descuento</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Monto */}
                <div className="sm:col-span-4">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Monto ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ej: 1500.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                {/* Fecha */}
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Fecha</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
                  />
                </div>

                {/* Motivo */}
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-semibold text-gray-400 mb-1 block">Motivo / Detalle</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej: Descuento por condición lote 03"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/50"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
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
                Desglose de Notas de Crédito ({creditNotes.length})
              </span>
            </div>

            {creditNotes.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <p className="text-xs text-gray-400">No hay notas de crédito registradas.</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Se cobrará el 100% de la venta bruta calculada.</p>
              </div>
            ) : (
              <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-white/[0.01]">
                {creditNotes.map((cn, index) => (
                  <div
                    key={cn.id || index}
                    className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {cn.note || `Nota de Crédito #${index + 1}`}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        <span>{formatDate(cn.date)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold font-mono text-red-400">
                        -{formatMoney(cn.amount)}
                      </span>
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => handleRemove(cn.id)}
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
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-2"
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
