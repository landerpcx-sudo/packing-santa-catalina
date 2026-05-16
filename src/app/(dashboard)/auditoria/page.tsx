'use client'

import { useState, useEffect } from 'react'
import { 
  Activity, 
  Search, 
  Calendar, 
  User, 
  Clock, 
  Database, 
  Eye, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  UserCheck,
  Package,
  Truck,
  Thermometer,
  ShieldAlert,
  FileCheck,
  AlertCircle
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
  'CREATE_USER': { label: 'Nuevo Usuario', color: 'text-purple-400 bg-purple-500/10', icon: User },
  'UPDATE_USER': { label: 'Edición Usuario', color: 'text-blue-400 bg-blue-500/10', icon: Edit2 },
  'login': { label: 'Inicio Sesión', color: 'text-emerald-400 bg-emerald-500/10', icon: UserCheck },
  'login_failed': { label: 'Fallo Login', color: 'text-red-400 bg-red-500/10', icon: AlertCircle },
}

import { Edit2 } from 'lucide-react'

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const limit = 50

  useEffect(() => {
    fetchLogs()
  }, [page])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/auditoria?page=${page}&limit=${limit}`)
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
  }

  const formatDetails = (details: any) => {
    if (!details) return null
    return JSON.stringify(details, null, 2)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return {
      full: date.toLocaleString('es-CL'),
      time: date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    }
  }

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
        {/* Table Header / Toolbar */}
        <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/5">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Buscar por acción o usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Página {page} de {Math.ceil(total / limit)}</span>
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
                    <p className="text-gray-500 font-medium">No se encontraron registros de auditoría.</p>
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
                              onClick={() => alert(JSON.stringify(log.details, null, 2))}
                              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all"
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
    </div>
  )
}
