'use client'

import { useState, useEffect } from 'react'
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  ChevronRight, 
  Package, 
  Truck, 
  Thermometer,
  FileText,
  Eye,
  Check,
  X,
  Loader2,
  Calendar,
  User,
  AlertCircle,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'
import ValidationModal from '@/components/lotes/ValidationModal'

interface PendingData {
  lots: any[]
  dispatches: any[]
  missing_temperatures: string[]
  total: number
}

export default function PendientesPage() {
  const [data, setData] = useState<PendingData>({ lots: [], dispatches: [], missing_temperatures: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'lots' | 'dispatches'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string, name: string, table: string } | null>(null)

  useEffect(() => {
    fetchPendientes()
  }, [])

  const fetchPendientes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pendientes')
      if (res.ok) {
        const d = await res.json()
        setData(d.data)
      }
    } catch (err) {
      console.error('Error fetching pending documents:', err)
    } finally {
      setLoading(false)
    }
  }

  const openValidation = (id: string, name: string, type: 'lots' | 'dispatches') => {
    const table = type === 'lots' ? 'lot_documents' : 'dispatch_documents'
    setSelectedDoc({ id, name, table })
    setModalOpen(true)
  }

  const filteredLots = data.lots.filter(l => 
    l.internal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.client && l.client.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const filteredDispatches = data.dispatches.filter(d => 
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

      {/* Alertas de Cumplimiento (Temperaturas) */}
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

      {/* Tabs / Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => setActiveTab('all')}
          className={`p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${activeTab === 'all' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-500/5' : 'bg-[#0f172a] border-white/10 text-gray-400 hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Total Tareas</span>
            <AlertCircle className="w-5 h-5 opacity-50" />
          </div>
          <p className="text-4xl font-black text-white">{data.lots.length + data.dispatches.length}</p>
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
          <p className="text-4xl font-black text-white">{data.lots.length}</p>
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
          <p className="text-4xl font-black text-white">{data.dispatches.length}</p>
          <div className="absolute -bottom-2 -right-2 p-4 opacity-5 group-hover:scale-110 transition-transform">
             <Truck size={80} />
          </div>
        </button>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Sincronizando tareas...</p>
          </div>
        ) : (data.lots.length + data.dispatches.length) === 0 ? (
          <div className="bg-[#0f172a] border border-dashed border-white/10 rounded-[3rem] p-24 text-center shadow-inner">
            <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Flujo de Trabajo Limpio</h3>
            <p className="text-gray-500 max-w-sm mx-auto text-sm font-medium">No hay documentos que requieran validación manual en este momento. ¡Excelente trabajo!</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* LOTES SECTION */}
            {(activeTab === 'all' || activeTab === 'lots') && filteredLots.length > 0 && (
              <section className="space-y-4 animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center gap-3 px-4 py-2 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-2xl">
                  <Package className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Documentos de Lotes ({filteredLots.length})</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredLots.map((lot) => (
                    <div key={lot.id} className="bg-[#0f172a] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl group hover:border-emerald-500/40 transition-all duration-300">
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
                        <Link 
                          href={`/lotes/${lot.id}`}
                          className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-white transition-all uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:bg-indigo-600 hover:border-indigo-500"
                        >
                          Ver Lote <ChevronRight size={14} />
                        </Link>
                      </div>
                      <div className="p-4 bg-black/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {lot.lot_documents.filter((d: any) => d.validation_status === 'pending').map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-4 bg-[#1e293b]/50 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group/doc">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover/doc:bg-indigo-600 group-hover/doc:text-white transition-all">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{doc.original_file_name}</p>
                                <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-1">
                                  {doc.document_type === 'reception' ? 'Recepción' : 
                                   doc.document_type === 'quality' ? 'Calidad' : 
                                   doc.document_type === 'process' ? 'Proceso' : 'Otros'}
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={() => openValidation(doc.id, doc.original_file_name, 'lots')}
                              className="p-2.5 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-lg shadow-blue-500/0 hover:shadow-blue-500/20"
                              title="Validar Documento"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* DISPATCHES SECTION */}
            {(activeTab === 'all' || activeTab === 'dispatches') && filteredDispatches.length > 0 && (
              <section className="space-y-4 animate-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-3 px-4 py-2 border-l-4 border-amber-500 bg-amber-500/5 rounded-r-2xl">
                  <Truck className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Documentos de Despachos ({filteredDispatches.length})</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredDispatches.map((dispatch) => (
                    <div key={dispatch.id} className="bg-[#0f172a] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl group hover:border-amber-500/40 transition-all duration-300">
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
                            <p className="text-sm text-gray-500 font-medium">Estado General: {dispatch.overall_status === 'pending' ? 'Pendiente' : dispatch.overall_status === 'observed' ? 'Observado' : 'Atrasado'}</p>
                          </div>
                        </div>
                        <Link 
                          href={`/despachos/${dispatch.id}`}
                          className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-white transition-all uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:bg-indigo-600 hover:border-indigo-500"
                        >
                          Ver Despacho <ChevronRight size={14} />
                        </Link>
                      </div>
                      <div className="p-4 bg-black/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dispatch.dispatch_documents?.filter((d: any) => d.validation_status === 'pending').map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-4 bg-[#1e293b]/50 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group/doc">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl group-hover/doc:bg-amber-600 group-hover/doc:text-white transition-all">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{doc.original_file_name}</p>
                                <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-1">Pack List / Guía</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => openValidation(doc.id, doc.original_file_name, 'dispatches')}
                              className="p-2.5 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-lg shadow-blue-500/0 hover:shadow-blue-500/20"
                              title="Validar Documento"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Validation Modal */}
      {selectedDoc && (
        <ValidationModal 
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false)
            setSelectedDoc(null)
          }}
          docId={selectedDoc.id}
          docName={selectedDoc.name}
          tableName={selectedDoc.table}
          onValidated={() => {
            fetchPendientes()
          }}
        />
      )}
    </div>
  )
}
