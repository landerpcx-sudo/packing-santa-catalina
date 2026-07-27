'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  Package,
  Truck,
  FileText,
  Download,
  Filter,
  RefreshCw,
  Sparkles,
  ChevronRight
} from 'lucide-react'
import { getFruitIcon } from '@/lib/flags-and-fruits'

interface SpeciesItem {
  name: string
  count: number
}

interface RecentDoc {
  id: string
  fileName: string
  fileUrl: string
  type: string
  createdAt: string
}

interface ClientSummaryData {
  activeLots: number
  totalLots?: number
  openLots?: number
  closedLots?: number
  activeDispatches: number
  species: SpeciesItem[]
  recentDocs: RecentDoc[]
}

export default function ClientSidebarWidget() {
  const [data, setData] = useState<ClientSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const currentSpeciesFilter = searchParams.get('species') || ''

  useEffect(() => {
    async function fetchSummary() {
      try {
        setLoading(true)
        const res = await fetch('/api/cliente/resumen', {
          cache: 'no-store',
          headers: {
            'x-user-id': user?.userId || '',
            'x-user-role': user?.role || '',
            'x-user-client-name': user?.clientName || user?.displayName || ''
          }
        })
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (e) {
        console.error('Error loading client summary:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [user])

  const handleSelectSpecies = (speciesName: string) => {
    const normSearch = (currentSpeciesFilter || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const normTarget = speciesName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const isSelected = normSearch && (normSearch.includes(normTarget.substring(0, 4)) || normTarget.includes(normSearch.substring(0, 4)))

    const basePage = (pathname.startsWith('/despachos') || pathname.startsWith('/lotes')) ? pathname : '/lotes'

    if (isSelected) {
      router.push(basePage)
    } else {
      router.push(`${basePage}?species=${encodeURIComponent(speciesName)}`)
    }
  }

  if (loading) {
    return (
      <div className="px-3 py-3 space-y-3 opacity-60">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando portal cliente...
        </div>
      </div>
    )
  }

  const species = data?.species || []
  const totalLots = data?.totalLots ?? data?.activeLots ?? 0
  const openLots = data?.openLots ?? 0
  const closedLots = data?.closedLots ?? 0
  const activeDispatches = data?.activeDispatches || 0
  const recentDocs = data?.recentDocs || []

  return (
    <div className="px-3 py-2 space-y-3">
      {/* ── 1. FILTRO DE FRUTA POR ESPECIE ─────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center gap-1">
            <Filter className="w-3 h-3 text-emerald-500" />
            Especies Procesadas
          </span>
          {currentSpeciesFilter && (
            <button
              onClick={() => router.push(pathname.startsWith('/despachos') ? '/despachos' : '/lotes')}
              className="text-[10px] text-indigo-500 hover:underline font-semibold"
            >
              Ver todas
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
          {species.length === 0 ? (
            <div className="text-[11px] text-slate-400 dark:text-gray-500 italic px-1">
              Sin registros de especies
            </div>
          ) : (
            species.map((sp) => {
              const normSearch = (currentSpeciesFilter || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
              const normTarget = sp.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
              const isSelected = normSearch && (normSearch.includes(normTarget.substring(0, 4)) || normTarget.includes(normSearch.substring(0, 4)))
              const icon = getFruitIcon(sp.name)
              return (
                <button
                  key={sp.name}
                  onClick={() => handleSelectSpecies(sp.name)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border ${
                    isSelected
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm">{icon}</span>
                  <span className="truncate max-w-[100px]">{sp.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400'
                  }`}>
                    {sp.count}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── 2. RESUMEN OPERATIVO DE LOTES Y DESPACHOS ───────────────────── */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center gap-1 px-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          Resumen Operativo
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-gray-400">
              <Package className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Lotes</span>
            </div>
            <div className="mt-1">
              <span className="text-base font-black text-slate-900 dark:text-white font-mono">{totalLots}</span>
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold leading-tight mt-0.5">
                {openLots} por procesar · {closedLots} procesados
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-gray-400">
              <Truck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Despachos</span>
            </div>
            <div className="mt-1">
              <span className="text-base font-black text-slate-900 dark:text-white font-mono">{activeDispatches}</span>
              <p className="text-[9px] text-indigo-500 dark:text-indigo-300 font-semibold leading-tight mt-0.5">
                embarcados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. ÚLTIMOS INFORMES PDF DISPONIBLES ─────────────────────────── */}
      <div className="space-y-1.5 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center gap-1 px-1">
          <FileText className="w-3 h-3 text-blue-400" />
          Últimos Informes PDF
        </span>
        <div className="space-y-1.5">
          {recentDocs.length === 0 ? (
            <div className="text-[11px] text-slate-400 dark:text-gray-500 italic px-1">
              Sin documentos recientes
            </div>
          ) : (
            recentDocs.map((doc) => (
              <a
                key={doc.id}
                href={doc.fileUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 hover:border-indigo-500/50 transition group shadow-sm"
                title={`Descargar ${doc.fileName}`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-1">
                  <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-medium truncate group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                    {doc.fileName}
                  </span>
                </div>
                <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0 transition-colors" />
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
