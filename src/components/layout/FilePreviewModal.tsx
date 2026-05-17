'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, Download, FileText, Loader2 } from 'lucide-react'

interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
}

export default function FilePreviewModal({ isOpen, onClose, fileUrl, fileName }: FilePreviewModalProps) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
    }
  }, [isOpen, fileUrl])

  if (!isOpen || !mounted) return null

  // Detectar tipo de archivo
  const isDriveUrl = fileUrl.includes('drive.google.com')
  const isImage = (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName) || fileUrl.includes('image')) && !isDriveUrl
  const isPdf = /\.pdf$/i.test(fileName) || fileUrl.includes('.pdf')

  // Transformar URL de Google Drive para permitir vista previa embebida en iframe
  let previewUrl = fileUrl
  if (fileUrl.includes('drive.google.com')) {
    // Buscar ID del archivo en URLs como /file/d/[ID]/view
    const match = fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (match && match[1]) {
      previewUrl = `https://drive.google.com/file/d/${match[1]}/preview`
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300 animate-in fade-in">
      <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-sm sm:text-base truncate tracking-tight">{fileName}</h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Vista Previa</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest border border-white/10"
              title="Abrir en Pestaña Nueva"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Abrir Original</span>
            </a>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              title="Cerrar Vista Previa"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-black/40 relative flex items-center justify-center p-4 overflow-auto">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/60 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-widest">Cargando Vista Previa...</span>
              </div>
            </div>
          )}

          {isImage ? (
            <img
              src={fileUrl}
              alt={fileName}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-xl transition-transform"
            />
          ) : (isPdf || isDriveUrl) ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0 rounded-2xl bg-white shadow-xl"
              onLoad={() => setLoading(false)}
              title="Visor de Documentos"
              allow="autoplay"
            />
          ) : (
            <div className="text-center p-8 space-y-6 max-w-sm" onLoad={() => setLoading(false)}>
              <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center mx-auto text-gray-400">
                <FileText size={32} />
              </div>
              <div>
                <p className="text-white font-bold text-base">Sin vista previa disponible</p>
                <p className="text-gray-400 text-xs mt-2">Este tipo de archivo no puede visualizarse directamente dentro de la plataforma.</p>
              </div>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setLoading(false)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 text-xs uppercase tracking-widest"
              >
                <Download size={14} />
                Descargar / Abrir Archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
