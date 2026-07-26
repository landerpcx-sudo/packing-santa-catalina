'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Search,
  Clock,
  Database,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  UserCheck,
  Package,
  Truck,
  Thermometer,
  ShieldAlert,
  FileCheck,
  AlertCircle,
  Edit2,
  User,
  X,
  Trash2,
  RotateCcw,
} from 'lucide-react'

interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: any
  created_at: string
  user: {
    display_name: string
    username: string
    role: string
  } | null
}

const ACTION_LABELS: Record<string, { label: string, color: string, icon: any }> = {
  'CREATE_LOT': { label: 'Nuevo Lote', color: 'text-emerald-400 bg-emerald-500/10', icon: Package },
  'CREATE_DISPATCH': { label: 'Nuevo Despacho', color: 'text-amber-400 bg-amber-500/10', icon: Truck },
  'CREATE_TEMPERATURE_REPORT': { label: 'Control Temperatura', color: 'text-sky-400 bg-sky-500/10', icon: Thermometer },
  'VALIDATE_DOCUMENT': { label: 'Validación Doc', color: 'text-indigo-400 bg-indigo-500/10', icon: FileCheck },
  'OBSERVE_DOCUMENT': { label: 'Observación Doc', color: 'text-rose-400 bg-rose-500/10', icon: ShieldAlert },
  'DELETE_DOCUMENT': { label: 'A la Papelera', color: 'text-orange-400 bg-orange-500/10', icon: Trash2 },
  'RESTORE_DOCUMENT': { label: 'Restaurado', color: 'text-emerald-400 bg-emerald-500/10', icon: RotateCcw },
  'PURGE_DOCUMENT': { label: 'Purga Definitiva', color: 'text-red-400 bg-red-500/10', icon: Trash2 },
  'CREATE_USER': { label: 'Nuevo Usuario', color: 'text-purple-400 bg-purple-500/10', icon: User },
  'UPDATE_USER': { label: 'Edición Usuario', color: 'text-blue-400 bg-blue-500/10', icon: Edit2 },
  'login': { label: 'Inicio Sesión', color: 'text-emerald-400 bg-emerald-500/10', icon: UserCheck },
  'login_failed': { label: 'Fallo Login', color: 'text-red-400 bg-red-500/10', icon: AlertCircle },
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [verDetalle, setVerDetalle] = useState<AuditLog | null>(null)
  const limit = 50

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (searchTerm.trim()) params.set('q', searchTerm.trim())
      if (actionFilter) params.set('action', actionFilter)
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)

      const res = await fetch(`/api/auditoria?${params.toString()}`)
      if (res.ok) {
        const d = await res.json()
        setLogs(d.data)
        setTotal(d.total)
      }
    } catch (err) {
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
    }
  }, [page, searchTerm, actionFilter, desde, hasta])

  // Búsqueda con debounce: no dispara una petición por cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchLogs()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, actionFilter, desde, hasta])

  useEffect(() => { fetchLogs() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return {
      time: date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    }
  }

  const hayFiltrosActivos = Boolean(searchTerm || actionFilter || desde || hasta)
  const limpiarFiltros = () => { setSearchTerm(''); setActionFilter(''); setDesde(''); setHasta('') }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Registro de Auditoría</h1>
          <p className="text-gray-400 mt-1">Traza completa de actividades y cambios realizados en la plataforma.</p>
        </div>

        <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
          <Database size={18} className="text-indigo-400" />
          <div className="text-sm">
            <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px] block leading-none">Total Eventos</span>
            <span className="text-white font-bold tabular-nums">{total}</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        {/* Toolbar de filtros */}
        <div className="p-4 border-b border-white/5 bg-white/5 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por acción, entidad o id..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Página {page} de {Math.max(1, Math.ceil(total / limit))}</span>
              <div className="flex gap-1">
                <button
                  disabled={page === 1 || loading}
                  onClick={() => setPage(page - 1)}
                  className="p-2 bg-white/5 border border-white/10 rounded-lg text-white disabled:opacity-30 hover:bg-white/10 transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  disabled={page * limit >= total || loading}
                  onClick={() => setPage(page + 1)}
                  className="p-2 bg-white/5 border border-white/10 rounded-lg text-white disabled:opacity-30 hover:bg-white/10 transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
            >
              <option value="" className="bg-[#0f172a]">Todas las acciones</option>
              {Object.entries(ACTION_LABELS).map(([key, cfg]) => (
                <option key={key} value={key} className="bg-[#0f172a]">{cfg.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="text-[11px] text-gray-400 hover:text-red-400 font-bold uppercase tracking-wider px-2 py-1"
              >
                ✕ Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-6 py-4">Fecha y Hora</th>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Acción</th>
                <th className="px-6 py-4">Entidad</th>
                <th className="px-6 py-4">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8">
                      <div className="h-4 bg-white/5 rounded-full w-full" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">
                      {hayFiltrosActivos ? 'Ningún evento coincide con estos filtros.' : 'No se encontraron registros de auditoría.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'text-gray-400 bg-white/5', icon: Activity }
                  const date = formatDate(log.created_at)
                  const ActionIcon = meta.icon

                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-all group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{date.date}</span>
                          <span className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                            <Clock size={10} /> {date.time}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
                            {log.user?.display_name?.charAt(0) || '?'}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-white truncate">{log.user?.display_name || 'Sistema'}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-tighter">@{log.user?.username || 'auto'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/5 ${meta.color}`}>
                          <ActionIcon size={12} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{log.entity_type || 'N/A'}</span>
                          <span className="text-xs text-white font-mono opacity-60 truncate max-w-[120px]">{log.entity_id || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="max-w-[200px] truncate text-xs text-gray-400 italic">
                            {log.details ? JSON.stringify(log.details).slice(0, 50) + '...' : 'Sin detalles adicionales'}
                          </div>
                          {log.details && (
                            <button
                              onClick={() => setVerDetalle(log)}
                              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all"
                              title="Ver detalle completo"
                            >
                              <ArrowUpRight size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-white/5 border-t border-white/5 text-[10px] text-gray-500 flex justify-between items-center uppercase tracking-[0.2em] font-bold">
          <span>Mostrando {logs.length} de {total} registros</span>
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Actualizado en Tiempo Real
          </span>
        </div>
      </div>

      {/* Modal de detalle: antes era un alert() del navegador */}
      {verDetalle && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setVerDetalle(null)}>
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
              <div>
                <p className="text-white font-bold text-sm">{ACTION_LABELS[verDetalle.action]?.label || verDetalle.action}</p>
                <p className="text-[11px] text-gray-500">{new Date(verDetalle.created_at).toLocaleString('es-CL')}</p>
              </div>
              <button onClick={() => setVerDetalle(null)} className="text-gray-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-5 text-xs text-gray-300 overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(verDetalle.details, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
