'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X, RotateCw, Check, Undo, Image as ImageIcon, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

interface DocumentScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanComplete: (scannedFile: File) => void
  documentLabel: string
  lotCodeOrDispatchId: string
}

type FilterType = 'color' | 'grayscale' | 'scan'

export default function DocumentScannerModal({
  isOpen,
  onClose,
  onScanComplete,
  documentLabel,
  lotCodeOrDispatchId,
}: DocumentScannerModalProps) {
  const [mounted, setMounted] = useState(false)
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guideBoxRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [useLiveCamera, setUseLiveCamera] = useState(true)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null) // Para evitar cierres obsoletos en la limpieza de efectos
  const activeRequestIdRef = useRef<number>(0) // Evitar condiciones de carrera y dobles arranques concurrentes
  
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Sincronizar el stream con el estado y la referencia mutable
  const updateStream = (newStream: MediaStream | null) => {
    setStream(newStream)
    streamRef.current = newStream
  }

  // Detener la transmisión de la cámara
  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setStream(null)
  }, [])

  // Iniciar la transmisión de video de la cámara trasera de forma ultra-segura
  const startLiveCamera = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current
    
    try {
      // Detener cualquier stream anterior
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      let mediaStream: MediaStream
      
      try {
        // Intento 1: Cámara trasera ideal Full HD
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        })
      } catch (firstErr) {
        if (requestId !== activeRequestIdRef.current) return
        
        console.warn("Fallo primer intento WebRTC con resolución alta, probando resolución básica:", firstErr)
        try {
          // Intento 2: Cámara trasera resolución básica del sistema
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment'
            },
            audio: false
          })
        } catch (secondErr) {
          if (requestId !== activeRequestIdRef.current) return
          
          console.warn("Fallo segundo intento WebRTC con facingMode, probando cámara genérica:", secondErr)
          // Intento 3: Cualquier cámara de video disponible
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          })
        }
      }

      // Validar si este request sigue siendo el último activo antes de continuar
      if (requestId !== activeRequestIdRef.current) {
        mediaStream.getTracks().forEach(track => track.stop())
        return
      }

      updateStream(mediaStream)
      setCameraError(null)
      setUseLiveCamera(true)

      // Vinculación directa al elemento de video (siempre persistente en el DOM)
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = mediaStream
        videoElementRef.current.play().catch(e => {
          console.warn("La reproducción del video fue pausada o bloqueada por políticas del navegador:", e)
        })
      }
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) return
      console.error('Todos los intentos de activar la cámara WebRTC en vivo fallaron:', err)
      setCameraError('No pudimos iniciar el escáner WebRTC en vivo. Puedes pulsar "Abrir Cámara" para escanear con la cámara del celular.')
      setUseLiveCamera(false)
    }
  }, [])

  // Control del ciclo de vida del modal y bloqueo de scroll
  useEffect(() => {
    if (isOpen) {
      // Bloquear scroll de la página de fondo
      document.body.style.overflow = 'hidden'

      setProcessing(false)
      setCameraError(null)
      setUseLiveCamera(true)

      // Iniciar cámara en vivo
      startLiveCamera()
    } else {
      // Restaurar scroll
      document.body.style.overflow = ''
      stopLiveCamera()
    }

    return () => {
      document.body.style.overflow = ''
      // Invalidar peticiones de cámara en vuelo
      activeRequestIdRef.current++
      // Detener cámara en desmontaje utilizando la referencia mutable segura
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [isOpen, startLiveCamera, stopLiveCamera])

  // Montar componente para Portal seguro
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  // Lanzar el selector de archivos / cámara nativa del sistema
  const triggerNativeCamera = () => {
    fileInputRef.current?.click()
  }

  // Procesar archivo de la cámara nativa del sistema utilizando ObjectURL (cero consumo de RAM)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setProcessing(true)
    
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Comprimir a una resolución legible y súper liviana (máximo 1200px)
      const maxDimension = 1200
      let finalWidth = img.naturalWidth
      let finalHeight = img.naturalHeight
      
      if (finalWidth > maxDimension || finalHeight > maxDimension) {
        const ratio = finalWidth / finalHeight
        if (ratio > 1) {
          finalWidth = maxDimension
          finalHeight = maxDimension / ratio
        } else {
          finalHeight = maxDimension
          finalWidth = maxDimension * ratio
        }
      }
      
      const canvas = document.createElement('canvas')
      canvas.width = finalWidth
      canvas.height = finalHeight
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, finalWidth, finalHeight)
      ctx.drawImage(img, 0, 0, finalWidth, finalHeight)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const cleanLabel = documentLabel.replace(/ \(.*\)/, '')
            const fileName = `${cleanLabel} Escaneado ${lotCodeOrDispatchId}.webp`
            const scannedFile = new File([blob], fileName, { type: 'image/webp' })
            onScanComplete(scannedFile)
            onClose()
          } else {
            alert('Error al procesar la imagen.')
          }
          setProcessing(false)
          URL.revokeObjectURL(objectUrl) // Liberar memoria de inmediato
        },
        'image/webp',
        0.80 // Calidad óptima para conservar nitidez y peso pluma
      )
    }
    img.onerror = () => {
      alert('Error al cargar la imagen.')
      setProcessing(false)
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  }

  // Capturar fotograma actual y recortar al tamaño Carta
  const captureLiveFrame = () => {
    const video = videoElementRef.current
    const canvas = canvasRef.current
    const guideBox = guideBoxRef.current
    if (!video || !canvas || !guideBox) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    setProcessing(true)

    // Dimensiones originales del stream (sensor)
    let actualVideoWidth = video.videoWidth
    let actualVideoHeight = video.videoHeight

    // Obtener dimensiones reales renderizadas en pantalla
    const videoRect = video.getBoundingClientRect()
    const guideRect = guideBox.getBoundingClientRect()

    const isPortraitScreen = videoRect.height > videoRect.width
    const isLandscapeVideo = actualVideoWidth > actualVideoHeight

    if (isPortraitScreen && isLandscapeVideo) {
      actualVideoWidth = video.videoHeight
      actualVideoHeight = video.videoWidth
    }

    // Calcular proporción visual del "object-fit: cover"
    const videoRatio = actualVideoWidth / actualVideoHeight
    const screenRatio = videoRect.width / videoRect.height
    
    let renderedWidth, renderedHeight, offsetX = 0, offsetY = 0

    if (screenRatio > videoRatio) {
      renderedWidth = videoRect.width
      renderedHeight = videoRect.width / videoRatio
      offsetY = (renderedHeight - videoRect.height) / 2
    } else {
      renderedHeight = videoRect.height
      renderedWidth = videoRect.height * videoRatio
      offsetX = (renderedWidth - videoRect.width) / 2
    }

    const relativeBoxLeft = guideRect.left - videoRect.left
    const relativeBoxTop = guideRect.top - videoRect.top

    const boxLeft = relativeBoxLeft + offsetX
    const boxTop = relativeBoxTop + offsetY
    const boxWidth = guideRect.width
    const boxHeight = guideRect.height

    const scaleValue = actualVideoWidth / renderedWidth
    
    const cropX = boxLeft * scaleValue
    const cropY = boxTop * scaleValue
    const cropW = boxWidth * scaleValue
    const cropH = boxHeight * scaleValue

    // Detener la cámara al instante para ahorrar batería y no colgar hilos
    stopLiveCamera()

    // 1. Crear canvas temporal de alta resolución para el recorte
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = cropW
    tempCanvas.height = cropH
    const tempCtx = tempCanvas.getContext('2d')
    if (tempCtx) {
      tempCtx.fillStyle = '#ffffff'
      tempCtx.fillRect(0, 0, cropW, cropH)
      
      const drawX = -boxLeft * scaleValue
      const drawY = -boxTop * scaleValue
      const drawW = renderedWidth * scaleValue
      const drawH = renderedHeight * scaleValue
      tempCtx.drawImage(video, drawX, drawY, drawW, drawH)
    }

    // 2. Redimensionar al canvas final de tamaño ultra optimizado y nitidez óptima (máximo 1200px)
    const maxDimension = 1200
    let finalW = cropW
    let finalH = cropH
    
    if (cropW > maxDimension || cropH > maxDimension) {
      const ratio = cropW / cropH
      if (ratio > 1) {
        finalW = maxDimension
        finalH = maxDimension / ratio
      } else {
        finalH = maxDimension
        finalW = maxDimension * ratio
      }
    }

    canvas.width = finalW
    canvas.height = finalH
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, finalW, finalH)
    ctx.drawImage(tempCanvas, 0, 0, cropW, cropH, 0, 0, finalW, finalH)

    // Exportar directamente y cerrar
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const cleanLabel = documentLabel.replace(/ \(.*\)/, '')
          const fileName = `${cleanLabel} Escaneado ${lotCodeOrDispatchId}.webp`
          const scannedFile = new File([blob], fileName, { type: 'image/webp' })

          onScanComplete(scannedFile)
          onClose()
        } else {
          alert('Error al generar el escaneo final.')
        }
        setProcessing(false)
      },
      'image/webp',
      0.80 // 80% es el punto dulce para web (documento nítido y ultraligero)
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black overflow-hidden select-none touch-none">
      
      {/* -------------------- CAPTURA DE FOTO -------------------- */}
      {/* Cámara en vivo como fondo completo (Siempre presente en el DOM para evitar race conditions de React refs) */}
      <video 
        ref={videoElementRef}
        autoPlay 
        playsInline 
        muted 
        onLoadedMetadata={(e) => {
          e.currentTarget.play().catch(err => {
            console.warn("Fallo reproducción automática al cargar metadatos:", err)
          })
        }}
        className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-200 ${useLiveCamera && stream ? 'opacity-100 block' : 'opacity-0 hidden'}`}
      />

      {/* Fallback en el centro si no hay stream o falló WebRTC */}
      {(!useLiveCamera || !stream) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0d121f] space-y-6 z-0">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/5 animate-pulse">
            <Camera size={38} />
          </div>
          <div className="space-y-2">
            <h4 className="text-white font-bold text-base">Escanear con Cámara del Sistema</h4>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              Toma una foto de tu reporte. El sistema la procesará automáticamente.
            </p>
          </div>

          {cameraError && (
            <div className="flex items-start gap-2 max-w-xs mx-auto p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-amber-400 text-[10px] font-bold text-left uppercase">
              <AlertCircle size={14} className="shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          <button
            onClick={triggerNativeCamera}
            className="w-full max-w-xs py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 border border-emerald-500/20"
          >
            <Camera size={16} />
            Abrir Cámara
          </button>
        </div>
      )}

      {/* Grid de encuadre (Tamaño Carta) en el medio (solo si hay cámara en vivo) */}
      {useLiveCamera && stream && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none z-10 pb-[100px]">
          <div 
            ref={guideBoxRef}
            className="w-full max-w-sm aspect-[8.5/11] max-h-[75vh] border-2 border-dashed border-emerald-400/80 bg-emerald-400/5 rounded-xl flex flex-col items-center justify-center relative shadow-[0_0_0_4000px_rgba(0,0,0,0.65)]"
          >
            <div className="absolute inset-0 border border-emerald-500/30 rounded-xl" />
            {/* Esquinas */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
            
            <span className="text-[10px] bg-emerald-600/95 text-white font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-lg border border-emerald-500/20 backdrop-blur-sm absolute bottom-8">
              Alinea Hoja Carta
            </span>
          </div>
        </div>
      )}

      {/* Botonera de control inferior flotante */}
      {useLiveCamera && stream && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6 z-20 flex items-center justify-center pb-8 pt-12">
          <div className="flex items-center gap-3 w-full max-w-sm">
            <button
              disabled={processing}
              onClick={() => {
                stopLiveCamera()
                setUseLiveCamera(false)
                triggerNativeCamera()
              }}
              className="flex-1 py-3 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition-all backdrop-blur-md border border-white/15 shadow-md animate-fade-in"
            >
              Cámara Celu
            </button>
            <button
              disabled={processing}
              onClick={captureLiveFrame}
              className="flex-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/40 flex items-center justify-center gap-2 border border-emerald-500/20 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Procesando
                </>
              ) : (
                <>
                  <Camera size={16} /> Capturar Foto
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* -------------------- ELEMENTOS COMUNES FLOTANTES (HEADER) -------------------- */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black via-black/45 to-transparent p-5 z-30 flex items-center justify-between pointer-events-auto">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <Sparkles className="text-emerald-400 w-4 h-4 animate-pulse" />
            Escáner Móvil Inteligente
          </h3>
          <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest mt-0.5">{documentLabel}</p>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all backdrop-blur-md border border-white/10"
        >
          <X size={18} />
        </button>
      </div>

      {/* Input de cámara oculto */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Canvas de procesamiento oculto */}
      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  )
}
