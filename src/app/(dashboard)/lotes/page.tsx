'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Fragment, Suspense } from 'react'
import {
  Package, Plus, Search, Filter, ExternalLink,
  Clock, CheckCircle, AlertCircle, XCircle, BarChart3,
  FolderOpen, ChevronRight, RefreshCw
} from 'lucide-react'
import dynamic from 'next/dynamic'

const NewLotModal = dynamic(() => import('@/components/lotes/NewLotModal'), { ssr: false })
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getFruitInfo } from '@/lib/flags-and-fruits'

interface Lot {
  id: string
  internal_code: string
  display_name: string
  lot_number: string
  client: string | null
  producer: string | null
  species: string | null
  variety: string | null
  reception_status: string
  quality_status: string
  process_status: string
  overall_status: string
  reception_deadline: string | null
  quality_deadline: string | null
  process_deadline: string | null
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

  // Semáforo de 3 etapas: Recepción / Calidad / Proceso (Diseño Stepper)
  const LotSemaphore = ({ lot }: { lot: Lot }) => {
    const stages = [
      { label: 'Rec.', status: lot.reception_status },
      { label: 'Cal.', status: lot.quality_status },
      { label: 'Pro.', status: lot.process_status },
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
            <Fragment key={s.label}>
              <div 
                className={`w-2.5 h-2.5 rounded-full border ${getStageColor(s.status)} transition-all duration-300 shrink-0 z-10`} 
                title={s.label} 
              />
              {i < stages.length - 1 && (
                <div className={`flex-1 h-[2px] -mx-0.5 z-0 ${
                  s.status === 'validated' || s.status === 'complete' ? 'bg-emerald-500/50' : 'bg-gray-700/50'
                }`} />
              )}
            </Fragment>
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

const isOverdue = (deadline: string | null, status: string) => {
  if (!deadline || ['validated', 'closed'].includes(status)) return false
  return new Date(deadline) < new Date()
}

const formatDeadline = (deadline: string | null) => {
  if (!deadline) return null
  const d = new Date(deadline)
  const diff = Math.round((d.getTime() - Date.now()) / 3600000)
  if (diff < 0) return `Vencido hace ${Math.abs(diff)}h`
  if (diff < 24) return `Vence en ${diff}h`
  return `Vence ${d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}`
}

function LotesContent() {
  const [lots, setLots] = useState<Lot[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const speciesFilterFromUrl = searchParams.get('species') || ''

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterProducer, setFilterProducer] = useState('')
  const [filterSpecies, setFilterSpecies] = useState('')
  const [filterVariety, setFilterVariety] = useState('')

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setFilterSpecies(speciesFilterFromUrl)
  }, [speciesFilterFromUrl])

  const fetchLots = useCallback(async (
    searchValue?: string, 
    statusValue?: string,
    clientValue?: string,
    producerValue?: string,
    speciesValue?: string,
    varietyValue?: string
  ) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    const s = searchValue !== undefined ? searchValue : search
    const f = statusValue !== undefined ? statusValue : filterStatus
    const c = clientValue !== undefined ? clientValue : filterClient
    const p = producerValue !== undefined ? producerValue : filterProducer
    const sp = speciesValue !== undefined ? speciesValue : filterSpecies
    const v = varietyValue !== undefined ? varietyValue : filterVariety

    if (s) params.set('search', s)
    if (f) params.set('status', f)
    if (c) params.set('client', c)
    if (p) params.set('producer', p)
    if (sp) params.set('species', sp)
    if (v) params.set('variety', v)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo)   params.set('to', dateTo)

    const res = await fetch(`/api/lotes?${params}`)
    if (res.ok) {
      const json = await res.json()
      setLots(json.data || [])
      setTotal(json.total || 0)
    }
    setLoading(false)
  }, [search, filterStatus, filterClient, filterProducer, filterSpecies, filterVariety, dateFrom, dateTo])

  // Debounce para el campo de búsqueda (Mejora #11)
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchLots(value, filterStatus), 350)
  }

  // Filtro de estado: disparo inmediato
  const handleStatusChange = (value: string) => {
    setFilterStatus(value)
    fetchLots(search, value)
  }

  useEffect(() => {
    fetchLots()
  }, [fetchLots])

  const [globalStats, setGlobalStats] = useState({ total: 0, pending: 0, late: 0, complete: 0 })

  const fetchGlobalStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats')
      if (res.ok) {
        const json = await res.json()
        const lotes = json.data?.lotes
        if (lotes) {
          setGlobalStats({
            total: lotes.total || 0,
            pending: lotes.incompletos || 0,
            late: lotes.observados || 0,
            complete: lotes.completos || 0,
          })
        }
      }
    } catch (e) {
      console.error('Error fetching global stats:', e)
    }
  }, [])

  useEffect(() => {
    fetchGlobalStats()
  }, [fetchGlobalStats])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-green-400" />
            Lotes / Recepción
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Gestión y seguimiento de lotes de fruta — Temporada {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchLots(); fetchGlobalStats(); }}
            className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-green-900/30"
          >
            <Plus className="w-4 h-4" />
            Nuevo Lote
          </button>
        </div>
      </div>

      {/* Estadísticas mini interactivas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: '', label: 'Total Lotes', value: globalStats.total || total, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', activeBg: 'ring-2 ring-blue-400' },
          { key: 'pending', label: 'Pendientes', value: globalStats.pending, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', activeBg: 'ring-2 ring-red-400' },
          { key: 'late', label: 'Atrasados', value: globalStats.late, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20', activeBg: 'ring-2 ring-orange-400' },
          { key: 'complete', label: 'Completos', value: globalStats.complete, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', activeBg: 'ring-2 ring-green-400' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => handleStatusChange(filterStatus === s.key ? '' : s.key)}
            className={`border rounded-xl p-3 text-left transition-all hover:scale-[1.02] cursor-pointer ${s.bg} ${filterStatus === s.key ? s.activeBg : ''}`}
          >
            <p className="text-gray-400 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por código, nombre o cliente..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-green-400/50 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#111827]">Todos los estados</option>
            <option value="pending" className="bg-[#111827]">Pendiente</option>
            <option value="uploaded" className="bg-[#111827]">Subido</option>
            <option value="complete" className="bg-[#111827]">Aprobado</option>
            <option value="observed" className="bg-[#111827]">Observado</option>
            <option value="late" className="bg-[#111827]">Atrasado</option>
            <option value="closed" className="bg-[#111827]">Cerrado</option>
          </select>
        </div>
      </div>

      {/* Filtros Avanzados por Atributo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white/3 border border-white/5 rounded-2xl p-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cliente</label>
          <input
            type="text"
            placeholder="Filtrar por cliente..."
            value={filterClient}
            onChange={(e) => { setFilterClient(e.target.value); fetchLots(search, filterStatus, e.target.value, filterProducer, filterSpecies, filterVariety) }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Productor</label>
          <input
            type="text"
            placeholder="Filtrar por productor..."
            value={filterProducer}
            onChange={(e) => { setFilterProducer(e.target.value); fetchLots(search, filterStatus, filterClient, e.target.value, filterSpecies, filterVariety) }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Especie</label>
          <select
            value={filterSpecies}
            onChange={(e) => {
              const val = e.target.value
              setFilterSpecies(val)
              if (val) {
                router.push(`/lotes?species=${encodeURIComponent(val)}`)
              } else {
                router.push('/lotes')
              }
            }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-green-400/50 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#111827]">Todas las especies</option>
            <option value="Limones" className="bg-[#111827]">🍋 Limones</option>
            <option value="Manzanas" className="bg-[#111827]">🍎 Manzanas</option>
            <option value="Cerezas" className="bg-[#111827]">🍒 Cerezas</option>
            <option value="Uvas" className="bg-[#111827]">🍇 Uvas</option>
            <option value="Naranjas" className="bg-[#111827]">🍊 Naranjas</option>
            <option value="Paltas" className="bg-[#111827]">🥑 Paltas</option>
            <option value="Arándanos" className="bg-[#111827]">🫐 Arándanos</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Variedad</label>
          <input
            type="text"
            placeholder="Filtrar por variedad..."
            value={filterVariety}
            onChange={(e) => { setFilterVariety(e.target.value); fetchLots(search, filterStatus, filterClient, filterProducer, filterSpecies, e.target.value) }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
      </div>

      {/* Filtro de rango de fechas (#24) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); fetchLots(search, filterStatus) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); fetchLots(search, filterStatus) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        {(dateFrom || dateTo || filterClient || filterProducer || filterSpecies || filterVariety) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setFilterClient('');
              setFilterProducer('');
              setFilterSpecies('');
              setFilterVariety('');
              if (speciesFilterFromUrl) {
                router.push('/lotes')
              }
              fetchLots(search, filterStatus, '', '', '', '');
            }}
            className="px-3 py-2 text-xs text-gray-400 hover:text-red-400 border border-white/10 rounded-xl transition-all font-bold uppercase tracking-wider"
          >
            ✕ Limpiar filtros
          </button>
        )}
      </div>


      {/* Tabla de lotes */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {/* Header de tabla */}
        <div className="grid grid-cols-12 px-5 py-3 border-b border-white/8 text-gray-500 text-xs font-medium uppercase tracking-wider">
          <div className="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-3">Lote</div>
          <div className="col-span-2 hidden md:block">Cliente</div>
          <div className="col-span-2 hidden lg:block">Especie</div>
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
                <div className="col-span-2 hidden md:block space-y-1.5">
                  <div className="h-4 bg-white/5 rounded w-2/3" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
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
        ) : lots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
              <Package className="w-7 h-7 text-gray-500" />
            </div>
            <div>
              <p className="text-gray-300 font-medium">No hay lotes registrados</p>
              <p className="text-gray-500 text-sm mt-1">
                Crea el primer lote de la temporada haciendo clic en "Nuevo Lote"
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-xl text-green-400 text-sm hover:bg-green-600/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              Crear primer lote
            </button>
          </div>
        ) : (
          <div className="row-stagger">
          {lots.map((lot) => {
            const overdue = isOverdue(lot.reception_deadline, lot.reception_status)
            return (
              <div
                key={lot.id}
                onClick={() => router.push(`/lotes/${lot.id}`)}
                className="row-hover-glow grid grid-cols-12 px-5 py-4 border-b border-white/5 transition-all group items-center cursor-pointer"
              >
                {/* Código + Nombre */}
                <div className="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${overdue ? 'bg-red-500' : 'bg-green-500/40'}`} />
                    <div>
                      <p className="text-white font-semibold text-sm group-hover:text-green-400 transition-colors">
                        {lot.display_name}
                      </p>
                      <p className="text-gray-500 text-xs">{lot.internal_code}</p>
                    </div>
                  </div>
                </div>

                {/* Cliente */}
                <div className="col-span-2 hidden md:block">
                  <p className="text-gray-300 text-sm font-medium truncate">{lot.client || '—'}</p>
                  {lot.producer && <p className="text-gray-500 text-[10px] leading-tight truncate" title={`Productor: ${lot.producer}`}>{lot.producer}</p>}
                </div>

                {/* Especie */}
                <div className="col-span-2 hidden lg:block">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const fruit = getFruitInfo(lot.species, lot.client)
                      return (
                        <>
                          <span className="text-lg" title={`Especie: ${fruit.label}`}>{fruit.icon}</span>
                          <div>
                            <p className="text-gray-300 text-sm font-medium">{lot.species || fruit.label}</p>
                            {lot.variety && <p className="text-gray-500 text-[10px] leading-tight">{lot.variety}</p>}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Semáforo */}
                <div className="col-span-4 sm:col-span-3 md:col-span-3 lg:col-span-2">
                  <LotSemaphore lot={lot} />
                  {overdue && (
                    <p className="text-red-400 text-[10px] mt-1">
                      {formatDeadline(lot.reception_deadline)}
                    </p>
                  )}
                </div>

                {/* Estado General */}
                <div className="col-span-3 hidden sm:block md:col-span-2">
                  <StatusBadge status={lot.overall_status} />
                </div>

                {/* Drive + flecha */}
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NewLotModal
          onClose={() => setShowModal(false)}
          onSuccess={fetchLots}
        />
      )}
    </div>
  )
}

export default function LotesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12 text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Cargando lotes...
      </div>
    }>
      <LotesContent />
    </Suspense>
  )
}
