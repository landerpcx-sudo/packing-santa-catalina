'use client'

import React, { useEffect } from 'react'
import { X, Calculator } from 'lucide-react'
import ContainerLiquidationCard from './ContainerLiquidationCard'

interface LiquidationModalProps {
  dispatchId: string
  dispatchCode: string
  isClosed?: boolean
  userId?: string
  onClose: () => void
  onSuccess?: () => void
}

export default function LiquidationModal({
  dispatchId,
  dispatchCode,
  isClosed = false,
  userId,
  onClose,
  onSuccess
}: LiquidationModalProps) {
  // Manejar tecla ESC para cerrar el modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-5xl bg-[#0b1329] border border-white/10 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/90 dark:bg-gray-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Módulo Financiero - Despacho {dispatchCode}
              </h2>
              <p className="text-xs text-gray-400">
                Ingreso de precios por caja, liquidación de contenedor y conversión de divisas
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (onSuccess) onSuccess()
              onClose()
            }}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-white/5"
            title="Cerrar (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <ContainerLiquidationCard
            dispatchId={dispatchId}
            dispatchCode={dispatchCode}
            isClosed={isClosed}
            userId={userId}
          />
        </div>
      </div>
    </div>
  )
}
