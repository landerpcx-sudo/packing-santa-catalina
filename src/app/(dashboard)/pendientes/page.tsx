'use client'

import { useState, useEffect } from 'react'
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronRight,
  Package,
  Truck,
  FileText,
  Eye,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  MessageCircle,
  Copy,
  CheckCheck,
  CheckSquare,
  Square,
  ShieldCheck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import ValidationModal from '@/components/lotes/ValidationModal'
import FilePreviewModal from '@/components/layout/FilePreviewModal'
import { useToast } from '@/components/layout/Toast'
import { useAuth } from '@/context/AuthContext'

interface DocItem {
  id: string
  document_type: string
  status: string
  validation_status: string
  original_file_name: string
  storage_url?: string | null
  drive_file_url?: string | null
}

interface PendingData {
  lots: any[]
  dispatches: any[]
  missing_temperatures: string[]
  users: any[]
  total: number
}

// ── clave única para identificar un doc en la selección
function docKey(id: string, table: string) { return `${table}::${id}` }

export default function PendientesPage() {
  const { user } = useAuth()
  const [data, setData] = useState<PendingData>({ lots: [], dispatches: [], missing_temperatures: [], users: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'lots' | 'dispatches'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  // Selección múltiple
  const [selected, setSelected] = useState<Map<string, { id: string; table: string }>>(new Map())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Preview modal
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)

  // Validation modal (individual)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; name: string; table: string } | null>(null)

  // ─── WhatsApp ──────────────────────────────────────────
  const buildWhatsAppMessage = () => {
    const fechaHoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    
    // Obtener nombres dinámicos de los responsables con fallbacks
    const getResponsableName = (role: string, defaultName: string) => {
      if (!data.users || data.users.length === 0) return defaultName
      const found = data.users.find((u: any) => u.role === role)
      return found ? found.display_name : defaultName
    }

    const adminName = getResponsableName('admin', 'Lander Gamboa')
    const jefeFrioName = getResponsableName('jefe_frio', 'Diego Villarreal')
    const calidadName = getResponsableName('calidad', 'Deissy')
    const cuadraturaName = getResponsableName('cuadratura', 'Carla Lazo')
    const sagName = getResponsableName('sag', 'Javiera')

    const partes: string[] = []

    // 1. Procesar lotes
    const lotesTextos: string[] = []
    data.lots.forEach(l => {
      const loteTasks: string[] = []
      
      // Recepción
      if (l.reception_status === 'uploaded') {
        loteTasks.push(`  - 🔍 Validar Recepción ➜ *Responsable: Administrador ${adminName}* (Información ya subida)`)
      } else if (l.reception_status === 'observed') {
        loteTasks.push(`  - 📥 Corregir Recepción ➜ *Responsable: Jefe de frío ${jefeFrioName}* (Observado)`)
      } else if (l.reception_status === 'pending' || l.reception_status === 'late') {
        loteTasks.push(`  - 📥 Subir Informe de Recepción ➜ *Responsable: Jefe de frío ${jefeFrioName}*`)
      }

      // Calidad
      if (l.quality_status === 'uploaded') {
        loteTasks.push(`  - 🔍 Validar Calidad ➜ *Responsable: Administrador ${adminName}* (Información ya subida)`)
      } else if (l.quality_status === 'observed') {
        loteTasks.push(`  - 📥 Corregir Calidad ➜ *Responsable: Control de calidad ${calidadName}* (Observado)`)
      } else if (l.quality_status === 'pending' || l.quality_status === 'late') {
        loteTasks.push(`  - 📥 Subir Informe de Calidad ➜ *Responsable: Control de calidad ${calidadName}*`)
      }

      // Proceso
      if (l.process_status === 'uploaded') {
        loteTasks.push(`  - 🔍 Validar Proceso ➜ *Responsable: Administrador ${adminName}* (Información ya subida)`)
      } else if (l.process_status === 'observed') {
        loteTasks.push(`  - 📥 Corregir Proceso ➜ *Responsable: Cuadratura ${cuadraturaName}* (Observado)`)
      } else if (l.process_status === 'pending' || l.process_status === 'late') {
        loteTasks.push(`  - 📥 Subir Informe de Proceso ➜ *Responsable: Cuadratura ${cuadraturaName}*`)
      }

      if (loteTasks.length > 0) {
        lotesTextos.push(`• *Lote ${l.internal_code}* (${l.client || 'sin cliente'}):\n${loteTasks.join('\n')}`)
      }
    })

    if (lotesTextos.length > 0) {
      partes.push(`📦 *Lotes / Recepciones:*\n${lotesTextos.join('\n\n')}`)
    }

    // 2. Procesar despachos
    const despTextos: string[] = []
    data.dispatches.forEach(d => {
      const despTasks: string[] = []

      // Pack list
      if (d.pack_list_status === 'uploaded') {
        despTasks.push(`  - 🔍 Validar Packing List ➜ *Responsable: Administrador ${adminName}* (Información ya subida)`)
      } else if (d.pack_list_status === 'observed') {
        despTasks.push(`  - 📥 Corregir Packing List ➜ *Responsable: Contraparte SAG ${sagName}* (Observado)`)
      } else if (d.pack_list_status === 'pending' || d.pack_list_status === 'late') {
        despTasks.push(`  - 📥 Subir Packing List ➜ *Responsable: Contraparte SAG ${sagName}*`)
      }

      // Fotos y termógrafos
      const pendingPhotosDocs = pendingDocs(d.dispatch_documents || []).filter((doc: any) => 
        doc.document_type === 'pata_pata_photo' || doc.document_type === 'thermograph_photo'
      )
      
      if (d.photos_status === 'incomplete') {
        despTasks.push(`  - 📥 Subir Fotos y Termógrafos ➜ *Responsable: Jefe de frío ${jefeFrioName}*`)
      } else if (pendingPhotosDocs.length > 0) {
        despTasks.push(`  - 🔍 Validar Fotos de Despacho ➜ *Responsable: Administrador ${adminName}* (Información ya subida)`)
      }

      if (despTasks.length > 0) {
        despTextos.push(`• *Despacho ${d.internal_code}* (${d.client || 'sin cliente'}):\n${despTasks.join('\n')}`)
      }
    })

    if (despTextos.length > 0) {
      partes.push(`🚚 *Despachos:*\n${despTextos.join('\n\n')}`)
    }

    // 3. Procesar temperaturas
    if (data.missing_temperatures.length > 0) {
      const diasFormateados = data.missing_temperatures.map(dateStr => {
        const [y, m, d] = dateStr.split('-')
        return `${d}/${m}`
      }).join(', ')
      partes.push(`🌡️ *Temperaturas:*\n• ⚠️ Días sin registro (${diasFormateados}) ➜ *Responsable: Jefe de frío Diego Villarreal*`)
    }

    if (partes.length === 0) return null

    return `👋 *Hola equipo,*\n\nLes escribo cordialmente para recordarles el estado de las tareas y documentos pendientes al día de hoy *${fechaHoy}* en el sistema de control documental de *Packing Santa Catalina*:\n\n${partes.join('\n\n')}\n\nLes agradecemos mucho avanzar con sus respectivas tareas a la brevedad posible. Si tienen alguna dificultad o necesitan ayuda con la plataforma, no duden en consultarnos.\n\n¡Muchas gracias por su colaboración! 🙏`
  }

  const handleCopyWSP = () => {
    const msg = buildWhatsAppMessage()
    if (!msg) { toast.success('¡Todo está al día! No hay pendientes para notificar 🎉'); return }
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      toast.success('Mensaje copiado. ¡Pégalo en tu grupo de WhatsApp!')
      setTimeout(() => setCopied(false), 3000)
    }).catch(() => toast.error('No se pudo copiar. Intenta manualmente.'))
  }

  useEffect(() => { fetchPendientes() }, [])

  const fetchPendientes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pendientes')
      if (res.ok) { const d = await res.json(); setData(d.data) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // ─── Preview ──────────────────────────────────────────
  const openPreview = (doc: DocItem) => {
    const url = doc.storage_url || doc.drive_file_url
    if (!url) { toast.error('No hay URL de archivo para previsualizar.'); return }
    setPreviewFile({ url, name: doc.original_file_name })
  }

  // ─── Selección ────────────────────────────────────────
  const toggleDoc = (doc: DocItem, table: string) => {
    const key = docKey(doc.id, table)
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, { id: doc.id, table })
      return next
    })
  }

  const isSelected = (doc: DocItem, table: string) => selected.has(docKey(doc.id, table))

  // Seleccionar/deseleccionar todos los docs visibles de un grupo
  const toggleAllDocs = (docs: DocItem[], table: string) => {
    const allSelected = docs.every(d => isSelected(d, table))
    setSelected(prev => {
      const next = new Map(prev)
      docs.forEach(d => {
        const key = docKey(d.id, table)
        if (allSelected) next.delete(key)
        else next.set(key, { id: d.id, table })
      })
      return next
    })
  }

  const clearSelection = () => setSelected(new Map())

  // ─── Validación masiva ────────────────────────────────
  const handleBulkValidate = async () => {
    if (selected.size === 0) return
    if (!confirm(`¿Validar ${selected.size} documento(s) seleccionado(s)?`)) return
    setBulkLoading(true)
    try {
      const docs = Array.from(selected.values())
      const res = await fetch('/api/documentos/bulk-validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.userId || '',
          'x-user-role': user?.role || '',
        },
        body: JSON.stringify({ docs }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`✅ ${json.validated} documento(s) validados correctamente.`)
        clearSelection()
        fetchPendientes()
      } else {
        toast.error(json.error || 'Error al validar.')
      }
    } catch {
      toast.error('Error de conexión.')
    } finally {
      setBulkLoading(false)
    }
  }

  // Docs pendientes de cada entidad
  const pendingDocs = (docs: DocItem[]) => docs.filter(d => d.validation_status === 'pending')

  // Lotes y despachos que realmente tienen documentos pendientes de validar
  const lotsWithPending = data.lots.filter(l => pendingDocs(l.lot_documents || []).length > 0)
  const dispatchesWithPending = data.dispatches.filter(d => pendingDocs(d.dispatch_documents || []).length > 0)

  // ─── Filtros ──────────────────────────────────────────
  const filteredLots = lotsWithPending.filter(l =>
    l.internal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.client && l.client.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  const filteredDispatches = dispatchesWithPending.filter(d =>
    d.internal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.client && d.client.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Clock className="text-indigo-400" size={32} />
            Pendientes de Gestión
          </h1>
          <p className="text-gray-400 mt-1">Validación de documentos y alertas de cumplimiento operativo.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyWSP}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 border disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              backgroundColor: copied ? 'rgba(34,197,94,0.15)' : 'rgba(37,211,102,0.12)',
              borderColor: copied ? 'rgba(34,197,94,0.4)' : 'rgba(37,211,102,0.3)',
              color: copied ? '#86efac' : '#4ade80',
            }}
            title="Copiar mensaje de recordatorio para WhatsApp"
          >
            {copied ? <CheckCheck className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? '¡Copiado!' : 'Recordatorio WSP'}</span>
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por código o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 w-64 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Alerta temperaturas */}
      {data.missing_temperatures.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-500/20 rounded-2xl text-rose-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Incumplimiento en Temperaturas</h3>
              <p className="text-rose-400/80 text-sm mt-1 max-w-lg">
                Se han detectado {data.missing_temperatures.length} días sin registros de temperatura en la última semana.
                Esto afecta la trazabilidad de la cadena de frío.
              </p>
            </div>
          </div>
          <Link
            href="/temperaturas"
            className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-rose-600/20 flex items-center gap-2 text-sm whitespace-nowrap"
          >
            Ir al Calendario <ArrowRight size={18} />
          </Link>
        </div>
      )}

      {/* Stats tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveTab('all')}
          className={`p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${activeTab === 'all' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-500/5' : 'bg-[#0f172a] border-white/10 text-gray-400 hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Total Tareas</span>
            <AlertCircle className="w-5 h-5 opacity-50" />
          </div>
          <p className="text-4xl font-black text-white">{lotsWithPending.length + dispatchesWithPending.length}</p>
          <div className="absolute -bottom-2 -right-2 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Clock size={80} />
          </div>
        </button>
        <button
          onClick={() => setActiveTab('lots')}
          className={`p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${activeTab === 'lots' ? 'bg-emerald-600/10 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/5' : 'bg-[#0f172a] border-white/10 text-gray-400 hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Lotes</span>
            <Package className="w-5 h-5 opacity-50" />
          </div>
          <p className="text-4xl font-black text-white">{lotsWithPending.length}</p>
          <div className="absolute -bottom-2 -right-2 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Package size={80} />
          </div>
        </button>
        <button
          onClick={() => setActiveTab('dispatches')}
          className={`p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${activeTab === 'dispatches' ? 'bg-amber-600/10 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/5' : 'bg-[#0f172a] border-white/10 text-gray-400 hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Despachos</span>
            <Truck className="w-5 h-5 opacity-50" />
          </div>
          <p className="text-4xl font-black text-white">{dispatchesWithPending.length}</p>
          <div className="absolute -bottom-2 -right-2 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Truck size={80} />
          </div>
        </button>
      </div>

      {/* Barra flotante de selección masiva */}
      {selected.size > 0 && (
        <div className="sticky top-4 z-40 mx-auto max-w-2xl">
          <div className="bg-indigo-950/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-2xl shadow-indigo-950/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-white font-bold text-sm">
                {selected.size} documento{selected.size > 1 ? 's' : ''} seleccionado{selected.size > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                title="Cancelar selección"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleBulkValidate}
                disabled={bulkLoading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
              >
                {bulkLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ShieldCheck className="w-4 h-4" />
                }
                Validar todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Sincronizando tareas...</p>
          </div>
        ) : (lotsWithPending.length + dispatchesWithPending.length) === 0 ? (
          <div className="bg-[#0f172a] border border-dashed border-white/10 rounded-[3rem] p-24 text-center shadow-inner">
            <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Flujo de Trabajo Limpio</h3>
            <p className="text-gray-500 max-w-sm mx-auto text-sm font-medium">No hay documentos que requieran validación manual en este momento. ¡Excelente trabajo!</p>
          </div>
        ) : (
          <div className="space-y-10">

            {/* ── LOTES ── */}
            {(activeTab === 'all' || activeTab === 'lots') && filteredLots.length > 0 && (
              <section className="space-y-4 animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center gap-3 px-4 py-2 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-2xl">
                  <Package className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Documentos de Lotes ({filteredLots.length})</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredLots.map((lot) => {
                    const docs = pendingDocs(lot.lot_documents || [])
                    const allSel = docs.length > 0 && docs.every(d => isSelected(d, 'lot_documents'))
                    return (
                      <div key={lot.id} className="bg-[#0f172a] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl group hover:border-emerald-500/40 transition-all duration-300">
                        {/* Cabecera */}
                        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.01]">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-105 transition-transform">
                              <Package className="w-7 h-7" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-white tracking-tight">{lot.internal_code}</h3>
                                <span className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black uppercase">
                                  {lot.client || 'General'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 font-medium">{lot.display_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Seleccionar todos los docs del lote */}
                            {docs.length > 0 && (
                              <button
                                onClick={() => toggleAllDocs(docs, 'lot_documents')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all text-emerald-400 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15"
                                title={allSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
                              >
                                {allSel ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">Sel. todos</span>
                              </button>
                            )}
                            <Link
                              href={`/lotes/${lot.id}`}
                              className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-white transition-all uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:bg-indigo-600 hover:border-indigo-500"
                            >
                              Ver Lote <ChevronRight size={14} />
                            </Link>
                          </div>
                        </div>
                        {/* Documentos */}
                        <div className="p-4 bg-black/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {docs.map((doc: DocItem) => {
                            const sel = isSelected(doc, 'lot_documents')
                            const hasFile = !!(doc.storage_url || doc.drive_file_url)
                            return (
                              <div
                                key={doc.id}
                                onClick={() => toggleDoc(doc, 'lot_documents')}
                                className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all group/doc ${sel ? 'bg-indigo-500/15 border-indigo-500/50 ring-1 ring-indigo-500/30' : 'bg-[#1e293b]/50 border-white/5 hover:border-emerald-500/30 hover:bg-white/5'}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`p-2 rounded-xl transition-all flex-shrink-0 ${sel ? 'bg-indigo-600 text-white' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                    {sel ? <CheckSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{doc.original_file_name}</p>
                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">
                                      {doc.document_type === 'reception' ? 'Recepción' : doc.document_type === 'quality' ? 'Calidad' : doc.document_type === 'process' ? 'Proceso' : 'Otros'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  {hasFile && (
                                    <button
                                      onClick={() => openPreview(doc)}
                                      className="p-2 text-gray-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-all"
                                      title="Ver archivo"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setSelectedDoc({ id: doc.id, name: doc.original_file_name, table: 'lot_documents' }); setModalOpen(true) }}
                                    className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
                                    title="Validar / Observar individualmente"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── DESPACHOS ── */}
            {(activeTab === 'all' || activeTab === 'dispatches') && filteredDispatches.length > 0 && (
              <section className="space-y-4 animate-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-3 px-4 py-2 border-l-4 border-amber-500 bg-amber-500/5 rounded-r-2xl">
                  <Truck className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Documentos de Despachos ({filteredDispatches.length})</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredDispatches.map((dispatch) => {
                    const docs = pendingDocs(dispatch.dispatch_documents || [])
                    const allSel = docs.length > 0 && docs.every(d => isSelected(d, 'dispatch_documents'))
                    return (
                      <div key={dispatch.id} className="bg-[#0f172a] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl group hover:border-amber-500/40 transition-all duration-300">
                        {/* Cabecera */}
                        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.01]">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 group-hover:scale-105 transition-transform">
                              <Truck className="w-7 h-7" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-white tracking-tight">{dispatch.internal_code}</h3>
                                <span className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black uppercase">
                                  {dispatch.client || 'General'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 font-medium">
                                Estado: {dispatch.overall_status === 'pending' ? 'Pendiente' : dispatch.overall_status === 'uploaded' ? 'En Proceso (sin validar)' : dispatch.overall_status === 'observed' ? 'Observado' : 'Atrasado'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {docs.length > 0 && (
                              <button
                                onClick={() => toggleAllDocs(docs, 'dispatch_documents')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15"
                                title={allSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
                              >
                                {allSel ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">Sel. todos</span>
                              </button>
                            )}
                            <Link
                              href={`/despachos/${dispatch.id}`}
                              className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-white transition-all uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:bg-indigo-600 hover:border-indigo-500"
                            >
                              Ver Despacho <ChevronRight size={14} />
                            </Link>
                          </div>
                        </div>
                        {/* Documentos */}
                        <div className="p-4 bg-black/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {docs.map((doc: DocItem) => {
                            const sel = isSelected(doc, 'dispatch_documents')
                            const hasFile = !!(doc.storage_url || doc.drive_file_url)
                            return (
                              <div
                                key={doc.id}
                                onClick={() => toggleDoc(doc, 'dispatch_documents')}
                                className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all group/doc ${sel ? 'bg-indigo-500/15 border-indigo-500/50 ring-1 ring-indigo-500/30' : 'bg-[#1e293b]/50 border-white/5 hover:border-amber-500/30 hover:bg-white/5'}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`p-2 rounded-xl transition-all flex-shrink-0 ${sel ? 'bg-indigo-600 text-white' : 'bg-amber-500/10 text-amber-400'}`}>
                                    {sel ? <CheckSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{doc.original_file_name}</p>
                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">Pack List / Guía</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  {hasFile && (
                                    <button
                                      onClick={() => openPreview(doc)}
                                      className="p-2 text-gray-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-all"
                                      title="Ver archivo"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setSelectedDoc({ id: doc.id, name: doc.original_file_name, table: 'dispatch_documents' }); setModalOpen(true) }}
                                    className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
                                    title="Validar / Observar individualmente"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                          {docs.length === 0 && (
                            <p className="text-gray-600 text-xs col-span-3 text-center py-2">No hay documentos pendientes de validación en este despacho.</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Modales */}
      {selectedDoc && (
        <ValidationModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setSelectedDoc(null) }}
          docId={selectedDoc.id}
          docName={selectedDoc.name}
          tableName={selectedDoc.table}
          onValidated={() => { fetchPendientes() }}
        />
      )}

      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
      />
    </div>
  )
}
