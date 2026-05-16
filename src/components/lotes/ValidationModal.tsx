'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, Check, Loader2, X, FileText } from 'lucide-react'

export default function ValidationModal({ 
  isOpen, onClose, docId, docName, tableName, onValidated 
}: { 
  isOpen: boolean; onClose: () => void; docId: string; docName: string; tableName: string; onValidated: () => void 
}) {
  const [observation, setObservation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true)
      setObservation('')
      setError('')
    } else {
      const timer = setTimeout(() => setIsMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!isOpen && !isMounted) return null

  const handleAction = async (action: 'validate' | 'observe') => {
    if (action === 'observe' && !observation.trim()) {
      setError('Debes ingresar un motivo para la observación.')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch(`/api/documentos/${tableName}/${docId}/validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, observation: action === 'observe' ? observation : null })
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al procesar la acción.')
      } else {
        onValidated()
        onClose()
      }
    } catch (err) {
      setError('Error de conexión con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className={`relative bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-all duration-300 transform ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">Validar Documento</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Documento Seleccionado</p>
            <p className="text-sm text-white font-semibold truncate leading-tight">{docName}</p>
          </div>
          
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 items-center text-red-400 text-xs animate-pulse">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wider font-bold text-gray-400 ml-1">
              Comentarios / Observaciones
            </label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ej. Falta firma, imagen borrosa, corregir valores..."
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-28 transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleAction('observe')}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-2xl border border-white/10 text-gray-300 font-bold text-xs hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
              Observar
            </button>
            <button
              onClick={() => handleAction('validate')}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Aprobar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
