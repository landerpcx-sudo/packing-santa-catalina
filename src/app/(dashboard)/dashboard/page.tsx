'use client'

import { useAuth } from '@/context/AuthContext'
import { ROLE_DISPLAY_NAMES, Role, STATE_COLORS, STATE_LABELS, DocumentState } from '@/lib/constants'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useToast } from '@/components/layout/Toast'
import {
  Package,
  Thermometer,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Loader2,
  Cloud,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'

// ─── Hook: Animación de conteo numérico (Mejora #5) ─────────────────────────
function useCountUp(target: number | string, duration = 900): string {
  const [display, setDisplay] = useState('0')
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const num = parseInt(String(target), 10)
    if (isNaN(num) || String(target) === '—') {
      setDisplay(String(target))
      return
    }
    let startTime: number | null = null
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * num).toString())
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration])

  return display
}

// Sombras y resplandores (glows) interactivos premium por color de acento
const ACCENT_GLOWS: Record<string, string> = {
  'text-emerald-500': '0 20px 25px -5px rgba(16, 185, 129, 0.08), 0 0 15px rgba(16, 185, 129, 0.04)',
  'text-amber-500':   '0 20px 25px -5px rgba(245, 158, 11, 0.08), 0 0 15px rgba(245, 158, 11, 0.04)',
  'text-red-500':     '0 20px 25px -5px rgba(239, 68, 68, 0.08), 0 0 15px rgba(239, 68, 68, 0.04)',
  'text-slate-500':   '0 20px 25px -5px rgba(148, 163, 184, 0.08), 0 0 15px rgba(148, 163, 184, 0.04)',
  'text-orange-500':  '0 20px 25px -5px rgba(249, 115, 22, 0.08), 0 0 15px rgba(249, 115, 22, 0.04)',
  'text-purple-500':  '0 20px 25px -5px rgba(168, 85, 247, 0.08), 0 0 15px rgba(168, 85, 247, 0.04)',
  'text-sky-500':     '0 20px 25px -5px rgba(14, 165, 233, 0.08), 0 0 15px rgba(14, 165, 233, 0.04)',
  'text-indigo-500':  '0 20px 25px -5px rgba(99, 102, 241, 0.08), 0 0 15px rgba(99, 102, 241, 0.04)',
}

// Paleta de micro-gradientes por color de acento.
// Se combinan con el sheen vertical para que la tarjeta no se vea plana.
const ACCENT_GRADIENTS: Record<string, string> = {
  'text-emerald-500': 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-amber-500':   'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-red-500':     'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-slate-500':   'linear-gradient(135deg, rgba(148,163,184,0.08) 0%, transparent 55%), var(--card-sheen)',
  'text-orange-500':  'linear-gradient(135deg, rgba(249,115,22,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-purple-500':  'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-sky-500':     'linear-gradient(135deg, rgba(14,165,233,0.10) 0%, transparent 55%), var(--card-sheen)',
  'text-indigo-500':  'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, transparent 55%), var(--card-sheen)',
}

