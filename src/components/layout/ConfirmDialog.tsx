'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Reemplazo propio de window.confirm(). El diálogo nativo del navegador no se
// puede estilar, en móvil se ve como una alerta del sistema operativo, y no
// distingue visualmente una acción destructiva de una rutinaria. Este es un
// modal de la propia app, con el mismo patrón "await" que confirm() para que
// convertir el código existente sea un cambio mínimo.
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** Acción irreversible o de riesgo: se muestra en rojo. */
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve })
    })
  }, [])

  const responder = (valor: boolean) => {
    pending?.resolve(valor)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => responder(false)}
        >
          <div
            className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 ${
              pending.danger ? 'bg-red-500/10 text-red-400' : 'bg-indigo-500/10 text-indigo-400'
            }`}>
              {pending.danger ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <h3 className="text-white font-bold text-base mb-1.5">{pending.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{pending.message}</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => responder(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white text-sm font-semibold hover:bg-white/5 transition"
              >
                {pending.cancelText || 'Cancelar'}
              </button>
              <button
                onClick={() => responder(true)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
                  pending.danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {pending.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
