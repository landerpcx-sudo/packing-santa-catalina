'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, FileText, Image, X, CheckCircle, AlertCircle, Loader2, ExternalLink, Camera } from 'lucide-react'
import DocumentScannerModal from '@/components/layout/DocumentScannerModal'
import { triggerConfetti } from '@/components/layout/Confetti'

interface UploadZoneProps {
  lotId: string
  lotCode: string
  documentType: string
  documentLabel: string
  accept?: Record<string, string[]>
  onUploadSuccess: () => void
  uploadUrl?: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function UploadZone({
  lotId,
  lotCode,
  documentType,
  documentLabel,
  accept = {
    'application/pdf': ['.pdf'],
    'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
  },
  onUploadSuccess,
  uploadUrl,
}: UploadZoneProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [message, setMessage] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const file = acceptedFiles[0]

      let uploadFile = file

      // Si el archivo es una imagen (probablemente foto del celular), lo renombramos a un formato limpio
      if (uploadFile.type.startsWith('image/')) {
        const ext = uploadFile.name.split('.').pop() || 'jpg'
        // Ej: "Informe de Recepción Lote 155.jpg"
        const cleanLabel = documentLabel.replace(/ \(.*\)/, '') // Elimina cosas como "(PDF)"
        const newName = `${cleanLabel} ${lotCode}.${ext}`
        
        // Comprimir la imagen si es mayor a 100KB para optimizar almacenamiento y velocidad
        if (uploadFile.size > 100 * 1024) {
          setState('uploading')
          setMessage('Comprimiendo imagen (optimizando para PDF)...')
          try {
            const options = {
              maxSizeMB: 0.4, // Máximo 400KB
              maxWidthOrHeight: 1200, // Resolución nítida y óptima para el PDF A4
              useWebWorker: true
            }
            const compressedBlob = await imageCompression(uploadFile, options)
            uploadFile = new File([compressedBlob], newName, { type: uploadFile.type })
          } catch (error) {
            console.error('Error al comprimir la imagen', error)
            // Si falla la compresión, renombramos el archivo original de todas formas
            uploadFile = new File([uploadFile], newName, { type: uploadFile.type })
          }
        } else {
          uploadFile = new File([uploadFile], newName, { type: uploadFile.type })
        }
      }

      setState('uploading')
      setFileName(uploadFile.name)
      setMessage('Subiendo archivo a Google Drive...')
      setDriveUrl('')

      try {
        const formData = new FormData()
        formData.append('file', uploadFile)
        formData.append('document_type', documentType)

        const finalUrl = uploadUrl || `/api/lotes/${lotId}`
        const res = await fetch(finalUrl, {
          method: 'POST',
          body: formData,
        })

        const json = await res.json()

        if (!res.ok) {
          setState('error')
          setMessage(json.error || 'Error al subir el archivo')
          return
        }

        setState('success')
        setMessage(`¡Archivo subido exitosamente!`)
        setDriveUrl(json.data?.drive_file_url || '')
        triggerConfetti()
        onUploadSuccess()

        // Reset después de 6 segundos
        setTimeout(() => {
          setState('idle')
          setFileName('')
          setMessage('')
        }, 6000)
      } catch {
        setState('error')
        setMessage('Error de conexión. Intenta nuevamente.')
      }
    },
    [lotId, documentType, onUploadSuccess]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    disabled: state === 'uploading',
  })

  const borderColor = isDragReject
    ? 'border-red-500/60'
    : isDragActive
    ? 'border-green-400/80'
    : state === 'success'
    ? 'border-green-500/50'
    : state === 'error'
    ? 'border-red-500/50'
    : 'border-white/10 hover:border-white/25'

  const bgColor = isDragActive
    ? 'bg-green-500/5'
    : state === 'success'
    ? 'bg-green-500/5'
    : state === 'error'
    ? 'bg-red-500/5'
    : 'bg-white/2 hover:bg-white/5'

  return (
    <div className="space-y-3">
      {/* Botón de Escáner Integrado - Solo visible en móvil (oculto en escritorio con md:hidden) */}
      {state === 'idle' && Object.keys(accept).some(mime => mime.startsWith('image/') || mime === 'image/*') && (
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
        className={`
          relative border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all duration-300
          ${borderColor} ${bgColor}
          ${state === 'uploading' ? 'cursor-not-allowed' : ''}
          ${isDragActive ? 'upload-zone-drag-active' : ''}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center text-center gap-3">
          {/* Icono de estado */}
          {state === 'uploading' && (
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          )}
          {state === 'success' && (
            <CheckCircle className="w-10 h-10 text-green-400" />
          )}
          {state === 'error' && (
            <AlertCircle className="w-10 h-10 text-red-400" />
          )}
          {state === 'idle' && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors
              ${isDragActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400'}
            `}>
              {documentType.includes('photo') ? (
                <Image className="w-6 h-6" />
              ) : (
                <FileText className="w-6 h-6" />
              )}
            </div>
          )}

          {/* Texto principal */}
          {state === 'idle' && (
            <>
              <div>
                <p className="text-white/80 font-medium text-sm">
                  {isDragActive ? 'Suelta el archivo aquí' : `Subir ${documentLabel}`}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Arrastra el archivo o <span className="text-green-400">haz clic para seleccionar</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {Object.keys(accept).map((mime) => (
                  <span key={mime} className="bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-500 text-xs">
                    {accept[mime].join(', ')}
                  </span>
                ))}
              </div>
            </>
          )}

          {state === 'uploading' && (
            <div>
              <p className="text-blue-400 font-medium text-sm">{message}</p>
              {fileName && (
                <p className="text-gray-500 text-xs mt-1 truncate max-w-xs">{fileName}</p>
              )}
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-1">
              <p className="text-green-400 font-semibold text-sm">{message}</p>
              {fileName && (
                <p className="text-gray-400 text-xs truncate max-w-xs">{fileName}</p>
              )}
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs underline mt-1"
                >
                  Ver en Drive <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-1">
              <p className="text-red-400 font-medium text-sm">{message}</p>
              <p className="text-gray-500 text-xs">Haz clic para intentar de nuevo</p>
            </div>
          )}
        </div>
      </div>

      <DocumentScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanComplete={(scannedFile) => {
          onDrop([scannedFile]);
        }}
        documentLabel={documentLabel}
        lotCodeOrDispatchId={lotCode}
      />
    </div>
  )
}
