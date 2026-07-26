'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, FileText, Image, X, CheckCircle, AlertCircle, Loader2, ExternalLink, Camera, AlertTriangle, UploadCloud } from 'lucide-react'
import dynamic from 'next/dynamic'
import { triggerConfetti } from '@/components/layout/Confetti'
import { useUploadQueue } from '@/context/UploadQueueContext'

import { useAuth } from '@/context/AuthContext'

// Carga diferida: el escáner es pesado y solo se usa al abrirlo
const DocumentScannerModal = dynamic(() => import('@/components/layout/DocumentScannerModal'), { ssr: false })

interface UploadZoneProps {
  lotId: string
  lotCode: string
  documentType: string
  documentLabel: string
  accept?: Record<string, string[]>
  onUploadSuccess: () => void
  uploadUrl?: string
}

interface ArchivoEnProceso {
  id: string
  name: string
  status: 'preparando' | 'en_cola' | 'listo' | 'error' | 'duplicado_omitido'
  message?: string
}

async function calculateSHA256(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Calidad de compresión por tipo de documento. Antes era un único valor fijo
// (0.5 MB / 1600 px) para cualquier foto, incluidos termógrafos y documentos
// escaneados: la letra pequeña (temperaturas, folios) podía volverse
// ilegible. Fotos de referencia siguen livianas; lo que hay que leer, no.
function getCompressionOptions(documentType: string) {
  const necesitaLegibilidad = ['thermograph_photo', 'calidad_destino'].includes(documentType)
  return necesitaLegibilidad
    ? { maxSizeMB: 1.5, maxWidthOrHeight: 2200, useWebWorker: true }
    : { maxSizeMB: 0.5, maxWidthOrHeight: 1600, useWebWorker: true }
}

export default function UploadZone({
  lotId,
  lotCode,
  documentType,
  documentLabel,
  accept = {
    'application/pdf': ['.pdf'],
    'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
  onUploadSuccess,
  uploadUrl,
}: UploadZoneProps) {
  const { user } = useAuth()
  const { enqueue } = useUploadQueue()
  const [items, setItems] = useState<ArchivoEnProceso[]>([])
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<{
    fileName: string; module: string; details: string
    onKeep: () => void; onSkip: () => void
  } | null>(null)

  const entityFromUrl = () => {
    let entity: 'lotes' | 'despachos' | 'temperaturas' = 'lotes'
    let entityId = lotId
    if (uploadUrl) {
      if (uploadUrl.includes('/despachos/')) {
        entity = 'despachos'
        const match = uploadUrl.match(/\/despachos\/([^\/]+)/)
        if (match) entityId = match[1]
      } else if (uploadUrl.includes('/temperaturas/')) {
        entity = 'temperaturas'
        const match = uploadUrl.match(/\/temperaturas\/([^\/]+)/)
        if (match) entityId = match[1]
      }
    }
    return { entity, entityId }
  }

  const updateItem = (id: string, patch: Partial<ArchivoEnProceso>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }

  // Procesa un archivo: comprime si aplica, calcula huella, revisa duplicado
  // y lo encola. La cola (UploadQueueContext) hace el resto y sobrevive a
  // cortes de conexión o si el usuario cambia de pantalla.
  const processFile = useCallback(async (file: File, itemId: string, suffix: string) => {
    let uploadFile: File = file
    const isImage = uploadFile.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(uploadFile.name)

    if (isImage) {
      const ext = uploadFile.name.split('.').pop() || 'jpg'
      const cleanLabel = documentLabel.replace(/ \(.*\)/, '')
      const newName = `${cleanLabel} ${lotCode}${suffix}.${ext}`

      if (uploadFile.size > 200 * 1024) {
        updateItem(itemId, { message: 'Optimizando imagen...' })
        try {
          const compressedBlob = await imageCompression(uploadFile, getCompressionOptions(documentType))
          uploadFile = new File([compressedBlob], newName, { type: compressedBlob.type || 'image/jpeg' })
        } catch (error) {
          console.error('Error al comprimir la imagen', error)
          uploadFile = new File([uploadFile], newName, { type: uploadFile.type || 'image/jpeg' })
        }
      } else {
        uploadFile = new File([uploadFile], newName, { type: uploadFile.type || 'image/jpeg' })
      }
    }

    updateItem(itemId, { message: 'Calculando huella digital...' })
    let hash: string
    try {
      hash = await calculateSHA256(uploadFile)
    } catch {
      hash = ''
    }

    // Si no hay conexión, no tiene sentido bloquear por duplicado: se
    // verificará implícitamente cuando el archivo llegue al servidor.
    if (hash && navigator.onLine) {
      try {
        const checkRes = await fetch(`/api/documentos/verificar-duplicado?hash=${hash}`)
        const checkJson = await checkRes.json()
        if (checkRes.ok && checkJson.exists) {
          const decision = await new Promise<boolean>(resolve => {
            setDuplicateInfo({
              fileName: checkJson.fileName,
              module: checkJson.module,
              details: checkJson.details,
              onKeep: () => resolve(true),
              onSkip: () => resolve(false),
            })
          })
          setDuplicateInfo(null)
          if (!decision) {
            updateItem(itemId, { status: 'duplicado_omitido', message: 'Omitido: ya existe' })
            return
          }
        }
      } catch {
        // Sin red o el chequeo falló: seguimos adelante, no se pierde el archivo.
      }
    }

    const { entity, entityId } = entityFromUrl()
    updateItem(itemId, { status: 'en_cola', message: 'En cola de subida' })

    await enqueue(
      { entity, entityId, documentType, file: uploadFile, fileHash: hash },
      (success, _data, error) => {
        if (success) {
          updateItem(itemId, { status: 'listo', message: 'Subido' })
          triggerConfetti()
          onUploadSuccess()
          setTimeout(() => setItems(prev => prev.filter(it => it.id !== itemId)), 5000)
        } else {
          updateItem(itemId, { status: 'error', message: error || 'Error al subir' })
        }
      }
    )
  }, [documentLabel, documentType, lotCode, enqueue, onUploadSuccess])

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return

      const nuevos: ArchivoEnProceso[] = acceptedFiles.map((f, i) => ({
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        status: 'preparando',
        message: 'Preparando...',
      }))
      setItems(prev => [...prev, ...nuevos])

      // Secuencial: así el diálogo de duplicado no se solapa entre archivos
      // y no se satura Drive con muchas subidas paralelas.
      for (let i = 0; i < acceptedFiles.length; i++) {
        const suffix = acceptedFiles.length > 1 ? ` ${i + 1}` : ''
        try {
          await processFile(acceptedFiles[i], nuevos[i].id, suffix)
        } catch (err: any) {
          updateItem(nuevos[i].id, { status: 'error', message: err.message || 'Error al procesar el archivo' })
        }
      }
    },
    [processFile]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxFiles: 30,
  })

  const borderColor = isDragReject
    ? 'border-red-500/60'
    : isDragActive
    ? 'border-green-400/80'
    : 'border-white/10 hover:border-white/25'

  const bgColor = isDragActive ? 'bg-green-500/5' : 'bg-white/2 hover:bg-white/5'

  return (
    <div className="space-y-3">
      {/* Botón de Escáner Integrado - Solo visible en móvil (oculto en escritorio con md:hidden) */}
      {Object.keys(accept).some(mime => mime.startsWith('image/') || mime === 'image/*') && (
        <div className="md:hidden">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsScannerOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-950/20 group/scan border border-emerald-500/20 active:scale-[0.98]"
          >
            <Camera className="w-4 h-4 group-hover/scan:scale-110 transition-transform text-emerald-200" />
            📷 Iniciar Escáner de Documento Móvil
          </button>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all duration-300 ${borderColor} ${bgColor} ${isDragActive ? 'upload-zone-drag-active' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center text-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDragActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400'}`}>
            {documentType.includes('photo') ? <Image className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
          </div>

          <div>
            <p className="text-white/80 font-medium text-sm">
              {isDragActive ? 'Suelta los archivos aquí' : `Subir ${documentLabel}`}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Arrastra uno o varios archivos o <span className="text-green-400">haz clic para seleccionar</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {Object.keys(accept).map((mime) => (
              <span key={mime} className="bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-500 text-xs">
                {accept[mime].join(', ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de archivos en proceso: se llena al soltar, y cada uno se
          va sacando cuando termina de subir. No bloquea seguir usando la
          zona mientras tanto. */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(item => (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs ${
                item.status === 'listo' ? 'bg-green-500/5 border-green-500/20' :
                item.status === 'error' ? 'bg-red-500/5 border-red-500/20' :
                item.status === 'duplicado_omitido' ? 'bg-amber-500/5 border-amber-500/20' :
                'bg-white/3 border-white/8'
              }`}
            >
              {item.status === 'listo' && <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />}
              {item.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              {item.status === 'duplicado_omitido' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {(item.status === 'preparando' || item.status === 'en_cola') && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 truncate">{item.name}</p>
                <p className={`text-[10px] ${item.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>{item.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanComplete={(scannedFile) => {
          onDrop([scannedFile]);
        }}
        documentLabel={documentLabel}
        lotCodeOrDispatchId={lotCode}
      />

      {/* Modal interactivo de Advertencia de Duplicado */}
      {duplicateInfo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border-2 border-amber-500/30 rounded-3xl w-full max-w-md shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 animate-pulse">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <h3 className="text-white font-bold text-lg tracking-tight">¡Archivo Duplicado Detectado!</h3>
              <div className="text-gray-400 text-sm space-y-2 mt-2 bg-white/5 border border-white/5 rounded-2xl p-4 w-full text-left">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Información de coincidencia:</p>
                <p className="font-semibold text-white truncate"><span className="text-gray-500 font-medium">Nombre:</span> {duplicateInfo.fileName}</p>
                <p className="text-white"><span className="text-gray-500 font-medium">Módulo:</span> {duplicateInfo.module}</p>
                <p className="text-white"><span className="text-gray-500 font-medium">Ubicación:</span> {duplicateInfo.details}</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ¿Estás seguro de que quieres subir este archivo de todas formas? Se guardará como una versión adicional.
              </p>
              <div className="flex gap-3 w-full mt-4">
                <button
                  type="button"
                  onClick={duplicateInfo.onSkip}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={duplicateInfo.onKeep}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-950/20"
                >
                  Subir de todas formas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
