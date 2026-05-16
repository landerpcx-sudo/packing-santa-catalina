'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, Image as ImageIcon, XCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react'

interface PalletUploadZoneProps {
  dispatchId: string
  onUploadSuccess: () => void
}

export default function PalletUploadZone({ dispatchId, onUploadSuccess }: PalletUploadZoneProps) {
  const [folio1, setFolio1] = useState('')
  const [folio2, setFolio2] = useState('')
  const [state, setState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleUpload = async (file: File) => {
    if (!folio1.trim() && !folio2.trim()) {
      setState('error')
      setMessage('Debes ingresar al menos un número de folio.')
      return
    }

    let uploadFile = file

    // Comprimir la imagen si pesa más de 3MB
    if (uploadFile.type.startsWith('image/') && uploadFile.size > 3 * 1024 * 1024) {
      setState('uploading')
      setMessage('Comprimiendo imagen...')
      try {
        const options = {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        }
        const compressedBlob = await imageCompression(uploadFile, options)
        uploadFile = new File([compressedBlob], uploadFile.name, { type: uploadFile.type })
      } catch (error) {
        console.error('Error al comprimir la imagen', error)
      }
    } else {
      setState('uploading')
      setMessage('Subiendo foto de pallet...')
    }

    const folios = [folio1.trim(), folio2.trim()].filter(Boolean).join(' - ')

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('document_type', 'pata_pata_photo')
      formData.append('folios', folios)

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
    <div className="bg-white/3 border border-white/8 rounded-xl p-4">
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
          ${isDragActive ? 'border-indigo-400/80 bg-indigo-500/5' : 'border-white/10 hover:border-white/25 bg-white/2'}
          ${state === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} capture="environment" />
        
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
    </div>
  )
}
