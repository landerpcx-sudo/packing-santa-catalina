'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Truck, Plus, Search, Filter, ExternalLink,
  Clock, CheckCircle, AlertCircle, XCircle, BarChart3,
  FolderOpen, ChevronRight, RefreshCw
} from 'lucide-react'
import NewDispatchModal from '@/components/despachos/NewDispatchModal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Dispatch {
  id: string
  internal_code: string
  dispatch_code: string
  client: string | null
  destination: string | null
  dispatch_date: string | null
  expected_pallets: number | null
  pack_list_status: string
  pata_pata_photos_count: number
  thermograph_photos_count: number
  photos_status: string
  overall_status: string
  drive_folder_url: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  color: 'text-red-400 bg-red-400/10 border-red-400/20',     icon: <Clock className="w-3 h-3" /> },
  uploaded:  { label: 'Subido',     color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: <BarChart3 className="w-3 h-3" /> },
  validated: { label: 'Aprobado',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: <CheckCircle className="w-3 h-3" /> },
  observed:  { label: 'Observado',  color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: <AlertCircle className="w-3 h-3" /> },
  late:      { label: 'Atrasado',   color: 'text-red-500 bg-red-500/10 border-red-500/20',      icon: <XCircle className="w-3 h-3" /> },
  complete:  { label: 'Aprobado',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: <CheckCircle className="w-3 h-3" /> },
  closed:    { label: 'Cerrado',    color: 'text-gray-500 bg-gray-500/10 border-gray-500/20',   icon: <XCircle className="w-3 h-3" /> },
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export default function DespachosPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const searchRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDispatches = useCallback(async (searchValue = search, statusValue = filterStatus, from = dateFrom, to = dateTo) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (searchValue) params.set('search', searchValue)
    if (statusValue) params.set('status', statusValue)
    if (from) params.set('from', from)
    if (to) params.set('to', to)

    const res = await fetch(`/api/despachos?${params}`)
    if (res.ok) {
      const json = await res.json()
      setDispatches(json.data || [])
      setTotal(json.total || 0)
    }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => {
    fetchDispatches()
  }, [fetchDispatches])

  // Debounce para el campo de búsqueda
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchDispatches(value, filterStatus, dateFrom, dateTo), 350)
  }

  // Filtro de estado: disparo inmediato
  const handleStatusChange = (value: string) => {
    setFilterStatus(value)
    fetchDispatches(search, value, dateFrom, dateTo)
  }

  // Semáforo de 3 etapas: Pack List / Pata Pata / Termógrafos (Diseño Stepper)
  const DispatchSemaphore = ({ dispatch }: { dispatch: Dispatch }) => {
    const minPata = Math.ceil((dispatch.expected_pallets || 0) / 2)
    const pataStatus = dispatch.pata_pata_photos_count >= minPata ? 'validated' : (dispatch.pata_pata_photos_count > 0 ? 'uploaded' : 'pending')
    const thermoStatus = dispatch.thermograph_photos_count >= 2 ? 'validated' : (dispatch.thermograph_photos_count > 0 ? 'uploaded' : 'pending')
    
    const stages = [
      { label: 'P.L.', status: dispatch.pack_list_status },
      { label: 'Pata', status: pataStatus },
      { label: 'Termo', status: thermoStatus },
    ]
    
    const getStageColor = (status: string) => {
      switch (status) {
        case 'validated':
        case 'complete': return 'bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
        case 'uploaded': return 'bg-yellow-400 border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]'
        case 'observed': return 'bg-orange-500 border-orange-500'
        case 'late': return 'bg-red-500 border-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]'
        default: return 'bg-[#1f2937] border-gray-600'
      }
    }

    return (
      <div className="flex flex-col gap-1.5 w-full max-w-[130px]">
        {/* Puntos y líneas conectoras */}
        <div className="flex items-center w-full px-1">
          {stages.map((s, i) => (
            <React.Fragment key={s.label}>
              <div 
                className={`w-2.5 h-2.5 rounded-full border ${getStageColor(s.status)} transition-all duration-300 shrink-0 z-10`} 
                title={s.label} 
              />
              {i < stages.length - 1 && (
                <div className={`flex-1 h-[2px] -mx-0.5 z-0 ${
                  s.status === 'validated' || s.status === 'complete' ? 'bg-emerald-500/50' : 'bg-gray-700/50'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Etiquetas de texto */}
        <div className="flex items-center justify-between w-full">
           {stages.map((s, i) => (
             <span 
               key={s.label} 
               className={`text-[8.5px] uppercase font-bold tracking-tighter ${
                 s.status === 'validated' ? 'text-emerald-500/80' : 
                 s.status === 'pending' ? 'text-gray-600' : 'text-gray-400'
               }`}
             >
               {s.label}
             </span>
           ))}
        </div>
      </div>
    )
  }

  // Estadísticas rápidas
  const stats = {
    total: total,
    pending: dispatches.filter(d => ['pending', 'uploaded', 'observed', 'late'].includes(d.overall_status)).length,
    late: dispatches.filter(d => d.overall_status === 'late').length,
    complete: dispatches.filter(d => d.overall_status === 'complete' || d.overall_status === 'closed').length,
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-7 h-7 text-indigo-400" />
            Despachos
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Control de salidas de producto terminado y carga
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDispatches()}
            className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/30"
          >
            <Plus className="w-4 h-4" />
            Nuevo Despacho
          </button>
        </div>
      </div>

      {/* Estadísticas mini */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Despachos', value: stats.total, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
          { label: 'Pendientes', value: stats.pending, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
          { label: 'Atrasados', value: stats.late, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
          { label: 'Completos', value: stats.complete, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20' },
        ].map((s) => (
          <div key={s.label} className={`border rounded-xl p-3 ${s.bg}`}>
            <p className="text-gray-400 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por código, cliente o destino..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400/50 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#111827]">Todos los estados</option>
            <option value="pending" className="bg-[#111827]">Pendiente</option>
            <option value="complete" className="bg-[#111827]">Completo</option>
            <option value="late" className="bg-[#111827]">Atrasado</option>
            <option value="closed" className="bg-[#111827]">Cerrado</option>
          </select>
        </div>
      </div>

      {/* Filtro de rango de fechas (#24) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); fetchDispatches(search, filterStatus, e.target.value, dateTo) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); fetchDispatches(search, filterStatus, dateFrom, e.target.value) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/50 transition-all"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); fetchDispatches(search, filterStatus, '', '') }}
            className="px-3 py-2 text-xs text-gray-400 hover:text-red-400 border border-white/10 rounded-xl transition-all font-bold uppercase tracking-wider"
          >
            ✕ Limpiar fechas
          </button>
        )}
      </div>

      {/* Tabla de despachos */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {/* Header de tabla */}
        <div className="grid grid-cols-12 px-5 py-3 border-b border-white/8 text-gray-500 text-xs font-medium uppercase tracking-wider">
          <div className="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-3">Despacho</div>
          <div className="col-span-2 hidden md:block">Cliente</div>
          <div className="col-span-2 hidden lg:block">Destino</div>
          <div className="col-span-4 sm:col-span-3 md:col-span-3 lg:col-span-2">Semáforo</div>
          <div className="col-span-3 hidden sm:block md:col-span-2">Estado</div>
          <div className="col-span-1 text-right">Drive</div>
        </div>

        {/* Filas */}
        {loading ? (
          <div className="space-y-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-12 px-5 py-4 border-b border-white/5 items-center animate-pulse">
                <div className="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="h-4 bg-white/5 rounded w-3/4" />
                    <div className="h-3 bg-white/5 rounded w-1/2" />
                  </div>
                </div>
                <div className="col-span-2 hidden md:block">
                  <div className="h-4 bg-white/5 rounded w-2/3" />
                </div>
                <div className="col-span-2 hidden lg:block">
                  <div className="h-4 bg-white/5 rounded w-1/3" />
                </div>
                <div className="col-span-4 sm:col-span-3 md:col-span-3 lg:col-span-2 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-white/5" />
                  <div className="w-5 h-5 rounded-full bg-white/5" />
                  <div className="w-5 h-5 rounded-full bg-white/5" />
                </div>
                <div className="col-span-3 hidden sm:block md:col-span-2">
                  <div className="h-6 bg-white/5 rounded-full w-20" />
                </div>
                <div className="col-span-1 flex justify-end">
                  <div className="w-8 h-8 rounded-lg bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : dispatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
              <Truck className="w-7 h-7 text-gray-500" />
            </div>
            <div>
              <p className="text-gray-300 font-medium">No hay despachos registrados</p>
              <p className="text-gray-500 text-sm mt-1">
                Crea el primer despacho haciendo clic en "Nuevo Despacho"
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400 text-sm hover:bg-indigo-600/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              Crear primer despacho
            </button>
          </div>
        ) : (
          dispatches.map((dispatch) => {
            return (
              <div
                key={dispatch.id}
                onClick={() => router.push(`/despachos/${dispatch.id}`)}
                className="grid grid-cols-12 px-5 py-4 border-b border-white/5 hover:bg-white/3 transition-all group items-center cursor-pointer"
              >
                {/* Código + Nombre */}
                <div className="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-8 rounded-full flex-shrink-0 bg-indigo-500/40`} />
                    <div>
                      <p className="text-white font-semibold text-sm group-hover:text-indigo-400 transition-colors">
                        Despacho {dispatch.dispatch_code}
                      </p>
                      <p className="text-gray-500 text-xs">{formatDate(dispatch.dispatch_date)}</p>
                    </div>
                  </div>
                </div>

                {/* Cliente */}
                <div className="col-span-2 hidden md:block">
                  <p className="text-gray-300 text-sm truncate">{dispatch.client || '—'}</p>
                </div>

                {/* Destino */}
                <div className="col-span-2 hidden lg:block">
                  <p className="text-gray-300 text-sm truncate">{dispatch.destination || '—'}</p>
                </div>

                {/* Semáforo */}
                <div className="col-span-4 sm:col-span-3 md:col-span-3 lg:col-span-2">
                  <DispatchSemaphore dispatch={dispatch} />
                </div>

                {/* Estado General */}
                <div className="col-span-3 hidden sm:block md:col-span-2">
                  <StatusBadge status={dispatch.overall_status} />
                </div>

                {/* Drive + flecha */}
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NewDispatchModal
          onClose={() => setShowModal(false)}
          onSuccess={fetchDispatches}
        />
      )}
    </div>
  )
}
