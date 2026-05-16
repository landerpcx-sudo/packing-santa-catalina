'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) router.push('/dashboard')
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(username, password)

    if (result.success) {
      router.push('/dashboard')
    } else {
      setError(result.error || 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-slate-900 flex items-center justify-center p-4">
      {/* Fondo con patrón sutil */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, #22c55e 0%, transparent 50%), radial-gradient(circle at 75% 75%, #7c3aed 0%, transparent 50%)'
        }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card principal */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8">
          
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Packing Santa Catalina"
                className="object-contain h-20 w-auto brightness-0 invert"
              />
            </div>
            <h1 className="text-white text-xl font-semibold tracking-wide">
              Sistema de Control Documental
            </h1>
            <p className="text-green-300/70 text-sm mt-1">
              Packing Santa Catalina
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-white/80 mb-2"
              >
                Usuario
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="jefe_frio, calidad, admin..."
                autoComplete="username"
                required
                className="
                  w-full px-4 py-3 rounded-xl
                  bg-white/10 border border-white/20
                  text-white placeholder-white/40
                  focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent
                  transition-all duration-200
                "
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white/80 mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="
                    w-full px-4 py-3 rounded-xl
                    bg-white/10 border border-white/20
                    text-white placeholder-white/40
                    focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent
                    transition-all duration-200
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3">
                <p className="text-red-300 text-sm text-center">{error}</p>
              </div>
            )}

            {/* Botón */}
            <button
              id="btn-login"
              type="submit"
              disabled={loading}
              className="
                w-full py-3 px-6 rounded-xl font-semibold text-white
                bg-gradient-to-r from-green-500 to-green-600
                hover:from-green-400 hover:to-green-500
                active:scale-[0.98]
                disabled:opacity-60 disabled:cursor-not-allowed
                shadow-lg shadow-green-500/25
                transition-all duration-200
                flex items-center justify-center gap-3
              "
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verificando...
                </>
              ) : (
                'Ingresar al sistema'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-white/30 text-xs mt-6">
            Solo personal autorizado · Packing Santa Catalina © 2026
          </p>
        </div>

        {/* Decoración inferior */}
        <div className="text-center mt-6">
          <p className="text-white/20 text-xs">
            Sistema de trazabilidad documental v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
