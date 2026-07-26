'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import imageCompression from 'browser-image-compression'
import { Upload, XCircle, CheckCircle, Loader2, AlertTriangle, X, ImagePlus } from 'lucide-react'
import { triggerConfetti } from '@/components/layout/Confetti'
import { useUploadQueue } from '@/context/UploadQueueContext'

interface PalletUploadZoneProps {
  dispatchId: string
  onUploadSuccess: () => void
}

interface ArchivoPendiente {
  id: string
  file: File
  previewUrl: string
  folios: string
}

interface ArchivoProcesando {
  id: string
  name: string
  status: 'preparando' | 'en_cola' | 'listo' | 'error' | 'duplicado_omitido'
  message: string
}

async function calculateSHA256(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Antes: una foto a la vez, con dos campos de folio arriba. Para subir 18
// fotos de pallets eran 18 ciclos completos de arrastrar-esperar-confirmar.
//
// Ahora: se sueltan todas las fotos de una vez, se les escribe el folio a
// cada una (cada foto suele mostrar pallets distintos) y un solo botón las
// manda todas a la cola de subida, que se encarga de reintentar si se corta
// la conexión.
// ─────────────────────────────────────────────────────────────────────────────
export default function PalletUploadZone({ dispatchId, onUploadSuccess }: PalletUploadZoneProps) {
  const { enqueue } = useUploadQueue()
  const [pendientes, setPendientes] = useState<ArchivoPendiente[]>([])
  const [procesando, setProcesando] = useState<ArchivoProcesando[]>([])
  const [enviando, setEnviando] = useState(false)
  const [faltaFolioIds, setFaltaFolioIds] = useState<Set<string>>(new Set())
  const [duplicateInfo, setDuplicateInfo] = useState<{
    fileName: string; module: string; details: string
    onKeep: () => void; onSkip: () => void
  } | null>(null)

  const previewUrlsRef = useRef<string[]>([])
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    const nuevos = acceptedFiles.map((file, i) => {
      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.push(previewUrl)
      return {
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        folios: '',
      }
    })
    setPendientes(prev => [...prev, ...nuevos])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'] },
    maxFiles: 40,
    disabled: enviando,
  })

  const quitarPendiente = (id: string) => {
    setPendientes(prev => {
      const item = prev.find(p => p.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  const actualizarFolio = (id: string, folios: string) => {
    setPendientes(prev => prev.map(p => (p.id === id ? { ...p, folios } : p)))
    setFaltaFolioIds(prev => {
      if (!prev.has(id)) return prev
      const copy = new Set(prev)
      copy.delete(id)
      return copy
    })
  }

  const procesarUno = async (item: ArchivoPendiente, procesandoId: string) => {
    const updateProc = (patch: Partial<ArchivoProcesando>) => {
      setProcesando(prev => prev.map(p => (p.id === procesandoId ? { ...p, ...patch } : p)))
    }

    let uploadFile: File = item.file
    if (uploadFile.type.startsWith('image/') && uploadFile.size > 100 * 1024) {
      updateProc({ message: 'Optimizando imagen...' })
      try {
        const options = { maxSizeMB: 0.4, maxWidthOrHeight: 1200, useWebWorker: true }
        const compressedBlob = await imageCompression(uploadFile, options)
        uploadFile = new File([compressedBlob], uploadFile.name, { type: uploadFile.type })
      } catch (error) {
        console.error('Error al comprimir la imagen', error)
      }
    }

    updateProc({ message: 'Calculando huella digital...' })
    let hash = ''
    try {
      hash = await calculateSHA256(uploadFile)
    } catch {}

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
            updateProc({ status: 'duplicado_omitido', message: 'Omitido: ya existe' })
            return
          }
        }
      } catch {
        // Sin red: se sigue adelante, no se pierde la foto.
      }
    }

    updateProc({ status: 'en_cola', message: `Folio ${item.folios} · en cola` })

    await enqueue(
      { entity: 'despachos', entityId: dispatchId, documentType: 'pata_pata_photo', file: uploadFile, fileHash: hash, folios: item.folios.trim() },
      (success, _data, error) => {
        if (success) {
          updateProc({ status: 'listo', message: `Folio ${item.folios} · subida` })
          triggerConfetti()
          onUploadSuccess()
          setTimeout(() => setProcesando(prev => prev.filter(p => p.id !== procesandoId)), 5000)
        } else {
          updateProc({ status: 'error', message: error || 'Error al subir' })
        }
      }
    )
  }

  const handleSubirTodo = async () => {
    const sinFolio = pendientes.filter(p => !p.folios.trim())
    if (sinFolio.length > 0) {
      setFaltaFolioIds(new Set(sinFolio.map(p => p.id)))
      return
    }
    if (pendientes.length === 0) return

    const tanda = pendientes
    setPendientes([])
    setEnviando(true)

    const nuevosProc: ArchivoProcesando[] = tanda.map(item => ({
      id: item.id,
      name: item.file.name,
      status: 'preparando',
      message: 'Preparando...',
    }))
    setProcesando(prev => [...prev, ...nuevosProc])

    for (const item of tanda) {
      try {
        await procesarUno(item, item.id)
      } catch (err: any) {
        setProcesando(prev => prev.map(p => (p.id === item.id ? { ...p, status: 'error', message: err.message || 'Error' } : p)))
      } finally {
        URL.revokeObjectURL(item.previewUrl)
      }
    }
    setEnviando(false)
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4 relative space-y-4">
      <div>
        <h3 className="text-white text-sm font-medium">Subir Fotos de Pallets (Pata a Pata)</h3>
        <p className="text-gray-500 text-[11px] mt-0.5">Suelta varias fotos a la vez y escribe el folio de cada una antes de subir.</p>
      </div>

      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${
          isDragActive ? 'border-indigo-400/80 bg-indigo-500/5' : 'border-white/10 hover:border-white/25 bg-white/2'
        } ${enviando ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2">
            <ImagePlus className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-gray-300 text-xs font-medium">Arrastra las fotos o haz clic para tomarlas</p>
          <p className="text-gray-500 text-[10px] mt-1">Puedes soltar varias a la vez</p>
        </div>
      </div>

      {/* Fotos pendientes de folio, antes de enviarlas a la cola */}
      {pendientes.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {pendientes.map(item => (
              <div key={item.id} className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                faltaFolioIds.has(item.id) ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/5'
              }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.folios}
                    onChange={e => actualizarFolio(item.id, e.target.value)}
                    placeholder="Folio(s), ej: 4402 - 4403"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-400/50"
                  />
                  {faltaFolioIds.has(item.id) && (
                    <p className="text-[10px] text-red-400 mt-0.5">Falta el folio</p>
                  )}
                </div>
                <button
                  onClick={() => quitarPendiente(item.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0"
                  title="Quitar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleSubirTodo}
            disabled={enviando}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Subir {pendientes.length} foto{pendientes.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* Estado de las fotos ya enviadas a la cola */}
      {procesando.length > 0 && (
        <div className="space-y-1.5">
          {procesando.map(item => (
            <div key={item.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs ${
              item.status === 'listo' ? 'bg-green-500/5 border-green-500/20' :
              item.status === 'error' ? 'bg-red-500/5 border-red-500/20' :
              item.status === 'duplicado_omitido' ? 'bg-amber-500/5 border-amber-500/20' :
              'bg-white/3 border-white/8'
            }`}>
              {item.status === 'listo' && <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />}
              {item.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              {item.status === 'duplicado_omitido' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {(item.status === 'preparando' || item.status === 'en_cola') && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 truncate">{item.name}</p>
                <p className={`text-[10px] ${item.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>{item.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal interactivo de Advertencia de Duplicado */}
      {duplicateInfo && (
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
