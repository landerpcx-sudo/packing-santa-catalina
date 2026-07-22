'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, FileText, Image, X, CheckCircle, AlertCircle, Loader2, ExternalLink, Camera, AlertTriangle } from 'lucide-react'
import dynamic from 'next/dynamic'
import { triggerConfetti } from '@/components/layout/Confetti'

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

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

async function calculateSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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
  const [state, setState] = useState<UploadState>('idle')
  const [message, setMessage] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: File; hash: string } | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<{ fileName: string; module: string; details: string } | null>(null)

  const performUpload = async (uploadFile: File, fileHash: string) => {
    setState('uploading')
    setFileName(uploadFile.name)
    setMessage('Preparando subida...')
    setDriveUrl('')

    try {
      let entity = 'lotes'
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

      const headersInit: HeadersInit = { 'Content-Type': 'application/json' }
      if (user?.userId) headersInit['x-user-id'] = user.userId
      if (user?.role) headersInit['x-user-role'] = user.role

      // Paso 1: Presign en Vercel (JSON ligero < 1KB)
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: headersInit,
        body: JSON.stringify({
          entity,
          entityId,
          documentType,
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          fileHash
        }),
      })

      let presignJson: any = {}
      try {
        presignJson = await presignRes.json()
      } catch (e) {
        throw new Error(`Respuesta no válida al preparar subida (${presignRes.status})`)
      }

      if (!presignRes.ok) {
        setState('error')
        setMessage(presignJson.error || `Error ${presignRes.status}: no se pudo preparar la subida`)
        return
      }

      const { signedUrl, storagePath, sanitizedName, versionNumber, mimeType } = presignJson

      // Paso 2: Subir directamente desde el cliente a Supabase Storage (Soporta 50MB, Omite limite 4.5MB Vercel)
      setMessage('Guardando archivo en almacenamiento de alta velocidad...')

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType || 'application/pdf',
        },
        body: uploadFile,
      })

      if (!uploadRes.ok) {
        throw new Error(`Error al guardar en almacenamiento (${uploadRes.status})`)
      }

      // Paso 3: Confirmación en BD y sync a Drive en segundo plano
      setMessage('Finalizando registro...')
      const confirmRes = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: headersInit,
        body: JSON.stringify({
          entity,
          entityId,
          documentType,
          storagePath,
          sanitizedName,
          versionNumber,
          fileHash
        }),
      })

      let confirmJson: any = {}
      try {
        confirmJson = await confirmRes.json()
      } catch (e) {
        throw new Error(`Respuesta no válida al confirmar subida (${confirmRes.status})`)
      }

      if (!confirmRes.ok) {
        setState('error')
        setMessage(confirmJson.error || `Error ${confirmRes.status}: fallo al confirmar la subida`)
        return
      }

      setState('success')
      setMessage(`¡Archivo subido exitosamente!`)
      setDriveUrl(confirmJson.data?.drive_file_url || '')
      triggerConfetti()
      onUploadSuccess()

      // Reset después de 6 segundos
      setTimeout(() => {
        setState('idle')
        setFileName('')
        setMessage('')
      }, 6000)
    } catch (err: any) {
      console.error('Error en UploadZone:', err)
      setState('error')
      setMessage(err.message || 'Error al subir el archivo. Intenta nuevamente.')
    }
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const file = acceptedFiles[0]

      let uploadFile = file

      const isImage = uploadFile.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(uploadFile.name)

      // Si el archivo es una imagen, comprimir si es necesario
      if (isImage) {
        const ext = uploadFile.name.split('.').pop() || 'jpg'
        const cleanLabel = documentLabel.replace(/ \(.*\)/, '')
        const newName = `${cleanLabel} ${lotCode}.${ext}`
        
        if (uploadFile.size > 200 * 1024) {
          setState('uploading')
          setMessage('Comprimiendo imagen (optimizando)...')
          try {
            const options = {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1600,
              useWebWorker: true
            }
            const compressedBlob = await imageCompression(uploadFile, options)
            uploadFile = new File([compressedBlob], newName, { type: compressedBlob.type || 'image/jpeg' })
          } catch (error) {
            console.error('Error al comprimir la imagen', error)
            uploadFile = new File([uploadFile], newName, { type: uploadFile.type || 'image/jpeg' })
          }
        } else {
          uploadFile = new File([uploadFile], newName, { type: uploadFile.type || 'image/jpeg' })
        }
      }

      setState('uploading')
      setMessage('Calculando huella digital (SHA-256)...')

      try {
        const hash = await calculateSHA256(uploadFile)
        
        // Verificar si es un archivo duplicado
        const checkRes = await fetch(`/api/documentos/verificar-duplicado?hash=${hash}`)
        const checkJson = await checkRes.json()

        if (checkRes.ok && checkJson.exists) {
          setPendingFile({ file: uploadFile, hash })
          setDuplicateInfo({
            fileName: checkJson.fileName,
            module: checkJson.module,
            details: checkJson.details
          })
          setState('idle')
          setMessage('')
          return
        }

        // Si no es duplicado, proceder con la subida directa
        await performUpload(uploadFile, hash)
      } catch (err: any) {
        console.error('Error durante la verificación o procesamiento del archivo:', err)
        setState('error')
        setMessage('Error al procesar el archivo. Reintenta.')
      }
    },
    [lotId, documentType, onUploadSuccess, lotCode, documentLabel, uploadUrl]
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

      {/* Modal interactivo de Advertencia de Duplicado */}
      {pendingFile && duplicateInfo && (
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
                  onClick={() => {
                    setPendingFile(null)
                    setDuplicateInfo(null)
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { file, hash } = pendingFile
                    setPendingFile(null)
                    setDuplicateInfo(null)
                    await performUpload(file, hash)
                  }}
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
