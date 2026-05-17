'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  success: (msg: string, duration?: number) => void
  error:   (msg: string, duration?: number) => void
  warning: (msg: string, duration?: number) => void
  info:    (msg: string, duration?: number) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ─── Config por tipo ─────────────────────────────────────────────────────────
const CONFIGS = {
  success: {
    icon: CheckCircle,
    bg: 'bg-emerald-500/15 border-emerald-500/30',
    icon_color: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-500/15 border-red-500/30',
    icon_color: 'text-red-400',
    bar: 'bg-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/15 border-amber-500/30',
    icon_color: 'text-amber-400',
    bar: 'bg-amber-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/15 border-blue-500/30',
    icon_color: 'text-blue-400',
    bar: 'bg-blue-400',
  },
}

// ─── Single Toast Item ───────────────────────────────────────────────────────
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const cfg = CONFIGS[toast.type]
  const Icon = cfg.icon
  const duration = toast.duration ?? 4000
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Entrada
    const enterTimer = setTimeout(() => setVisible(true), 20)
    // Salida
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(toast.id), 350)
    }, duration)
    return () => {
      clearTimeout(enterTimer)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.id, duration, onRemove])

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl
        w-full max-w-sm overflow-hidden cursor-pointer select-none
        transition-all duration-300 ease-out
        ${cfg.bg}
        ${visible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-8'}
      `}
      onClick={() => {
        setVisible(false)
        setTimeout(() => onRemove(toast.id), 350)
      }}
    >
      {/* Ícono */}
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.icon_color}`} />

      {/* Mensaje */}
      <p className="text-white text-sm font-medium leading-snug flex-1 pr-4">
        {toast.message}
      </p>

      {/* Cerrar */}
      <button className="absolute top-2.5 right-2.5 text-white/40 hover:text-white/80 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Barra de progreso */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full opacity-40">
        <div
          className={`h-full ${cfg.bar}`}
          style={{
            animation: `toast-progress ${duration}ms linear forwards`,
          }}
        />
      </div>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
  }, [])

  const ctx: ToastContextValue = {
    success: (msg, d) => push('success', msg, d),
    error:   (msg, d) => push('error',   msg, d),
    warning: (msg, d) => push('warning', msg, d),
    info:    (msg, d) => push('info',    msg, d),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {mounted && createPortal(
        <div className="fixed bottom-6 right-4 z-[99999] flex flex-col gap-2.5 items-end pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto w-full max-w-sm">
              <ToastItem toast={t} onRemove={remove} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
