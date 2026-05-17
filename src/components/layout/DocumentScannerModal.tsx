'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X, RotateCw, Check, Undo, Image as ImageIcon, Sparkles, RefreshCw, AlertCircle, ZoomIn } from 'lucide-react'

interface DocumentScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanComplete: (scannedFile: File) => void
  documentLabel: string
  lotCodeOrDispatchId: string
  initialImage: string | null
}

type FilterType = 'color' | 'grayscale' | 'scan'

export default function DocumentScannerModal({
  isOpen,
  onClose,
  onScanComplete,
  documentLabel,
  lotCodeOrDispatchId,
  initialImage,
}: DocumentScannerModalProps) {
  const [mounted, setMounted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guideBoxRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Estados de cámara en vivo
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)

  // Estados del editor de imagen
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [scale, setScale] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [filter, setFilter] = useState<FilterType>('color')

  // Estado de arrastre/panning
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Iniciar cámara en vivo con fallbacks robustos
  const startCamera = async () => {
    setProcessing(true)
    setCameraError(null)
    
    // Detener cualquier stream anterior
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop())
    }
    setCameraStream(null)
    activeStreamRef.current = null

    // Intentar con configuraciones redundantes para máxima compatibilidad con Android Chrome
    const constraintsList = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: {
          facingMode: 'environment'
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ]

    let streamInstance: MediaStream | null = null

    for (const constraints of constraintsList) {
      try {
        streamInstance = await navigator.mediaDevices.getUserMedia(constraints)
        if (streamInstance) break
      } catch (err) {
        console.warn("Camera fallback constraint failed, trying next...", err)
      }
    }

    if (streamInstance) {
      setCameraStream(streamInstance)
      activeStreamRef.current = streamInstance
      if (videoRef.current) {
        videoRef.current.srcObject = streamInstance
        try {
          await videoRef.current.play()
        } catch (playErr) {
          console.error("Error al reproducir el feed de video", playErr)
        }
      }
    } else {
      setCameraError("No se pudo iniciar la cámara en vivo. Puedes subir una foto desde tu galería.")
    }
    setProcessing(false)
  }

  // Detener cámara en vivo
  const stopCamera = () => {
    const activeStream = activeStreamRef.current || cameraStream
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop())
    }
    setCameraStream(null)
    activeStreamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Capturar fotograma actual del feed de video
  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    setProcessing(true)
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setProcessing(false)
      return
    }

    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    canvas.width = w
    canvas.height = h

    // Dibujar fotograma
    ctx.drawImage(video, 0, 0, w, h)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          if (capturedImage && capturedImage.startsWith('blob:')) {
            URL.revokeObjectURL(capturedImage)
          }
          const url = URL.createObjectURL(blob)
          setCapturedImage(url)
          stopCamera()
        } else {
          alert('Error al capturar la imagen. Intenta de nuevo.')
        }
        setProcessing(false)
      },
      'image/jpeg',
      0.92
    )
  }

  // Control del ciclo de vida y scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setProcessing(false)
      setRotation(0)
      setScale(1.0)
      setPan({ x: 0, y: 0 })
      setFilter('color')
      setCameraError(null)

      if (initialImage) {
        setCapturedImage(initialImage)
        stopCamera()
      } else {
        setCapturedImage(null)
        const timer = setTimeout(() => {
          startCamera()
        }, 150)
        return () => clearTimeout(timer)
      }
    } else {
      document.body.style.overflow = ''
      stopCamera()
    }

    return () => {
      document.body.style.overflow = ''
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [isOpen, initialImage])

  useEffect(() => {
    setMounted(true)
    return () => {
      if (capturedImage && capturedImage.startsWith('blob:')) {
        URL.revokeObjectURL(capturedImage)
      }
    }
  }, [capturedImage])

  if (!isOpen || !mounted) return null

  // Abrir selector nativo de cámara/archivos
  const triggerNativeCamera = () => {
    fileInputRef.current?.click()
  }

  // Procesar imagen cargada manualmente o desde galería
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setProcessing(true)
    stopCamera()

    try {
      if (capturedImage && capturedImage.startsWith('blob:')) {
        URL.revokeObjectURL(capturedImage)
      }

      const objectUrl = URL.createObjectURL(file)
      setCapturedImage(objectUrl)
    } catch (err) {
      console.error(err)
      alert('Error al leer la foto. Intenta de nuevo.')
    } finally {
      setProcessing(false)
    }
  }

  // Manejadores de arrastre/panning
  const handleStart = (clientX: number, clientY: number) => {
    if (processing) return
    setIsDragging(true)
    dragStartRef.current = { x: clientX - pan.x, y: clientY - pan.y }
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging || processing) return
    setPan({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y
    })
  }

  const handleEnd = () => {
    setIsDragging(false)
  }

  // Confirmar recorte, aplicar filtros y exportar a WebP de alta definición
  const handleConfirmCrop = () => {
    if (!capturedImage) return
    setProcessing(true)

    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current || document.createElement('canvas')
      
      // Formato carta estándar de alta definición (8.5 x 11 pulgadas -> 1200 x 1553 píxeles)
      const canvasWidth = 1200
      const canvasHeight = 1553
      
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setProcessing(false)
        return
      }

      // Rellenar fondo de blanco
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // Filtros de digitalización profesional
      if (filter === 'grayscale') {
        ctx.filter = 'grayscale(100%) contrast(1.15) brightness(1.05)'
      } else if (filter === 'scan') {
        ctx.filter = 'grayscale(100%) contrast(2.3) brightness(1.15)'
      } else {
        ctx.filter = 'none'
      }

      ctx.save()
      ctx.translate(canvasWidth / 2, canvasHeight / 2)
      ctx.rotate((rotation * Math.PI) / 180)

      const imgWidth = img.naturalWidth
      const imgHeight = img.naturalHeight

      // Mapear el encuadre visual de la pantalla al canvas final
      const guideBox = guideBoxRef.current
      if (guideBox) {
        const guideRect = guideBox.getBoundingClientRect()
        const screenGuideW = guideRect.width
        const screenGuideH = guideRect.height

        const screenToCanvasScale = canvasWidth / screenGuideW

        ctx.scale(scale * screenToCanvasScale, scale * screenToCanvasScale)
        ctx.translate(pan.x, pan.y)

        const guideRatio = screenGuideW / screenGuideH
        const imgRatio = imgWidth / imgHeight

        let initialRenderW = screenGuideW
        let initialRenderH = screenGuideH

        if (imgRatio > guideRatio) {
          initialRenderW = screenGuideW
          initialRenderH = screenGuideW / imgRatio
        } else {
          initialRenderH = screenGuideH
          initialRenderW = screenGuideH * imgRatio
        }

        ctx.drawImage(img, -initialRenderW / 2, -initialRenderH / 2, initialRenderW, initialRenderH)
      } else {
        ctx.scale(scale, scale)
        ctx.translate(pan.x, pan.y)
        ctx.drawImage(img, -canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight)
      }

      ctx.restore()

      // Convertir a blob WebP ultraligero y nítido
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
        0.88
      )
    }
    img.src = capturedImage
  }

  const getFilterStyle = () => {
    if (filter === 'grayscale') return 'grayscale(100%) contrast(1.15) brightness(1.05)'
    if (filter === 'scan') return 'grayscale(100%) contrast(2.3) brightness(1.15)'
    return 'none'
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col justify-between bg-[#080b11] text-white overflow-hidden select-none touch-none">
      
      {/* -------------------- HEADER DEL MODAL -------------------- */}
      <div className="bg-[#0f141f]/90 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-2">
          <Sparkles className="text-emerald-400 w-4 h-4 animate-pulse" />
          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-wider">
              {capturedImage ? 'Encuadrar y Ajustar Documento' : 'Escáner en Vivo'}
            </h3>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5">{documentLabel}</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          disabled={processing}
          className="p-2 hover:bg-white/10 text-gray-400 hover:text-white rounded-full transition-all border border-white/5 disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>

      {/* -------------------- CONTENIDO PRINCIPAL -------------------- */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        
        {capturedImage === null ? (
          /* PANTALLA 1: Captura de cámara en vivo */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            {cameraStream ? (
              /* Feed de video con líneas guía punteadas */
              <div className="relative w-full max-w-sm aspect-[8.5/11] max-h-[60vh] border-2 border-dashed border-emerald-500/80 bg-black/40 overflow-hidden rounded-2xl flex items-center justify-center shadow-2xl backdrop-blur-[1px]">
                
                {/* Esquinas guía visuales tamaño carta */}
                <div 
                  ref={guideBoxRef}
                  className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center"
                >
                  <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
                  <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
                  
                  <span className="text-[9px] bg-emerald-600/90 text-white font-black px-2.5 py-1.5 rounded-full uppercase tracking-widest shadow-md border border-emerald-400/20 backdrop-blur-sm">
                    Alinea tu informe aquí
                  </span>
                </div>

                {/* Feed de video en vivo */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-1"
                />
              </div>
            ) : (
              /* Cargando / Fallback si falla la cámara en vivo */
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-sm mx-auto">
                <div className="w-24 h-24 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-3xl flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/10 animate-bounce">
                  <Camera size={42} />
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-white font-black text-lg uppercase tracking-wide">
                    {cameraError ? 'Subir Foto Directamente' : 'Iniciando Cámara Escáner...'}
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {cameraError || 'Cargando la cámara en vivo con guías tamaño carta en tiempo real.'}
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full">
                  <button
                    onClick={triggerNativeCamera}
                    disabled={processing}
                    className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 border border-emerald-500/20 active:scale-[0.98] disabled:opacity-50"
                  >
                    <ImageIcon size={16} />
                    Seleccionar Foto o Archivo
                  </button>
                  
                  {cameraError && (
                    <button
                      onClick={startCamera}
                      className="text-xs text-emerald-400 hover:underline mt-2 font-bold"
                    >
                      Reintentar Iniciar Cámara
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* PANTALLA 2: Editor interactivo de recortes y filtros */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pb-20">
            
            {/* Máscara oscura y guía del tamaño carta */}
            <div className="relative w-full max-w-sm aspect-[8.5/11] max-h-[60vh] border-2 border-dashed border-emerald-500/80 bg-black/60 overflow-hidden rounded-2xl flex items-center justify-center pointer-events-auto backdrop-blur-[1px] shadow-2xl">
              <div 
                ref={guideBoxRef}
                className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center"
              >
                {/* Esquinas guía visuales */}
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
                
                <span className="text-[9px] bg-emerald-600/90 text-white font-black px-2.5 py-1.5 rounded-full uppercase tracking-widest shadow-md border border-emerald-400/20 backdrop-blur-sm">
                  Alinea la hoja carta aquí
                </span>
              </div>

              {/* Imagen interactiva arrastrable, rotable y con zoom */}
              <img
                src={capturedImage}
                alt="Documento capturado"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
                  transformOrigin: 'center center',
                  filter: getFilterStyle(),
                }}
                className="w-full h-full object-contain cursor-move touch-none select-none transition-transform duration-75"
                onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
                onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    handleStart(e.touches[0].clientX, e.touches[0].clientY)
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches.length === 1) {
                    handleMove(e.touches[0].clientX, e.touches[0].clientY)
                  }
                }}
                onTouchEnd={handleEnd}
              />
            </div>

            <p className="text-[10px] text-gray-400 mt-4 font-bold uppercase tracking-wider">
              👆 Desliza para mover • Pellizca o usa la barra para ampliar
            </p>
          </div>
        )}

      </div>

      {/* -------------------- BOTONERAS DE CONTROL INFERIORES -------------------- */}
      {capturedImage === null && cameraStream && (
        <div className="bg-[#0f141f]/95 border-t border-white/5 p-6 flex flex-col items-center justify-center gap-4 z-20">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Línea discontinua = Tamaño Carta Oficial
          </p>
          
          <div className="flex items-center justify-between w-full max-w-xs px-6">
            {/* Botón de subir archivo alternativo */}
            <button
              onClick={triggerNativeCamera}
              className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 active:scale-95"
              title="Elegir de Galería"
            >
              <ImageIcon size={18} className="text-gray-400 hover:text-white" />
            </button>

            {/* Botón central de disparo en vivo */}
            <button
              onClick={capturePhoto}
              disabled={processing}
              className="w-16 h-16 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center transition-all border-4 border-emerald-500 shadow-2xl active:scale-95 disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full border-2 border-emerald-600 flex items-center justify-center">
                <Camera size={18} className="text-emerald-700 font-black" />
              </div>
            </button>

            {/* Espaciador de simetría */}
            <div className="w-12 h-12" />
          </div>
        </div>
      )}

      {capturedImage !== null && (
        <div className="bg-[#0f141f]/95 border-t border-white/5 p-5 space-y-4 z-20">
          
          {/* Controles de Zoom y Rotación */}
          <div className="flex items-center justify-between gap-6 max-w-sm mx-auto">
            {/* Rotar */}
            <button
              onClick={() => setRotation(r => (r + 90) % 360)}
              className="flex items-center gap-1.5 py-2 px-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5 active:scale-95"
            >
              <RotateCw size={14} className="text-emerald-400" />
              Rotar 90°
            </button>

            {/* Slider de Zoom */}
            <div className="flex-1 flex items-center gap-2">
              <ZoomIn size={14} className="text-gray-400" />
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{scale.toFixed(2)}x</span>
            </div>
          </div>

          {/* Selector de Filtros de Escaneo */}
          <div className="flex items-center justify-center gap-2 max-w-sm mx-auto bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setFilter('color')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'color' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Original
            </button>
            <button
              onClick={() => setFilter('grayscale')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'grayscale' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Escala Grises
            </button>
            <button
              onClick={() => setFilter('scan')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'scan' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Escáner B&N
            </button>
          </div>

          {/* Botones de Guardar / Reintentar */}
          <div className="flex items-center gap-3 max-w-sm mx-auto">
            <button
              disabled={processing}
              onClick={() => {
                setCapturedImage(null)
                // Reiniciar la cámara en vivo de forma asíncrona
                setTimeout(() => {
                  startCamera()
                }, 150)
              }}
              className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-white/5 disabled:opacity-50 active:scale-95"
            >
              Reintentar
            </button>

            <button
              disabled={processing}
              onClick={handleConfirmCrop}
              className="flex-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/40 flex items-center justify-center gap-2 border border-emerald-500/20 disabled:opacity-50 active:scale-95"
            >
              {processing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Confirmar Escaneo
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Input de archivos/galería nativo oculto */}
      <input 
        id="camera-input"
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Canvas de renderizado oculto */}
      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  )
}
