'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, Image as ImageIcon, XCircle, CheckCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { triggerConfetti } from '@/components/layout/Confetti'

interface PalletUploadZoneProps {
  dispatchId: string
  onUploadSuccess: () => void
}

async function calculateSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PalletUploadZone({ dispatchId, onUploadSuccess }: PalletUploadZoneProps) {
  const [folio1, setFolio1] = useState('')
  const [folio2, setFolio2] = useState('')
  const [state, setState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [pendingFile, setPendingFile] = useState<{ file: File; hash: string } | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<{ fileName: string; module: string; details: string } | null>(null)

  const performUpload = async (uploadFile: File, fileHash: string) => {
    setState('uploading')
    setMessage('Subiendo foto de pallet...')
    const folios = [folio1.trim(), folio2.trim()].filter(Boolean).join(' - ')

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('document_type', 'pata_pata_photo')
      formData.append('folios', folios)
      formData.append('file_hash', fileHash)

      const res = await fetch(`/api/despachos/${dispatchId}/upload`, {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Error al subir la foto')
      }

      setState('success')
      setMessage(`Foto de pallet(s) ${folios} subida correctamente.`)
      setFolio1('')
      setFolio2('')
      triggerConfetti()
      onUploadSuccess()

      setTimeout(() => {
        setState('idle')
        setMessage('')
      }, 4000)
    } catch (err: any) {
      setState('error')
      setMessage(err.message)
    }
  }

  const handleUpload = async (file: File) => {
    if (!folio1.trim() && !folio2.trim()) {
      setState('error')
      setMessage('Debes ingresar al menos un número de folio.')
      return
    }

    let uploadFile = file

    // Comprimir la imagen si es mayor a 100KB para optimizar almacenamiento y velocidad
    if (uploadFile.type.startsWith('image/') && uploadFile.size > 100 * 1024) {
      setState('uploading')
      setMessage('Comprimiendo imagen (optimizando para PDF)...')
      try {
        const options = {
          maxSizeMB: 0.4, // Máximo 400KB
          maxWidthOrHeight: 1200, // Resolución nítida y óptima para el PDF A4
          useWebWorker: true
        }
        const compressedBlob = await imageCompression(uploadFile, options)
        uploadFile = new File([compressedBlob], uploadFile.name, { type: uploadFile.type })
      } catch (error) {
        console.error('Error al comprimir la imagen', error)
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
      console.error('Error durante la verificación o procesamiento de la foto:', err)
      setState('error')
      setMessage('Error al procesar el archivo. Reintenta.')
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    handleUpload(acceptedFiles[0])
  }, [folio1, folio2])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'] },
    maxFiles: 1,
    disabled: state === 'uploading',
  })

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4 relative">
      <h3 className="text-white text-sm font-medium mb-3">Subir Foto de Pallet (Pata a Pata)</h3>
      
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Folio 1 (Obligatorio)</label>
          <input
            type="text"
            value={folio1}
            onChange={e => setFolio1(e.target.value)}
            placeholder="Ej: 4402"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Folio 2 (Opcional)</label>
          <input
            type="text"
            value={folio2}
            onChange={e => setFolio2(e.target.value)}
            placeholder="Ej: 4403"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
          />
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center
          ${isDragActive ? 'border-indigo-400/80 bg-indigo-500/5 upload-zone-drag-active-pallet' : 'border-white/10 hover:border-white/25 bg-white/2'}
          ${state === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {state === 'uploading' ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-2" />
            <p className="text-indigo-400 text-xs">{message}</p>
          </div>
        ) : state === 'success' ? (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-6 h-6 text-green-400 mb-2" />
            <p className="text-green-400 text-xs">{message}</p>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center">
            <XCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-red-400 text-xs">{message}</p>
            <p className="text-gray-500 text-[10px] mt-1">Haz clic para intentar de nuevo</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2">
              <Upload className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-gray-300 text-xs font-medium">Arrastra la foto o haz clic para tomarla</p>
            <p className="text-gray-500 text-[10px] mt-1">Recuerda ingresar el/los folios antes de subir</p>
          </div>
        )}
      </div>

      {/* Modal interactivo de Advertencia de Duplicado */}
      {pendingFile && duplicateInfo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border-2 border-amber-500/30 rounded-3xl w-full max-w-md shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 animate-pulse">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <h3 className="text-white font-bold text-lg tracking-tight">¡Foto de Pallet Duplicada!</h3>
              <div className="text-gray-400 text-sm space-y-2 mt-2 bg-white/5 border border-white/5 rounded-2xl p-4 w-full text-left">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Información de coincidencia:</p>
                <p className="font-semibold text-white truncate"><span className="text-gray-500 font-medium">Nombre:</span> {duplicateInfo.fileName}</p>
                <p className="text-white"><span className="text-gray-500 font-medium">Módulo:</span> {duplicateInfo.module}</p>
                <p className="text-white"><span className="text-gray-500 font-medium">Ubicación:</span> {duplicateInfo.details}</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ¿Estás seguro de que quieres subir esta foto de todas formas? Se guardará como un registro duplicado.
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
