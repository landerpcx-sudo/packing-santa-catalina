'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Eye, EyeOff, ShieldCheck, Leaf, Thermometer, Package, Truck, ArrowRight, Lock } from 'lucide-react'

// Animación de fondo: partículas flotantes
const FEATURES = [
  { icon: Package,     label: 'Control de Lotes',      desc: 'Trazabilidad completa por lote de fruta' },
  { icon: Thermometer, label: 'Temperaturas',           desc: 'Monitoreo de cadena de frío' },
  { icon: Truck,       label: 'Despachos',             desc: 'Seguimiento de envíos en tiempo real' },
  { icon: ShieldCheck, label: 'Auditoría Completa',    desc: 'Historial de versiones y validaciones' },
]

export default function LoginPage() {
  const [username, setUsername]       = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [focusedField, setFocusedField] = useState<'user' | 'pass' | null>(null)
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
      setError(result.error || 'Credenciales incorrectas')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ backgroundColor: '#010c1a' }}>

      {/* ── Panel izquierdo: Branding ────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{
          background: 'linear-gradient(135deg, #011a08 0%, #012210 40%, #010c1a 100%)',
        }}
      >
        {/* Gradiente decorativo */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background:
            'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(16,185,129,0.18) 0%, transparent 65%),' +
            'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(99,102,241,0.12) 0%, transparent 55%)',
        }} />

        {/* Líneas de grid sutil */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Packing Santa Catalina" className="h-12 w-auto brightness-0 invert" />
          </div>
          <p className="text-emerald-400/60 text-sm font-medium tracking-wider uppercase">
            Control Documental · v1.0
          </p>
        </div>

        {/* Headline central */}
        <div className="relative z-10 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
              <Leaf className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Temporada {new Date().getFullYear()}</span>
            </div>
            <h1 className="text-5xl font-black text-white leading-tight tracking-tighter">
              Trazabilidad<br />
              <span className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #34d399, #6ee7b7)' }}>
                Documental
              </span>
            </h1>
            <p className="text-slate-400 mt-4 text-lg leading-relaxed max-w-sm">
              Gestión integrada de lotes, temperaturas y despachos para el Packing Santa Catalina.
            </p>
          </div>

          {/* Feature list */}
          <div className="grid grid-cols-2 gap-3 mt-8">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 p-4 rounded-2xl border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <div className="p-2 bg-emerald-500/10 rounded-xl flex-shrink-0">
                  <Icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-bold leading-tight">{label}</p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-tight">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer izquierdo */}
        <div className="relative z-10">
          <p className="text-slate-600 text-xs">
            Solo personal autorizado · © {new Date().getFullYear()} Packing Santa Catalina
          </p>
        </div>
      </div>

      {/* ── Panel derecho: Formulario ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16 relative">
        {/* Fondo sutil derecho */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 50% at 100% 0%, rgba(99,102,241,0.06) 0%, transparent 60%)',
        }} />

        <div className="relative w-full max-w-md">

          {/* Logo móvil */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Packing Santa Catalina" className="h-14 w-auto brightness-0 invert mb-4" />
            <h1 className="text-white text-xl font-bold">Sistema de Control Documental</h1>
            <p className="text-emerald-400/60 text-sm">Packing Santa Catalina</p>
          </div>

          {/* Cabecera */}
          <div className="mb-10 hidden lg:block">
            <h2 className="text-3xl font-black text-white tracking-tight">Iniciar Sesión</h2>
            <p className="text-slate-400 mt-2">Ingresa tus credenciales para acceder al sistema.</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Usuario */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                Usuario
              </label>
              <div className={`relative transition-all duration-200 ${focusedField === 'user' ? 'scale-[1.01]' : ''}`}>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onFocus={() => setFocusedField('user')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="tu_usuario"
                  autoComplete="username"
                  required
                  className="w-full px-4 py-3.5 rounded-2xl text-white placeholder-slate-600 text-sm transition-all duration-200 outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${focusedField === 'user' ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: focusedField === 'user' ? '0 0 0 4px rgba(52,211,153,0.08)' : 'none',
                  }}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                Contraseña
              </label>
              <div className={`relative transition-all duration-200 ${focusedField === 'pass' ? 'scale-[1.01]' : ''}`}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3.5 pr-12 rounded-2xl text-white placeholder-slate-600 text-sm transition-all duration-200 outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${focusedField === 'pass' ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: focusedField === 'pass' ? '0 0 0 4px rgba(52,211,153,0.08)' : 'none',
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  borderColor: 'rgba(239,68,68,0.25)',
                }}
              >
                <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Botón submit */}
            <button
              id="btn-login"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{
                background: loading
                  ? 'rgba(52,211,153,0.4)'
                  : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                boxShadow: loading ? 'none' : '0 8px 32px rgba(16,185,129,0.25)',
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verificando...
                </>
              ) : (
                <>
                  Ingresar al sistema
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-slate-700 text-xs mt-8">
            Sistema de trazabilidad documental · Solo personal autorizado
          </p>
        </div>
      </div>
    </div>
  )
}
