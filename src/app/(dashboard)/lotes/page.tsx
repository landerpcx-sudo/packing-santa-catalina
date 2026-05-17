'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Package, Plus, Search, Filter, ExternalLink,
  Clock, CheckCircle, AlertCircle, XCircle, BarChart3,
  FolderOpen, ChevronRight, RefreshCw
} from 'lucide-react'
import NewLotModal from '@/components/lotes/NewLotModal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

const SPECIES_ICONS: Record<string, string> = {
  'Limón': '🍋',
  'Limon': '🍋',
  'Manzana': '🍎',
  'Pera': '🍐',
  'Cereza': '🍒',
  'Arándano': '🫐',
  'Arandano': '🫐',
  'Naranja': '🍊',
  'Mandarina': '🍊',
  'Kiwi': '🥝',
  'Uva': '🍇',
  'Palta': '🥑',
  'Ciruela': '🫐',
  'Durazno': '🍑',
  'Nectarina': '🍑',
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

// Semáforo de 3 etapas: Recepción / Calidad / Proceso
const LotSemaphore = ({ lot }: { lot: Lot }) => {
  const stages = [
    { label: 'Rec.', status: lot.reception_status },
    { label: 'Cal.', status: lot.quality_status },
    { label: 'Pro.', status: lot.process_status },
  ]
  const dotColor: Record<string, string> = {
    pending:   'bg-red-500/30',
    uploaded:  'bg-yellow-400',
    validated: 'bg-green-400',
    observed:  'bg-yellow-400',
    late:      'bg-red-500 animate-pulse',
  }
  return (
    <div className="flex items-center gap-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-0.5">
          <div className={`w-3 h-3 rounded-full border border-white/10 ${dotColor[s.status] || 'bg-gray-600'}`} title={s.label} />
          <span className="text-gray-600 text-[9px] uppercase font-bold">{s.label}</span>
        </div>
      ))}
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

export default function LotesPage() {
  const [lots, setLots] = useState<Lot[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchLots = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (search) params.set('search', search)
    if (filterStatus) params.set('status', filterStatus)

    const res = await fetch(`/api/lotes?${params}`)
    if (res.ok) {
      const json = await res.json()
      setLots(json.data || [])
      setTotal(json.total || 0)
    }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => {
    fetchLots()
  }, [fetchLots])

  // Estadísticas rápidas
  const stats = {
    total: total,
    pending: lots.filter(l => l.overall_status === 'pending').length,
    late: lots.filter(l => l.overall_status === 'late').length,
    complete: lots.filter(l => l.overall_status === 'complete' || l.overall_status === 'validated' || l.overall_status === 'closed').length,
  }

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
            onClick={fetchLots}
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

      {/* Estadísticas mini */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Lotes', value: stats.total, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
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
            placeholder="Buscar por código, nombre o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-green-400/50 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-green-400/50 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#111827]">Todos los estados</option>
            <option value="pending" className="bg-[#111827]">Pendiente</option>
            <option value="complete" className="bg-[#111827]">Completo</option>
            <option value="late" className="bg-[#111827]">Atrasado</option>
            <option value="closed" className="bg-[#111827]">Cerrado</option>
          </select>
        </div>
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
          <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Cargando lotes...</span>
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
          lots.map((lot) => {
            const overdue = isOverdue(lot.reception_deadline, lot.reception_status)
            return (
              <div
                key={lot.id}
                onClick={() => router.push(`/lotes/${lot.id}`)}
                className="grid grid-cols-12 px-5 py-4 border-b border-white/5 hover:bg-white/3 transition-all group items-center cursor-pointer"
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
                  <p className="text-gray-300 text-sm truncate">{lot.client || '—'}</p>
                </div>

                {/* Especie */}
                <div className="col-span-2 hidden lg:block">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{SPECIES_ICONS[lot.species || ''] || '📦'}</span>
                    <div>
                      <p className="text-gray-300 text-sm font-medium">{lot.species || '—'}</p>
                      {lot.variety && <p className="text-gray-500 text-[10px] leading-tight">{lot.variety}</p>}
                    </div>
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
          })
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
