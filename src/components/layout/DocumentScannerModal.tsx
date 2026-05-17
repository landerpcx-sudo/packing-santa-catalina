'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X, Check, Undo, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

interface DocumentScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanComplete: (scannedFile: File) => void
  documentLabel: string
  lotCodeOrDispatchId: string
}

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
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const isRequestingRef = useRef<boolean>(false)
  const isMountedRef = useRef<boolean>(true)

  useEffect(() => {
    setMounted(true)
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setStream(null)
  }, [])

  const startLiveCamera = useCallback(async () => {
    if (isRequestingRef.current) return
    if (streamRef.current) return

    isRequestingRef.current = true
    setCameraError(null)

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      })

      if (!isMountedRef.current) {
        mediaStream.getTracks().forEach(track => track.stop())
        isRequestingRef.current = false
        return
      }

      streamRef.current = mediaStream
      setStream(mediaStream)
      setUseLiveCamera(true)

      if (videoElementRef.current) {
        videoElementRef.current.srcObject = mediaStream
        videoElementRef.current.play().catch(e => {
          console.warn("Auto-play warning:", e)
        })
      }
    } catch (err) {
      if (!isMountedRef.current) return
      
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        })

        if (!isMountedRef.current) {
          fallbackStream.getTracks().forEach(track => track.stop())
          isRequestingRef.current = false
          return
        }

        streamRef.current = fallbackStream
        setStream(fallbackStream)
        setUseLiveCamera(true)

        if (videoElementRef.current) {
          videoElementRef.current.srcObject = fallbackStream
          videoElementRef.current.play().catch(e => console.warn(e))
        }
      } catch (fallbackErr) {
        if (!isMountedRef.current) return
        setCameraError('No pudimos iniciar el escáner WebRTC. Puedes usar tu cámara nativa.')
        setUseLiveCamera(false)
      }
    } finally {
      isRequestingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setProcessing(false)
      setCameraError(null)
      setUseLiveCamera(true)
      startLiveCamera()
    } else {
      document.body.style.overflow = ''
      stopLiveCamera()
      isRequestingRef.current = false
    }

    return () => {
      document.body.style.overflow = ''
      stopLiveCamera()
      isRequestingRef.current = false
    }
  }, [isOpen, startLiveCamera, stopLiveCamera])

  if (!isOpen || !mounted) return null

  const triggerNativeCamera = () => {
    fileInputRef.current?.click()
  }

  // Decodificación asíncrona para evitar que la pestaña se congele en celulares al cargar fotos pesadas de la cámara nativa
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setProcessing(true)

    // Dar tiempo al DOM para mostrar el spinner "Procesando" antes de bloquear el hilo
    setTimeout(async () => {
      try {
        let imgWidth = 0
        let imgHeight = 0
        let drawable: CanvasImageSource | null = null
        let objectUrl = ''

        // Intentar usar decodificador nativo asíncrono (No bloquea la pestaña)
        if ('createImageBitmap' in window) {
          const bmp = await createImageBitmap(file)
          imgWidth = bmp.width
          imgHeight = bmp.height
          drawable = bmp
        } else {
          // Fallback síncrono si el navegador no soporta createImageBitmap
          objectUrl = URL.createObjectURL(file)
          await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
              imgWidth = img.naturalWidth
              imgHeight = img.naturalHeight
              drawable = img
              resolve(null)
            }
            img.onerror = reject
            img.src = objectUrl
          })
        }

        if (!drawable) throw new Error("No se pudo procesar")

        const maxDimension = 1200
        let finalWidth = imgWidth
        let finalHeight = imgHeight
        
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
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, finalWidth, finalHeight)
          ctx.drawImage(drawable, 0, 0, finalWidth, finalHeight)
        }

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
            if (objectUrl) URL.revokeObjectURL(objectUrl)
            if (drawable && 'close' in drawable && typeof drawable.close === 'function') drawable.close()
          },
          'image/webp',
          0.80
        )
      } catch (err) {
        console.error(err)
        alert('Error al cargar la imagen. Intenta de nuevo.')
        setProcessing(false)
      }
    }, 50) // 50ms es suficiente para que el navegador pinte el estado processing=true
  }

  const captureLiveFrame = () => {
    const video = videoElementRef.current
    const canvas = canvasRef.current
    const guideBox = guideBoxRef.current
    if (!video || !canvas || !guideBox) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let actualVideoWidth = video.videoWidth
    let actualVideoHeight = video.videoHeight

    if (!actualVideoWidth || !actualVideoHeight) {
      alert("Espera a que la cámara enfoque correctamente.")
      return
    }

    setProcessing(true)

    // Detener asíncronamente para que no trabe el render del "procesando"
    setTimeout(() => {
      const videoRect = video.getBoundingClientRect()
      const guideRect = guideBox.getBoundingClientRect()

      const isPortraitScreen = videoRect.height > videoRect.width
      const isLandscapeVideo = actualVideoWidth > actualVideoHeight

      if (isPortraitScreen && isLandscapeVideo) {
        actualVideoWidth = video.videoHeight
        actualVideoHeight = video.videoWidth
      }

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

      stopLiveCamera()

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
        0.80 
      )
    }, 50)
  }

  return createPortal(
    <div 
      className="fixed z-[99999] bg-black overflow-hidden select-none touch-none text-white"
      style={{ 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100dvh' 
      }}
    >
      {/* 
        Video en el fondo absoluto. 
        Mantiene object-cover para llenar la pantalla.
      */}
      <video 
        ref={videoElementRef}
        autoPlay 
        playsInline 
        muted 
        onLoadedMetadata={(e) => {
          e.currentTarget.play().catch(err => {
            console.warn("Auto-play requirió intervención:", err)
          })
        }}
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Capa de interfaz: Flexbox en columna para distribuir espacios perfectamente */}
      <div className="relative z-10 w-full h-full flex flex-col pointer-events-none">
        
        {/* HEADER (No flexiona, ocupa su espacio) */}
        <div className="flex-none bg-gradient-to-b from-black/80 to-transparent p-5 pt-8 flex items-start justify-between pointer-events-auto">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Sparkles className="text-emerald-400 w-4 h-4 animate-pulse" />
              Escáner Móvil
            </h3>
            <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest mt-0.5">{documentLabel}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md border border-white/10 transition-all pointer-events-auto"
            disabled={processing}
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENIDO CENTRAL (Se expande para ocupar todo el espacio restante) */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          
          {/* Pantalla de Carga WebRTC */}
          {useLiveCamera && !stream && (
            <div className="flex flex-col items-center justify-center space-y-4 bg-black/50 p-6 rounded-2xl backdrop-blur-sm border border-white/10">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="font-bold text-sm">Encendiendo Cámara...</p>
            </div>
          )}

          {/* Fallback de error o sin cámara */}
          {(!useLiveCamera || (!stream && cameraError)) && (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-[#0d121f]/90 backdrop-blur-md space-y-6 rounded-3xl border border-white/10 pointer-events-auto max-w-sm w-full shadow-2xl">
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/5 animate-pulse">
                <Camera size={38} />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-base text-white">Escanear con Cámara</h4>
                <p className="text-xs text-gray-400">
                  Toma una foto de tu reporte. El sistema la procesará automáticamente.
                </p>
              </div>

              {cameraError && (
                <div className="flex items-start gap-2 w-full p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-[10px] font-bold text-left uppercase">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}

              <button
                onClick={triggerNativeCamera}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 border border-emerald-500/20"
              >
                <Camera size={18} />
                Abrir Cámara
              </button>
            </div>
          )}

          {/* Dotted Grid (Solo si la cámara está activa) */}
          {useLiveCamera && stream && (
            <div 
              ref={guideBoxRef}
              className="w-full max-w-sm aspect-[8.5/11] max-h-[65vh] border-2 border-dashed border-emerald-400/80 bg-emerald-400/5 rounded-2xl flex flex-col items-center justify-center relative shadow-[0_0_0_4000px_rgba(0,0,0,0.65)]"
            >
              <div className="absolute inset-0 border border-emerald-500/30 rounded-2xl" />
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl" />
              
              <span className="text-[10px] bg-emerald-600/95 text-white font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-xl border border-emerald-500/20 backdrop-blur-sm absolute -bottom-4">
                Alinea Hoja Carta
              </span>
            </div>
          )}
        </div>

        {/* FOOTER BOTONERA (No flexiona, ocupa su espacio inferior) */}
        {useLiveCamera && stream && (
          <div className="flex-none bg-gradient-to-t from-black/90 via-black/60 to-transparent px-6 pb-10 pt-12 flex items-center justify-center gap-3 pointer-events-auto">
            <button
              disabled={processing}
              onClick={() => {
                stopLiveCamera()
                setUseLiveCamera(false)
                triggerNativeCamera()
              }}
              className="py-4 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-bold uppercase transition-all backdrop-blur-md border border-white/15 shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> Nativa
            </button>
            <button
              disabled={processing}
              onClick={captureLiveFrame}
              className="flex-1 py-4 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/40 flex items-center justify-center gap-2 border border-emerald-500/20 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Procesando
                </>
              ) : (
                <>
                  <Camera size={18} /> Capturar Foto
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  )
}
