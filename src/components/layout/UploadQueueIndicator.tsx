'use client'

import { useState, useEffect, useRef } from 'react'
import { UploadCloud, WifiOff, RotateCcw, X, AlertCircle, Loader2 } from 'lucide-react'
import { useUploadQueue } from '@/context/UploadQueueContext'

// ─────────────────────────────────────────────────────────────────────────────
// Indicador flotante de la cola de subidas. Visible en cualquier pantalla del
// panel: si alguien sube fotos y se va a otra sección, o se corta la señal,
// esto sigue mostrando qué falta por subir y que la app lo está reintentando.
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadQueueIndicator() {
  const { jobs, retry, dismiss } = useUploadQueue()
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (jobs.length === 0) return null

  const subiendo = jobs.filter(j => j.status === 'uploading').length
  const enCola = jobs.filter(j => j.status === 'pending').length
  const conError = jobs.filter(j => j.status === 'error').length

  return (
    <div ref={ref} className="fixed bottom-20 lg:bottom-6 right-4 z-[55]">
      {open && (
        <div className="mb-2 w-80 max-h-96 overflow-y-auto bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Cola de subidas</span>
            {!online && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold uppercase">
                <WifiOff className="w-3 h-3" /> Sin conexión
              </span>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {jobs.map(job => (
              <div key={job.id} className="px-4 py-2.5 flex items-center gap-2.5">
                <div className="shrink-0">
                  {job.status === 'uploading' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                  {job.status === 'pending' && <UploadCloud className="w-4 h-4 text-gray-500" />}
                  {job.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{job.fileName}</p>
                  <p className="text-[10px] text-gray-500">
                    {job.status === 'uploading' && 'Subiendo...'}
                    {job.status === 'pending' && (online ? 'En cola' : 'Esperando conexión')}
                    {job.status === 'error' && (job.errorMessage || 'Error al subir')}
                  </p>
                </div>
                {job.status === 'error' && (
                  <button
                    onClick={() => retry(job.id)}
                    className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10"
                    title="Reintentar"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => dismiss(job.id)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-white/10 hover:text-white"
                  title="Quitar de la cola (el archivo no se subirá)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl border font-bold text-xs transition-all ${
          conError > 0
            ? 'bg-red-500/15 border-red-500/40 text-red-300'
            : !online
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
        }`}
      >
        {subiendo > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : !online ? (
          <WifiOff className="w-4 h-4" />
        ) : (
          <UploadCloud className="w-4 h-4" />
        )}
        {conError > 0
          ? `${conError} con error`
          : subiendo > 0
          ? `Subiendo ${subiendo}...`
          : `${enCola} en cola`}
      </button>
    </div>
  )
}
