'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { calcularMisTareas } from '@/lib/tareasPendientes'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const ROLES_CON_TAREAS = ['jefe_frio', 'calidad', 'cuadratura', 'sag', 'despacho']

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta "Mis pendientes" en el Dashboard: cada persona ve, sin tener que
// entrar módulo por módulo, exactamente qué le falta subir y dónde.
// Antes esta pregunta solo la respondía la pantalla /pendientes, y esa
// pantalla es en realidad la cola de validación del administrador.
// ─────────────────────────────────────────────────────────────────────────────
export default function MisPendientesWidget() {
  const { user } = useAuth()
  const rolConTareas = user?.role && ROLES_CON_TAREAS.includes(user.role)
  const { data, isLoading } = useSWR(rolConTareas ? '/api/pendientes' : null, fetcher, { refreshInterval: 120_000 })

  if (!rolConTareas) return null

  const tareas = data?.data ? calcularMisTareas(data.data, user!.role) : []

  const hrefDe = (t: ReturnType<typeof calcularMisTareas>[number]) => {
    if (t.entidad === 'lote') return `/lotes/${t.id}`
    if (t.entidad === 'despacho') return `/despachos/${t.id}`
    return '/temperaturas'
  }

  return (
    <section className="card-frost p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mis pendientes</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lo que te toca subir a ti, con lo que ya tiene plazo vencido</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 skeleton-shimmer rounded-xl" />)}
        </div>
      ) : tareas.length === 0 ? (
        <div className="flex items-center gap-2.5 text-emerald-500 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">Estás al día. No tienes pendientes con plazo vencido.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tareas.slice(0, 6).map((t, i) => (
            <Link
              key={i}
              href={hrefDe(t)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:scale-[1.01]"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {t.codigo !== '—' ? `${t.entidad === 'lote' ? 'Lote' : 'Despacho'} ${t.codigo}` : 'Control de temperatura'}
                  {t.cliente ? ` · ${t.cliente}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.descripcion}</p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
            </Link>
          ))}
          {tareas.length > 6 && (
            <p className="text-xs text-center pt-1" style={{ color: 'var(--text-muted)' }}>
              +{tareas.length - 6} pendiente(s) más
            </p>
          )}
        </div>
      )}
    </section>
  )
}
