'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, Download, FileText, Loader2, Maximize2, Minimize2 } from 'lucide-react'

interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
}

/** Determina si la URL/nombre corresponde a una imagen */
function isImageFile(url: string, name: string): boolean {
  const extRegex = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i
  const hints    = ['/jpeg', '/png', '/jpg', '/webp', 'image%2F', 'image/']
  return (
    extRegex.test(name) ||
    extRegex.test(url) ||
    hints.some(h => url.toLowerCase().includes(h))
  )
}

/** Determina si la URL/nombre corresponde a un PDF */
function isPdfFile(url: string, name: string): boolean {
  return (
    /\.pdf$/i.test(name) ||
    url.toLowerCase().includes('.pdf') ||
    url.toLowerCase().includes('%2Fpdf') ||
    url.toLowerCase().includes('/pdf')
  )
}

/** Transforma URL de Google Drive a versión embebible */
function toDrivePreview(url: string): string {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  return match?.[1]
    ? `https://drive.google.com/file/d/${match[1]}/preview`
    : url
}

export default function FilePreviewModal({ isOpen, onClose, fileUrl, fileName }: FilePreviewModalProps) {
  const [mounted,      setMounted]      = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef  = useRef<HTMLDivElement>(null)
  const timeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      // Timeout de seguridad: si el iframe no dispara onLoad en 10s, ocultar spinner
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setLoading(false), 10_000)
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [isOpen, fileUrl])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      try { await containerRef.current.requestFullscreen() } catch { /* noop */ }
    } else {
      try { await document.exitFullscreen() } catch { /* noop */ }
    }
  }, [])

  // Bloquear scroll del body mientras el modal está abierto (fix iOS)
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  // ── Clasificación del archivo ──────────────────────────────────────────────
  const isDrive   = fileUrl.includes('drive.google.com')
  const isSupabase = fileUrl.includes('supabase') || fileUrl.includes('/storage/v1/') || fileUrl.includes('amazonaws')
  const isImage   = !isDrive && isImageFile(fileUrl, fileName)
  const isPdf     = !isDrive && isPdfFile(fileUrl, fileName)

  // Los archivos de Supabase/S3 se pueden mostrar en iframe directo
  // (el navegador detecta el Content-Type automáticamente)
  const showIframe = isPdf || isDrive || (isSupabase && !isImage)
  const iframeSrc  = isDrive ? toDrivePreview(fileUrl) : fileUrl

  // ── Render ─────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={containerRef}
        className="bg-[#0b1628] border border-white/10 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: 'min(88vh, 900px)', animation: 'modalIn 0.18s ease-out' }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-white/[0.02] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
            <div className="p-2 bg-indigo-500/15 rounded-xl text-indigo-400 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-sm truncate">{fileName}</h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                {isImage ? 'Imagen' : isPdf ? 'PDF' : isDrive ? 'Google Drive' : 'Documento'} · Vista Previa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-white/10"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-500 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-white/10"
              title="Abrir en pestaña nueva"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Abrir</span>
            </a>

            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Cuerpo ──────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden min-h-0">

          {/* Spinner */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1628] z-10">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cargando documento...</span>
            </div>
          )}

          {/* ── Imagen ── */}
          {isImage && (
            <div className="w-full h-full flex items-center justify-center p-4 bg-black/30">
              <img
                src={fileUrl}
                alt={fileName}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.2s' }}
              />
            </div>
          )}

          {/* ── iframe (PDF / Drive / Supabase directo) ── */}
          {!isImage && showIframe && (
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              className="w-full h-full border-0"
              style={{ display: 'block' }}
              onLoad={() => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current)
                setLoading(false)
              }}
              onError={() => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current)
                setLoading(false)
              }}
              title="Visor de documentos"
              allow="autoplay"
            />
          )}

          {/* ── Fallback: sin vista previa ── */}
          {!isImage && !showIframe && (
            <FallbackView fileUrl={fileUrl} onReady={() => setLoading(false)} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>,
    document.body
  )
}

function FallbackView({ fileUrl, onReady }: { fileUrl: string; onReady: () => void }) {
  useEffect(() => { onReady() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center text-gray-500">
        <FileText size={30} />
      </div>
      <div>
        <p className="text-white font-bold text-base">Sin vista previa disponible</p>
        <p className="text-gray-500 text-sm mt-1.5 max-w-xs mx-auto">
          Este tipo de archivo no puede visualizarse directamente en el navegador.
        </p>
      </div>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-600/20 text-sm active:scale-95"
      >
        <Download size={14} />
        Descargar / Abrir archivo
      </a>
    </div>
  )
}
