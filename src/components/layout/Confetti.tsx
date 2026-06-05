'use client'

import { useEffect, useRef, useState } from 'react'

interface Particle {
  x: number
  y: number
  size: number
  color: string
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

const COLORS = [
  '#10b981', // emerald
  '#34d399', // green-400
  '#3b82f6', // blue-500
  '#60a5fa', // blue-400
  '#fbbf24', // amber-400
  '#f59e0b', // amber-500
  '#a855f7', // purple-500
]

export default function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [active, setActive] = useState(false)
  const particlesRef = useRef<Particle[]>([])
  const animationFrameRef = useRef<number | null>(null)

  const initConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = []
    const particleCount = 100

    for (let i = 0; i < particleCount; i++) {
      // Disparar desde abajo, a la izquierda y derecha para simular cañones
      const fromLeft = Math.random() > 0.5
      particles.push({
        x: fromLeft ? 0 : canvas.width,
        y: canvas.height * 0.8,
        size: Math.random() * 8 + 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 12 + 6),
        speedY: -(Math.random() * 16 + 10),
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 10 - 5,
        opacity: 1,
      })
    }

    particlesRef.current = particles
    setActive(true)
  }

  useEffect(() => {
    const handleTrigger = () => {
      initConfetti()
    }

    window.addEventListener('trigger-confetti', handleTrigger)
    return () => {
      window.removeEventListener('trigger-confetti', handleTrigger)
    }
  }, [])

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const update = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const particles = particlesRef.current
      let activeParticles = false

      particles.forEach((p) => {
        if (p.opacity <= 0) return

        // Aplicar física
        p.x += p.speedX
        p.y += p.speedY
        p.speedY += 0.45 // gravedad
        p.speedX *= 0.98 // fricción aire
        p.rotation += p.rotationSpeed

        // Desvanecimiento suave en el suelo
        if (p.y > canvas.height * 0.9) {
          p.opacity -= 0.02
        }

        if (p.opacity > 0) {
          activeParticles = true
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate((p.rotation * Math.PI) / 180)
          ctx.fillStyle = p.color
          ctx.globalAlpha = p.opacity
          
          // Dibujar rectángulos simulando confeti de papel
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          ctx.restore()
        }
      })

      if (activeParticles) {
        animationFrameRef.current = requestAnimationFrame(update)
      } else {
        setActive(false)
      }
    }

    animationFrameRef.current = requestAnimationFrame(update)

    // Redimensionar canvas al cambiar tamaño de pantalla
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth
        canvasRef.current.height = window.innerHeight
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [active])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[100000] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  )
}

// Función utilitaria helper para disparar el evento
export function triggerConfetti() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trigger-confetti'))
  }
}
