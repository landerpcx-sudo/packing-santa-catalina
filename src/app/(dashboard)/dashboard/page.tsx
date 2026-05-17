'use client'

import { useAuth } from '@/context/AuthContext'
import { ROLE_DISPLAY_NAMES, Role, STATE_COLORS, STATE_LABELS, DocumentState } from '@/lib/constants'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
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

// ─── StatCard ───────────────────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon: Icon, accent, loading = false,
}: {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  accent: string   // clase Tailwind para el color del icono/valor, ej: "text-green-500"
  loading?: boolean
}) {
  return (
    <div
      className="rounded-3xl p-6 flex items-start gap-5 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5 backdrop-blur-md cursor-pointer group"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className={`p-3 rounded-2xl flex-shrink-0 ${accent} bg-opacity-10 transition-transform duration-300 group-hover:scale-110`}
        style={{ backgroundColor: 'var(--bg-badge)' }}
      >
        <Icon size={24} className={accent} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{title}</p>
        {loading ? (
          <div
            className="h-8 w-16 rounded-xl animate-pulse mt-2 bg-white/10"
          />
        ) : (
          <p className={`text-3xl font-black mt-1 tracking-tight ${accent}`}>{value}</p>
        )}
        {subtitle && (
          <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
      </div>
    </div>
  )
}

// ─── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} className={accent} />
      <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{label}</h2>
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
export default function DashboardPage() {
  const { user } = useAuth()
  const [googleConnected, setGoogleConnected] = useState(false)

  const [lotesStats, setLotesStats] = useState({
    total: '—', completos: '—', incompletos: '—', atrasados: '—',
    recPending: '—', qualPending: '—', procPending: '—',
  })
  const [tempStats, setTempStats] = useState({
    todayReportStatus: '—', total: '—', pendientes: '—', atrasados: '—',
  })
  const [despStats, setDespStats] = useState({
    total: '—', pendientes: '—', atrasados: '—', completos: '—',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        // Google Drive status
        if (!googleConnected) {
          const r = await fetch('/api/settings/drive-status')
          if (r.ok) {
            const d = await r.json()
            if (d.connected) setGoogleConnected(true)
          }
        }

        // Lotes
        const lotesRes = await fetch('/api/lotes')
        if (lotesRes.ok) {
          const { data, total } = await lotesRes.json()
          if (Array.isArray(data)) {
            setLotesStats({
              total:       (total ?? data.length).toString(),
              completos:   data.filter((l: any) => l.overall_status === 'complete' || l.overall_status === 'validated' || l.overall_status === 'closed').length.toString(),
              incompletos: data.filter((l: any) => ['uploaded','pending',undefined,null,''].includes(l.overall_status)).length.toString(),
              atrasados:   data.filter((l: any) => l.overall_status === 'observed').length.toString(),
              recPending:  data.filter((l: any) => l.reception_status === 'pending').length.toString(),
              qualPending: data.filter((l: any) => l.quality_status === 'pending').length.toString(),
              procPending: data.filter((l: any) => l.process_status === 'pending').length.toString(),
            })
          }
        }

        // Temperaturas
        const tempRes = await fetch('/api/temperaturas')
        if (tempRes.ok) {
          const { data, total } = await tempRes.json()
          if (Array.isArray(data)) {
            const today = new Date().toISOString().split('T')[0]
            const todayReport = data.find((r: any) => r.report_date === today)
            setTempStats({
              todayReportStatus: todayReport ? (todayReport.temperature_value ? `${todayReport.temperature_value}°C` : 'Subido') : 'Sin datos',
              total:     (total ?? data.length).toString(),
              pendientes: data.filter((r: any) => r.status === 'pending').length.toString(),
              atrasados:  data.filter((r: any) => r.status === 'late' || r.status === 'observed').length.toString(),
            })
          }
        }

        // Despachos
        const despRes = await fetch('/api/despachos?limit=200')
        if (despRes.ok) {
          const { data, total } = await despRes.json()
          if (Array.isArray(data)) {
            setDespStats({
              total:      (total ?? data.length).toString(),
              pendientes: data.filter((d: any) => ['pending','uploaded','observed','late'].includes(d.overall_status)).length.toString(),
              atrasados:  data.filter((d: any) => d.overall_status === 'late').length.toString(),
              completos:  data.filter((d: any) => d.overall_status === 'complete' || d.overall_status === 'closed').length.toString(),
            })
          }
        }
      } catch (err) {
        console.error('Error cargando datos del dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [googleConnected])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const error = searchParams.get('google_error')
    const connected = searchParams.get('google_connected')
    
    if (error) {
      alert(`Error al conectar con Google Drive: ${decodeURIComponent(error)}`)
      window.history.replaceState({}, document.title, '/dashboard')
    } else if (connected === 'true') {
      alert('¡Sincronización con Google Drive activada correctamente!')
      window.history.replaceState({}, document.title, '/dashboard')
    }
  }, [])

  return (
    <div className="space-y-8">

      {/* Banner Drive */}
      {user?.role === 'admin' && (
        <section
          className="relative overflow-hidden rounded-3xl p-8 shadow-lg transition-all duration-300"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-start gap-6">
              <div className={`p-4 rounded-2xl ${googleConnected ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                <Cloud className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Sincronización con Google Drive
                </h2>
                <p className="mt-2 max-w-xl" style={{ color: 'var(--text-secondary)' }}>
                  {googleConnected
                    ? 'Los archivos están siendo respaldados automáticamente en tu almacenamiento de 5TB. Máxima seguridad y acceso desde cualquier lugar.'
                    : 'Asegura tus documentos vinculando tu cuenta de Google Drive. Evita límites de espacio y mantén respaldos permanentes.'}
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <Link 
                    href="/configuracion" 
                    className="text-sm font-medium text-blue-500 hover:underline flex items-center gap-1"
                  >
                    Gestionar en Configuración <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 min-w-[240px]">
              {googleConnected ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-green-500 font-bold bg-green-500/10 px-5 py-3 rounded-2xl border border-green-500/20">
                    <CheckCircle2 className="w-6 h-6" />
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
                    className="text-xs text-red-500 hover:text-red-400 font-medium transition-all group"
                  >
                    <span className="group-hover:underline">Desactivar temporalmente</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { window.location.href = '/api/auth/google'; }}
                  className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all hover:scale-105 shadow-xl shadow-blue-500/20"
                >
                  <Cloud size={20} />
                  Activar Sincronización
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Bienvenido, {user?.displayName} 👋
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          {user?.role ? ROLE_DISPLAY_NAMES[user.role as Role] : ''} · Packing Santa Catalina
        </p>
      </div>

      {/* ─── Lotes ─── */}
      <section>
        <SectionHeader icon={Package} label="Lotes / Recepción" accent="text-emerald-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total lotes"   value={lotesStats.total}      loading={loading} icon={Package}      accent="text-slate-500" />
          <StatCard title="Incompletos"   value={lotesStats.incompletos}loading={loading} icon={Clock}        accent="text-amber-500" />
          <StatCard title="Observados"    value={lotesStats.atrasados}  loading={loading} icon={AlertTriangle}accent="text-red-500" />
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
          <StatCard title="Total despachos" value={despStats.total}      loading={loading} icon={Truck}        accent="text-slate-500" />
          <StatCard title="Pendientes"       value={despStats.pendientes} loading={loading} icon={Clock}        accent="text-amber-500" />
          <StatCard title="Atrasados"        value={despStats.atrasados}  loading={loading} icon={XCircle}      accent="text-red-500" />
          <StatCard title="Completos"        value={despStats.completos}  loading={loading} icon={CheckCircle2} accent="text-emerald-500" />
        </div>
      </section>

      {/* ─── Temperaturas ─── */}
      <section>
        <SectionHeader icon={Thermometer} label="Temperaturas" accent="text-sky-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total reportes" value={tempStats.total}      loading={loading} icon={TrendingUp} accent="text-sky-500" />
          <StatCard title="Pendientes"     value={tempStats.pendientes} loading={loading} icon={Clock}      accent="text-amber-500" />
          <StatCard title="Atrasados"      value={tempStats.atrasados}  loading={loading} icon={XCircle}    accent="text-red-500" />
          {/* Card especial: reporte hoy */}
          <div
            className="rounded-2xl p-5 col-span-2 md:col-span-1 transition-all duration-200"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Reporte hoy</p>
            {loading ? (
              <div className="h-7 w-24 rounded animate-pulse mt-1" style={{ backgroundColor: 'var(--border)' }} />
            ) : (
              <p className={`text-2xl font-bold mt-1 ${tempStats.todayReportStatus === 'Sin datos' ? 'text-red-500' : 'text-emerald-500'}`}>
                {tempStats.todayReportStatus}
              </p>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {tempStats.todayReportStatus === 'Sin datos' ? 'Falta registrar el control' : 'Control registrado'}
            </p>
          </div>
        </div>
      </section>

      {/* Banner info inicial */}
      {!googleConnected && (
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
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
