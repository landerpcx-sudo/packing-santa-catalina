'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
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
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [rotation, setRotation] = useState<number>(0)
  const [filter, setFilter] = useState<FilterType>('scan')
  
  // Recorte (porcentajes de margen 0 a 45)
  const [cropTop, setCropTop] = useState<number>(5)
  const [cropBottom, setCropBottom] = useState<number>(5)
  const [cropLeft, setCropLeft] = useState<number>(5)
  const [cropRight, setCropRight] = useState<number>(5)

  const [originalSize, setOriginalSize] = useState<number>(0)
  const [processing, setProcessing] = useState<boolean>(false)

  // Estados de la cámara en vivo
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [useLiveCamera, setUseLiveCamera] = useState<boolean>(true)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Ref callback para el elemento de video - Garantiza la vinculación del stream inmediatamente al montarse el nodo en el DOM
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      videoElementRef.current = node
      if (stream) {
        node.srcObject = stream
        // Forzar la reproducción inmediata del streaming en navegadores móviles
        node.play().catch(err => {
          console.warn("Fallo al forzar reproducción de video:", err)
        })
      }
    } else {
      videoElementRef.current = null
    }
  }, [stream])

  // Detener la transmisión de la cámara
  const stopLiveCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }, [stream])

  // Iniciar la transmisión de video de la cámara trasera
  const startLiveCamera = useCallback(async () => {
    try {
      // Detener cualquier stream anterior
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Forzar cámara trasera del celular
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      })

      setStream(mediaStream)
      setCameraError(null)
      setUseLiveCamera(true)

      // Vinculación de seguridad si el nodo ya existe en el DOM
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = mediaStream
        videoElementRef.current.play().catch(e => console.warn(e))
      }
    } catch (err) {
      console.warn('La cámara en vivo falló o no está soportada:', err)
      setCameraError('No se pudo activar la cámara interna en vivo. Usaremos la cámara nativa de tu teléfono.')
      setUseLiveCamera(false)
    }
  }, [stream])

  // Control del ciclo de vida del modal y bloqueo de scroll
  useEffect(() => {
    if (isOpen) {
      // Bloquear scroll de la página de fondo
      document.body.style.overflow = 'hidden'

      setImageSrc(null)
      setRotation(0)
      setFilter('scan')
      setCropTop(5)
      setCropBottom(5)
      setCropLeft(5)
      setCropRight(5)
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
      // Detener cámara en desmontaje
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  // Lanzar el selector de archivos / cámara nativa del sistema
  const triggerNativeCamera = () => {
    fileInputRef.current?.click()
  }

  // Procesar archivo de la cámara nativa del sistema
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setOriginalSize(file.size)
    
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Capturar fotograma actual del video en vivo
  const captureLiveFrame = () => {
    if (!videoElementRef.current || !canvasRef.current) return
    const video = videoElementRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const videoWidth = video.videoWidth || 1280
    const videoHeight = video.videoHeight || 720
    
    canvas.width = videoWidth
    canvas.height = videoHeight

    // Dibujar el cuadro actual en el canvas
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight)

    // Detener la cámara para liberar recursos
    stopLiveCamera()

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setImageSrc(dataUrl)
    setOriginalSize(dataUrl.length * 0.75) // Peso aproximado
  }

  const rotateImage = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Procesar y recortar la imagen final
  const handleSave = () => {
    if (!imageSrc || !canvasRef.current) return
    setProcessing(true)

    setTimeout(() => {
      try {
        const img = new Image()
        img.onload = () => {
          const canvas = canvasRef.current!
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          let origWidth = img.naturalWidth
          let origHeight = img.naturalHeight

          // Ajustar por rotación
          const isRotated90or270 = rotation === 90 || rotation === 270
          let targetWidth = isRotated90or270 ? origHeight : origWidth
          let targetHeight = isRotated90or270 ? origWidth : origHeight

          const leftPx = (cropLeft / 100) * targetWidth
          const rightPx = (cropRight / 100) * targetWidth
          const topPx = (cropTop / 100) * targetHeight
          const bottomPx = (cropBottom / 100) * targetHeight

          const croppedWidth = targetWidth - leftPx - rightPx
          const croppedHeight = targetHeight - topPx - bottomPx

          // Redimensionar para optimizar peso (máx 1600px en el lado más largo)
          const maxDimension = 1600
          let finalWidth = croppedWidth
          let finalHeight = croppedHeight

          if (croppedWidth > maxDimension || croppedHeight > maxDimension) {
            const ratio = croppedWidth / croppedHeight
            if (ratio > 1) {
              finalWidth = maxDimension
              finalHeight = maxDimension / ratio
            } else {
              finalHeight = maxDimension
              finalWidth = maxDimension * ratio
            }
          }

          canvas.width = finalWidth
          canvas.height = finalHeight

          // Lienzo en blanco
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, finalWidth, finalHeight)

          // Canvas temporal para aplicar rotación y recortes en alta definición
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = targetWidth
          tempCanvas.height = targetHeight
          const tempCtx = tempCanvas.getContext('2d')!

          tempCtx.translate(targetWidth / 2, targetHeight / 2)
          tempCtx.rotate((rotation * Math.PI) / 180)
          tempCtx.drawImage(img, -origWidth / 2, -origHeight / 2, origWidth, origHeight)

          // Pintar la porción recortada en el canvas final escalado
          ctx.drawImage(
            tempCanvas,
            leftPx, topPx, croppedWidth, croppedHeight,
            0, 0, finalWidth, finalHeight
          )

          // Filtro de Legibilidad
          if (filter === 'grayscale' || filter === 'scan') {
            const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight)
            const data = imageData.data

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i]
              const g = data[i+1]
              const b = data[i+2]

              const gray = 0.299 * r + 0.587 * g + 0.114 * b

              if (filter === 'scan') {
                // Algoritmo adaptativo para simular fotocopia nítida sin sombras
                let finalGray = gray
                if (gray > 130) {
                  finalGray = Math.min(255, gray * 1.35)
                } else {
                  finalGray = Math.max(0, gray * 0.65)
                }
                data[i] = finalGray
                data[i+1] = finalGray
                data[i+2] = finalGray
              } else {
                data[i] = gray
                data[i+1] = gray
                data[i+2] = gray
              }
            }
            ctx.putImageData(imageData, 0, 0)
          }

          // Exportar WebP liviano
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const cleanLabel = documentLabel.replace(/ \(.*\)/, '')
                const fileName = `${cleanLabel} Escaneado ${lotCodeOrDispatchId}.webp`
                const scannedFile = new File([blob], fileName, { type: 'image/webp' })

                onScanComplete(scannedFile)
                onClose()
              } else {
                alert('Error al generar el archivo final.')
              }
              setProcessing(false)
            },
            'image/webp',
            0.65
          )
        }
        img.src = imageSrc
      } catch (err) {
        console.error(err)
        alert('Ocurrió un error al procesar el escaneo.')
        setProcessing(false)
      }
    }, 100)
  }

  const formatMB = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black overflow-hidden select-none touch-none">
      
      {/* -------------------- PASO 1: CAPTURA DE FOTO -------------------- */}
      {!imageSrc && (
        <>
          {/* Cámara en vivo como fondo completo */}
          {useLiveCamera && stream ? (
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover z-0"
            />
          ) : (
            /* Fallback en el centro si no hay stream */
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0d121f] space-y-6 z-0">
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/5 animate-pulse">
                <Camera size={38} />
              </div>
              <div className="space-y-2">
                <h4 className="text-white font-bold text-base">Escanear con Cámara del Sistema</h4>
                <p className="text-xs text-gray-400 max-w-xs mx-auto">
                  Toma una foto de tu reporte. Al regresar de la cámara, el sistema te permitirá recortar la mesa y contrastar el documento.
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

          {/* Grid de encuadre en el medio (solo si hay cámara en vivo) */}
          {useLiveCamera && stream && (
            <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-10">
              <div className="w-[88%] h-[68%] border-2 border-dashed border-emerald-400/55 rounded-2xl flex flex-col items-center justify-end pb-8">
                <span className="text-[10px] bg-emerald-600/95 text-white font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-lg border border-emerald-500/20 backdrop-blur-sm">
                  Alinea el papel aquí
                </span>
              </div>
            </div>
          )}

          {/* Botonera de control inferior flotante */}
          {useLiveCamera && stream && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/45 to-transparent p-6 z-20 flex items-center justify-center pb-8">
              <div className="flex items-center gap-3 w-full max-w-sm">
                <button
                  onClick={() => {
                    stopLiveCamera()
                    setUseLiveCamera(false)
                    triggerNativeCamera()
                  }}
                  className="flex-1 py-3 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition-all backdrop-blur-md border border-white/15 shadow-md"
                >
                  Cámara Celu
                </button>
                <button
                  onClick={captureLiveFrame}
                  className="flex-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/40 flex items-center justify-center gap-2 border border-emerald-500/20"
                >
                  <Camera size={16} /> Capturar Foto
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* -------------------- PASO 2: HERRAMIENTAS DE EDICIÓN -------------------- */}
      {imageSrc && (
        <>
          {/* Fondo para la edición */}
          <div className="absolute inset-0 bg-[#070b13] z-0" />

          {/* Contenedor de Previsualización Recortable en el Centro */}
          <div className="absolute inset-0 flex items-center justify-center p-4 z-10 pb-[280px] pt-[75px]">
            <div 
              className="relative w-full h-full transition-transform duration-300 flex items-center justify-center"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <img 
                ref={imageRef}
                src={imageSrc} 
                alt="Original" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/5"
              />

              {/* Máscara de recorte */}
              <div 
                className="absolute border-2 border-dashed border-emerald-400 bg-emerald-400/5 pointer-events-none rounded-lg"
                style={{
                  top: `${cropTop}%`,
                  bottom: `${cropBottom}%`,
                  left: `${cropLeft}%`,
                  right: `${cropRight}%`
                }}
              >
                <span className="absolute top-2 left-2 text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider border border-emerald-500/20 shadow-md">
                  Área Escaneada
                </span>
              </div>
            </div>
          </div>

          {/* Panel de control de edición flotante inferior */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 pb-6 z-20 flex flex-col gap-3">
            {/* Sliders táctiles */}
            <div className="bg-[#131924]/95 border border-white/10 rounded-2xl p-3 space-y-2 backdrop-blur-md max-w-md mx-auto w-full shadow-xl">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5 flex items-center gap-1.5">
                <Sparkles size={11} className="text-emerald-400" />
                Ajuste de Bordes (Quitar Mesa/Fondo)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] text-gray-400 font-bold uppercase">
                    <span>Arriba</span>
                    <span>{cropTop}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="45" value={cropTop} 
                    onChange={e => setCropTop(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] text-gray-400 font-bold uppercase">
                    <span>Abajo</span>
                    <span>{cropBottom}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="45" value={cropBottom} 
                    onChange={e => setCropBottom(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] text-gray-400 font-bold uppercase">
                    <span>Izquierda</span>
                    <span>{cropLeft}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="45" value={cropLeft} 
                    onChange={e => setCropLeft(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] text-gray-400 font-bold uppercase">
                    <span>Derecha</span>
                    <span>{cropRight}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="45" value={cropRight} 
                    onChange={e => setCropRight(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Filtros y Rotación */}
            <div className="flex items-center justify-between gap-2 max-w-md mx-auto w-full">
              <button
                onClick={rotateImage}
                className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border border-white/10 shrink-0 backdrop-blur-md"
              >
                <RotateCw size={12} /> Rotar 90°
              </button>

              <div className="flex bg-white/10 p-0.5 rounded-xl border border-white/10 flex-1 justify-around backdrop-blur-md">
                {(['color', 'grayscale', 'scan'] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-2 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex-1 text-center
                      ${filter === f 
                        ? 'bg-emerald-600/35 text-emerald-300 border border-emerald-500/30 shadow-sm' 
                        : 'text-gray-300 hover:text-white'
                      }
                    `}
                  >
                    {f === 'color' ? 'Original' : f === 'grayscale' ? 'Grises' : 'Escáner'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ahorro de peso */}
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-4 py-2 text-[9px] text-emerald-300 font-bold flex items-center justify-between uppercase tracking-wider shrink-0 max-w-md mx-auto w-full backdrop-blur-sm shadow-md">
              <span className="flex items-center gap-1">
                <Sparkles size={11} className="animate-pulse text-emerald-400" />
                Original: {formatMB(originalSize)}
              </span>
              <span>→</span>
              <span>Estimado WebP: ~200 KB (Ahorro ~96%)</span>
            </div>

            {/* Botones definitivos de guardar o cancelar */}
            <div className="flex items-center justify-between gap-3 pt-2 max-w-md mx-auto w-full border-t border-white/10">
              <button
                disabled={processing}
                onClick={() => {
                  setImageSrc(null)
                  startLiveCamera()
                }}
                className="px-4 py-3 border border-white/20 text-gray-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 backdrop-blur-md"
              >
                <Undo size={14} /> Re-tomar
              </button>

              <button
                disabled={processing}
                onClick={handleSave}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-50 border border-emerald-500/20"
              >
                {processing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Escaneando...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Usar Escaneo
                  </>
                )}
              </button>
            </div>
          </div>
        </>
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
    </div>
  )
}
