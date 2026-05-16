'use client'

import { useState } from 'react'
import { Check, X, AlertCircle, Loader2 } from 'lucide-react'

interface InlineValidationProps {
  docId: string
  tableName: string
  onValidated: () => void
  onCancel: () => void
}

export default function InlineValidation({ docId, tableName, onValidated, onCancel }: InlineValidationProps) {
  const [observation, setObservation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAction = async (action: 'validate' | 'observe') => {
    if (action === 'observe' && !observation.trim()) {
      setError('Escribe un motivo para la observación')
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
        setError(data.error || 'Error al procesar')
      } else {
        onValidated()
        onCancel()
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest font-black text-indigo-400">Panel de Validación</span>
        <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      <textarea
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
        placeholder="Escribe observaciones aquí si vas a observar el documento..."
        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 resize-none h-20 transition-all mb-3"
      />

      <div className="flex gap-2">
        <button
          onClick={() => handleAction('observe')}
          disabled={loading}
          className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
          Observar
        </button>
        <button
          onClick={() => handleAction('validate')}
          disabled={loading}
          className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Aprobar
        </button>
      </div>
    </div>
  )
}