// Relieve del contenedor del ícono: gradiente del acento + luz interna superior
const ACCENT_ICON_STYLE: Record<string, React.CSSProperties> = {
  'text-emerald-500': { background: 'linear-gradient(145deg, rgba(16,185,129,0.28), rgba(16,185,129,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(16,185,129,0.5)' },
  'text-amber-500':   { background: 'linear-gradient(145deg, rgba(245,158,11,0.28), rgba(245,158,11,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(245,158,11,0.5)' },
  'text-red-500':     { background: 'linear-gradient(145deg, rgba(239,68,68,0.28), rgba(239,68,68,0.07))',    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(239,68,68,0.5)' },
  'text-slate-500':   { background: 'linear-gradient(145deg, rgba(148,163,184,0.24), rgba(148,163,184,0.06))',boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(148,163,184,0.4)' },
  'text-orange-500':  { background: 'linear-gradient(145deg, rgba(249,115,22,0.28), rgba(249,115,22,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(249,115,22,0.5)' },
  'text-purple-500':  { background: 'linear-gradient(145deg, rgba(168,85,247,0.28), rgba(168,85,247,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(168,85,247,0.5)' },
  'text-sky-500':     { background: 'linear-gradient(145deg, rgba(14,165,233,0.28), rgba(14,165,233,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(14,165,233,0.5)' },
  'text-indigo-500':  { background: 'linear-gradient(145deg, rgba(99,102,241,0.28), rgba(99,102,241,0.07))',  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 16px -8px rgba(99,102,241,0.5)' },
}

// Barras de acento para encabezados de sección
const ACCENT_BARS: Record<string, string> = {
  'text-emerald-500': 'linear-gradient(180deg, #34d399, #059669)',
  'text-indigo-500':  'linear-gradient(180deg, #818cf8, #4f46e5)',
  'text-sky-500':     'linear-gradient(180deg, #38bdf8, #0284c7)',
}

function StatCard({
  title, value, subtitle, icon: Icon, accent, loading = false, status = 'normal',
}: {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  accent: string
  loading?: boolean
  status?: 'success' | 'warning' | 'normal'
}) {
  const animated = useCountUp(loading ? '—' : value)
  const gradient = ACCENT_GRADIENTS[accent] || 'none'
  const glow = ACCENT_GLOWS[accent] || 'none'
  const isNormal = status === 'normal'
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={`card-frost hover-lift p-6 flex items-start gap-5 cursor-pointer group ${
        status === 'success' ? 'stat-card-success' : status === 'warning' ? 'stat-card-warning' : ''
      }`}
      style={{
        backgroundColor: isNormal ? 'var(--bg-card)' : undefined,
        border: isNormal ? (isHovered ? `1px solid var(--text-link)` : '1px solid var(--border)') : undefined,
        backgroundImage: isNormal ? gradient : undefined,
        // En reposo deja actuar la sombra de elevación del card-frost;
        // al hacer hover suma el glow del acento a la sombra elevada.
        boxShadow: isHovered
          ? (glow !== 'none' ? `${glow}, var(--shadow-card-hover)` : 'var(--shadow-card-hover)')
          : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`p-3 rounded-2xl flex-shrink-0 transition-all duration-300 group-hover:scale-110 ${
          isNormal ? accent : 'stat-icon-bg'
        }`}
        style={isNormal ? (ACCENT_ICON_STYLE[accent] ?? { backgroundColor: 'var(--bg-badge)' }) : undefined}
      >
        <Icon size={22} className={`transition-all duration-300 ${isNormal ? accent : 'stat-icon'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`text-[11px] font-extrabold uppercase tracking-wider ${isNormal ? '' : 'stat-title'}`}
            style={isNormal ? { color: 'var(--text-secondary)' } : undefined}
          >
            {title}
          </p>
          {!loading && <span className="stat-live-dot" />}
        </div>
        {loading ? (
          <div className="h-8 w-20 skeleton-shimmer mt-2" />
        ) : (
          <p className={`text-3xl font-black mt-1 tracking-tight tabular-nums ${isNormal ? accent : 'stat-value'}`}>
            {animated}
          </p>
        )}
        {subtitle ? (
          <p className="text-[11px] font-semibold mt-1 transition-colors duration-200 group-hover:text-white" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        ) : (
          <span className="opacity-0 select-none text-[11px] font-semibold mt-1 block">&nbsp;</span>
        )}
      </div>
    </div>
  )
}



// ─── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span
        className="w-1 h-5 rounded-full flex-shrink-0"
        style={{ background: ACCENT_BARS[accent] ?? 'var(--text-muted)' }}
      />
      <Icon size={18} className={accent} />
      <h2 className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>{label}</h2>
      <div className="section-heading-line" />
    </div>
  )
}

// ─── StatusBadge ────────────────────────────────────────────────────────────
export function StatusBadge({ state }: { state: string }) {
  const colorClass = STATE_COLORS[state as DocumentState] || 'bg-gray-100 text-gray-800 border-gray-300'
  const label = STATE_LABELS[state as DocumentState] || state
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {label}
    </span>
  )
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function DashboardPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [googleConnected, setGoogleConnected] = useState(false)
  const [hoveredDashboardPoint, setHoveredDashboardPoint] = useState<any | null>(null)

  // SWR con refresco silencioso cada 60s. Una sola llamada agregada:
  // los conteos se hacen en SQL y la respuesta pesa ~1 KB.
  const { data: statsData, isLoading: loading } = useSWR('/api/dashboard/stats', fetcher, { refreshInterval: 60_000, dedupingInterval: 30_000 })
  const { data: driveStatus }                   = useSWR('/api/settings/drive-status', fetcher, { revalidateOnFocus: false })

  const lotesStats = statsData?.data?.lotes        ?? { total: 0, completos: 0, incompletos: 0, observados: 0, recPending: 0, qualPending: 0, procPending: 0 }
  const despStats  = statsData?.data?.despachos    ?? { total: 0, completos: 0, pendientes: 0, atrasados: 0 }
  const tempsRaw   = statsData?.data?.temperaturas ?? { total: 0, pendientes: 0, atrasados: 0, todayReport: null }
  const todayReport = tempsRaw.todayReport

  const tempStats = {
    ...tempsRaw,
    todayReportStatus: todayReport ? (todayReport.temperature_value ? `${todayReport.temperature_value}°C` : 'Subido') : 'Sin datos',
  }

  // --- Estados dinámicos para los semáforos maestros (tarjetas de Total) ---
  const lotesStatus: 'success' | 'warning' | 'normal' =
    lotesStats.total === 0 ? 'normal' :
    (lotesStats.total === lotesStats.completos && lotesStats.incompletos === 0 && lotesStats.observados === 0 && lotesStats.recPending === 0 && lotesStats.qualPending === 0 && lotesStats.procPending === 0) ? 'success' : 'warning'

  const despStatus: 'success' | 'warning' | 'normal' =
    despStats.total === 0 ? 'normal' :
    (despStats.total === despStats.completos && despStats.pendientes === 0 && despStats.atrasados === 0) ? 'success' : 'warning'

  const tempHoySinDatos = tempStats.todayReportStatus === 'Sin datos'

  // Omitir el requerimiento del reporte de hoy para el semáforo verde en fin de semana (Sábado = 6, Domingo = 0)
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6

  const tempStatus: 'success' | 'warning' | 'normal' =
    tempStats.total === 0 ? 'normal' :
    (tempStats.pendientes === 0 && tempStats.atrasados === 0 && (!tempHoySinDatos || isWeekend)) ? 'success' : 'warning'


  useEffect(() => {
    if (driveStatus?.connected) setGoogleConnected(true)
  }, [driveStatus])




  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const error     = searchParams.get('google_error')
    const connected = searchParams.get('google_connected')
    if (error) {
      toast.error(`Error al conectar con Google Drive: ${decodeURIComponent(error)}`)
      window.history.replaceState({}, document.title, '/dashboard')
    } else if (connected === 'true') {
      toast.success('¡Sincronización con Google Drive activada correctamente!')
      window.history.replaceState({}, document.title, '/dashboard')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Últimos 7 reportes con valor de temperatura (ya vienen ordenados del API)
  const miniChartData = statsData?.data?.miniChart ?? []

  return (
    <div className="space-y-8">

      {/* Banner Drive */}
      {user?.role === 'admin' && (
        <section
          className="card-frost relative overflow-hidden p-8 shadow-xl transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(30, 64, 175, 0.05) 50%, rgba(16, 185, 129, 0.03) 100%)',
          }}
        >
          {/* Orbs decorativos */}
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[80px] -z-10 pointer-events-none" />
          {/* Inner top light */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-start gap-6">
              <div className={`p-4 rounded-2xl flex-shrink-0 transition-transform duration-300 hover:scale-105 ${googleConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                <Cloud className="w-10 h-10 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Sincronización con Google Drive
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {googleConnected
                    ? 'Los archivos están siendo respaldados automáticamente en tu almacenamiento de 5TB. Máxima seguridad y acceso permanente desde la nube.'
                    : 'Asegura tus documentos vinculando tu cuenta de Google Drive. Evita límites de espacio y mantén respaldos automatizados.'}
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <Link 
                    href="/configuracion" 
                    className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 group/link"
                  >
                    Gestionar en Configuración 
                    <ChevronRight size={13} className="transition-transform duration-200 group-hover/link:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 min-w-[240px] justify-end">
              {googleConnected ? (
                <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-3 text-emerald-400 font-bold bg-emerald-500/10 px-5 py-3 rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 select-none w-full justify-center sm:justify-start">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Sincronización Activa
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm('¿Estás seguro de que deseas desactivar la sincronización?')) {
                        try {
                          const res = await fetch('/api/settings/drive-disconnect', { method: 'DELETE' });
                          if (!res.ok) throw new Error(await res.text());
                          setGoogleConnected(false);
                        } catch (e: any) {
                          alert('Error: ' + e.message);
                        }
                      }
                    }}
                    className="w-full text-center text-xs text-red-400/90 hover:text-red-300 font-bold transition-all px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 cursor-pointer shadow-sm"
                  >
                    Desactivar temporalmente
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { window.location.href = '/api/auth/google'; }}
                  className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl hover:from-blue-500 hover:to-indigo-500 transition-all hover:scale-[1.02] shadow-xl shadow-indigo-600/20 cursor-pointer"
                >
                  <Cloud size={18} />
                  Activar Sincronización
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Saludo */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Bienvenido, {user?.displayName} 👋
        </h1>
        <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {user?.role ? ROLE_DISPLAY_NAMES[user.role as Role] : ''} · Packing Santa Catalina
          <span className="capitalize" style={{ color: 'var(--text-muted)' }}>
            {' '}· {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </p>
      </div>

      {/* ─── Lotes ─── */}
      <section>
        <SectionHeader icon={Package} label="Lotes / Recepción" accent="text-emerald-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total lotes"   value={lotesStats.total}      loading={loading} icon={Package}      accent="text-slate-500" status={lotesStatus} />
          <StatCard title="Incompletos"   value={lotesStats.incompletos}loading={loading} icon={Clock}        accent="text-amber-500" />
          <StatCard title="Observados"    value={lotesStats.observados} loading={loading} icon={AlertTriangle}accent="text-red-500" />
          <StatCard title="Completos"     value={lotesStats.completos}  loading={loading} icon={CheckCircle2} accent="text-emerald-500" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <StatCard title="Recepción pendiente" value={lotesStats.recPending}  loading={loading} icon={AlertCircle} accent="text-orange-500" subtitle="Plazo 24h" />
          <StatCard title="Calidad pendiente"   value={lotesStats.qualPending} loading={loading} icon={AlertCircle} accent="text-orange-500" subtitle="Plazo 24h" />
          <StatCard title="Proceso pendiente"   value={lotesStats.procPending} loading={loading} icon={AlertTriangle} accent="text-purple-500" subtitle="Plazo 7 días" />
        </div>
      </section>

      {/* ─── Despachos ─── */}
      <section>
        <SectionHeader icon={Truck} label="Despachos" accent="text-indigo-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total despachos" value={despStats.total}      loading={loading} icon={Truck}        accent="text-slate-500" status={despStatus} />
          <StatCard title="Pendientes"       value={despStats.pendientes} loading={loading} icon={Clock}        accent="text-amber-500" />
          <StatCard title="Atrasados"        value={despStats.atrasados}  loading={loading} icon={XCircle}      accent="text-red-500" />
          <StatCard title="Completos"        value={despStats.completos}  loading={loading} icon={CheckCircle2} accent="text-emerald-500" />
        </div>
      </section>

      {/* ─── Temperaturas ─── */}
      <section>
        <SectionHeader icon={Thermometer} label="Temperaturas" accent="text-sky-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total reportes" value={tempStats.total}      loading={loading} icon={TrendingUp} accent="text-sky-500" status={tempStatus} />
          <StatCard title="Pendientes"     value={tempStats.pendientes} loading={loading} icon={Clock}      accent="text-amber-500" />
          <StatCard title="Atrasados"      value={tempStats.atrasados}  loading={loading} icon={XCircle}    accent="text-red-500" />
          {/* Card especial: reporte hoy */}
          <div
            className="card-frost hover-lift p-6 col-span-2 md:col-span-1 cursor-pointer hover:!border-sky-500"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Reporte hoy
            </p>
            {loading ? (
              <div className="h-8 w-24 skeleton-shimmer mt-2" />
            ) : (
              <p className={`text-3xl font-black mt-1 tracking-tight ${tempStats.todayReportStatus === 'Sin datos' ? 'text-red-400' : 'text-emerald-400'}`}>
                {tempStats.todayReportStatus}
              </p>
            )}
            <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>
              {tempStats.todayReportStatus === 'Sin datos' ? 'Falta registrar el control' : 'Control registrado'}
            </p>
          </div>
        </div>

        {/* Mini Gráfico de Tendencias en Dashboard */}
        {!loading && miniChartData.length >= 2 && (
          <div
            className="mt-4 card-frost p-5 transition-all duration-300 relative"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="text-sky-400 w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/80">Tendencia Reciente (Cámaras)</h3>
              </div>
              <span className="text-[9px] font-black text-gray-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase tracking-widest">
                Últimas {miniChartData.length} mediciones
              </span>
            </div>

            <div className="relative">
              {/* SVG del Gráfico de Área */}
              {(() => {
                const width = 600
                const height = 120
                const paddingLeft = 40
                const paddingRight = 20
                const paddingTop = 15
                const paddingBottom = 20
                const chartWidth = width - paddingLeft - paddingRight
                const chartHeight = height - paddingTop - paddingBottom

                const vals = miniChartData.map((d: any) => d.temperature_value)
                let min = Math.min(...vals)
                let max = Math.max(...vals)
                if (min === max) {
                  min -= 1
                  max += 1
                } else {
                  const range = max - min
                  min -= range * 0.1
                  max += range * 0.1
                }

                const points: any[] = []
                let linePath = ''
                let areaPath = ''

                miniChartData.forEach((d: any, i: number) => {
                  const x = paddingLeft + (i / (miniChartData.length - 1)) * chartWidth
                  const y = paddingTop + chartHeight - ((d.temperature_value - min) / (max - min)) * chartHeight
                  points.push({ x, y, data: d })

                  if (i === 0) {
                    linePath += `M ${x} ${y}`
                    areaPath += `M ${x} ${paddingTop + chartHeight} L ${x} ${y}`
                  } else {
                    linePath += ` L ${x} ${y}`
                    areaPath += ` L ${x} ${y}`
                  }
                })
                areaPath += ` L ${points[points.length - 1].x} ${paddingTop + chartHeight} Z`

                return (
                  <div className="overflow-x-auto">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[500px] overflow-visible select-none" onMouseLeave={() => setHoveredDashboardPoint(null)}>
                      <defs>
                        <linearGradient id="dashAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                        </linearGradient>
                        <feDropShadow id="dashGlow" dx="0" dy="2" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.25" />
                      </defs>

                      {/* Grilla horizontal simple */}
                      {[min, (min + max) / 2, max].map((val, idx) => {
                        const y = paddingTop + chartHeight - ((val - min) / (max - min)) * chartHeight
                        return (
                          <g key={idx}>
                            <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255, 255, 255, 0.03)" strokeDasharray="3 3" />
                            <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fill="#64748b" className="text-[8px] font-bold">{val.toFixed(1)}°C</text>
                          </g>
                        )
                      })}

                      {/* Relleno área */}
                      <path d={areaPath} fill="url(#dashAreaGrad)" />

                      {/* Línea principal */}
                      <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#dashGlow)" />

                      {/* Puntos interactivos */}
                      {points.map((pt, idx) => {
                        const isHovered = hoveredDashboardPoint?.data.id === pt.data.id
                        return (
                          <g key={idx}>
                            {isHovered && (
                              <circle cx={pt.x} cy={pt.y} r="8" fill="#38bdf8" fillOpacity="0.2" className="animate-ping" />
                            )}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? "4.5" : "3.5"}
                              fill={isHovered ? "#38bdf8" : "var(--bg-app)"}
                              stroke={isHovered ? "#ffffff" : "#38bdf8"}
                              strokeWidth={isHovered ? "2" : "1.5"}
                              className="transition-all duration-150 cursor-pointer"
                            />
                            {/* Área interactiva */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r="16"
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={(e) => {
                                const svgEl = e.currentTarget.ownerSVGElement
                                if (svgEl) {
                                  const rect = svgEl.getBoundingClientRect()
                                  const ratioX = rect.width / width
                                  const ratioY = rect.height / height
                                  setHoveredDashboardPoint({
                                    x: pt.x * ratioX,
                                    y: pt.y * ratioY,
                                    data: pt.data,
                                  })
                                }
                              }}
                            />
                          </g>
                        )
                      })}

                      {/* Eje X Etiquetas de fecha */}
                      {points.map((pt, idx) => {
                        const dateParts = pt.data.report_date.split('-')
                        const label = `${dateParts[2]}/${dateParts[1]}`
                        return (
                          <text key={idx} x={pt.x} y={height - 4} textAnchor="middle" fill="#64748b" className="text-[8px] font-black">{label}</text>
                        )
                      })}
                    </svg>
                  </div>
                )
              })()}

              {/* Tooltip flotante para el gráfico del dashboard */}
              {hoveredDashboardPoint && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${hoveredDashboardPoint.x}px`,
                    top: `${hoveredDashboardPoint.y - 75}px`,
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                  }}
                  className="bg-[#1e293b]/95 border border-sky-500/30 backdrop-blur-md rounded-xl p-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 z-20 w-36"
                >
                  <p className="text-[8px] font-black text-sky-400 uppercase tracking-widest leading-none mb-1">
                    {hoveredDashboardPoint.data.chamber || 'Cámara'}
                  </p>
                  <div className="text-base font-black text-white leading-none">
                    {hoveredDashboardPoint.data.temperature_value}°C
                  </div>
                  <p className="text-[7px] text-gray-500 font-bold leading-none mt-1">
                    {hoveredDashboardPoint.data.client || 'Temp. Ambiente'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Banner info inicial */}
      {!googleConnected && (
        <div className="card-frost p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg flex-shrink-0">
              <Loader2 size={20} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Sistema en configuración inicial
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Asegúrate de conectar Google Drive para poder procesar la recepción de documentos.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
