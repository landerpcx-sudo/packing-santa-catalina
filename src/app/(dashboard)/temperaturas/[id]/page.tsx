'use client'

import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  ArrowLeft, Thermometer, CheckCircle, Clock, AlertCircle,
  XCircle, FileText, RefreshCw, ExternalLink, FolderOpen,
  Calendar, User, Cloud, Upload, Edit3, Save, Download,
  History, Info, Trash2
} from 'lucide-react'
import dynamic from 'next/dynamic'

const FilePreviewModal = dynamic(() => import('@/components/layout/FilePreviewModal'), { ssr: false })

interface TempDocument {
  id: string
  document_type: string
  original_file_name: string
  drive_file_url: string | null
  storage_url: string | null
  status: string
  created_at: string
  uploaded_by_user?: { display_name: string } | null
}

interface TemperatureReport {
  id: string
  internal_code: string
  report_date: string
  chamber: string | null
  client: string | null
  variety: string | null
  temperature_value: number | null
  status: string
  observation: string | null
  drive_folder_url: string | null
  created_at: string
  updated_at: string
  responsible?: { display_name: string } | null
  temperature_documents?: TempDocument[]
  no_fruit?: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',      icon: <Clock className="w-4 h-4" /> },
  uploaded:  { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',   icon: <Thermometer className="w-4 h-4" /> },
  validated: { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',   icon: <CheckCircle className="w-4 h-4" /> },
  observed:  { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',   icon: <AlertCircle className="w-4 h-4" /> },
  late:      { label: 'Atrasado',   color: 'text-red-400 bg-red-500/10 border-red-500/30',         icon: <XCircle className="w-4 h-4" /> },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  daily_report: 'Reporte Temperatura Diaria',
  photo: 'Foto Temperatura',
  backup: 'Respaldo / Otro',
}

// Zona de subida simple
function UploadZone({
  reportId, reportCode, docType, label, onSuccess
}: { reportId: string; reportCode: string; docType: string; label: string; onSuccess: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    let uploadFile = file
    // Si el archivo es una imagen (probablemente foto del celular), lo renombramos a un formato limpio
    if (uploadFile.type.startsWith('image/')) {
      const ext = uploadFile.name.split('.').pop() || 'jpg'
      const cleanLabel = label.replace(/Subir /i, '').replace(/ \(.*\)/, '') // Remove "Subir" and "(PDF, Excel)"
      const newName = `${cleanLabel} ${reportCode}.${ext}`
      uploadFile = new File([uploadFile], newName, { type: uploadFile.type })
    }

    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('document_type', docType)

    const res = await fetch(`/api/temperaturas/${reportId}/upload`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Error al subir')
    else onSuccess()
    setUploading(false)
  }

  return (
    <div>
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs mb-2">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer px-4 py-3 bg-white/3 border border-white/8 border-dashed rounded-xl hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group">
        {uploading ? (
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
        ) : (
          <Upload className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0" />
        )}
        <span className="text-gray-500 group-hover:text-gray-300 text-sm transition-colors">
          {uploading ? 'Subiendo...' : label}
        </span>
        <input
          type="file"
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          className="sr-only"
          disabled={uploading}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />
      </label>
    </div>
  )
}

export default function TemperatureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [report, setReport] = useState<TemperatureReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingTemp, setEditingTemp] = useState(false)
  const [tempValue, setTempValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ isOpen: boolean; url: string; name: string } | null>(null)

  const [editingInfo, setEditingInfo] = useState(false)
  const [clientValue, setClientValue] = useState('')
  const [varietyValue, setVarietyValue] = useState('')
  const [chamberValue, setChamberValue] = useState('')
  const [observationValue, setObservationValue] = useState('')
  const [noFruitValue, setNoFruitValue] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const router = useRouter()

  const fetchReport = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/temperaturas/${id}`)
    if (res.ok) {
      const json = await res.json()
      setReport(json.data)
      setTempValue(json.data?.temperature_value?.toString() || '')
      setClientValue(json.data?.client || '')
      setVarietyValue(json.data?.variety || '')
      setChamberValue(json.data?.chamber || '')
      setObservationValue(json.data?.observation || '')
      setNoFruitValue(json.data?.no_fruit || false)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { fetchReport() }, [fetchReport])

  const saveTemperature = async () => {
    setSaving(true)
    await fetch(`/api/temperaturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature_value: tempValue ? parseFloat(tempValue) : null }),
    })
    await fetchReport()
    setEditingTemp(false)
    setSaving(false)
  }

  const saveInfo = async () => {
    setSaving(true)
    await fetch(`/api/temperaturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: clientValue || null,
        variety: varietyValue || null,
        chamber: chamberValue || null,
        observation: observationValue || null,
        no_fruit: noFruitValue,
      }),
    })
    await fetchReport()
    setEditingInfo(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro de temperatura? Esta acción borrará también todos los archivos asociados en la base de datos y no se puede deshacer.')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/temperaturas/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        alert('Registro de temperatura eliminado exitosamente.')
        router.push('/temperaturas')
      } else {
        alert(data.error || 'Error al eliminar el registro.')
      }
    } catch (err) {
      console.error(err)
      alert('Error de conexión al eliminar.')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('¿Enviar este archivo a la papelera?\n\nEl archivo NO se borra: se guarda 30 días y puedes restaurarlo desde Configuración → Salud de los Documentos.')) {
      return
    }
    try {
      const res = await fetch(`/api/documentos/temperature_documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': user?.userId || '',
          'x-user-role': user?.role || ''
        }
      })
      if (res.ok) {
        await fetchReport()
      } else {
        const data = await res.json()
        alert(data.error || 'Error al eliminar el archivo.')
      }
    } catch (err) {
      console.error(err)
      alert('Error de conexión al eliminar.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <p className="font-medium animate-pulse">Cargando reporte técnico...</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center py-20 bg-[#0f172a] rounded-3xl border border-white/10 m-4">
        <AlertCircle size={48} className="text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 font-bold text-xl">Reporte no encontrado</p>
        <Link href="/temperaturas" className="text-blue-500 text-sm mt-4 inline-flex items-center gap-2 hover:underline">
          <ArrowLeft size={16} /> Volver al listado
        </Link>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const docsByType = (report.temperature_documents || []).reduce((acc, doc) => {
    if (!acc[doc.document_type]) acc[doc.document_type] = []
    acc[doc.document_type].push(doc)
    return acc
  }, {} as Record<string, TempDocument[]>)

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Link href="/temperaturas" className="inline-flex items-center gap-2 text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-all group">
          <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-white/10">
            <ArrowLeft size={14} />
          </div>
          Volver a Temperaturas
        </Link>
        
        <div className="flex items-center gap-2">
           {user?.role === 'admin' && (
             <button
               onClick={handleDelete}
               disabled={deleting}
               className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
             >
               <XCircle className="w-4 h-4" />
               {deleting ? 'Eliminando...' : 'Eliminar Registro'}
             </button>
           )}
           <button onClick={fetchReport} className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all">
             <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
           </button>
           {report.drive_folder_url && (user?.role === 'admin' || user?.canViewDrive) && (
              <a
                href={report.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
                title="Abrir carpeta en Google Drive"
              >
                <Cloud className="w-4 h-4 text-blue-400" />
                Ver en Google Drive
                <ExternalLink className="w-3 h-3 opacity-50" />
              </a>
            )}
           {['admin', 'jefe_frio'].includes(user?.role || '') && (report.temperature_documents || []).length > 0 && (
             <a
               href={`/api/temperaturas/${id}/download-all`}
               className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-blue-600/10 active:scale-95"
             >
               <Download className="w-4 h-4" />
               Descargar Todo (ZIP)
             </a>
           )}
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <Thermometer size={140} className="text-blue-500" />
         </div>
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex items-center gap-6">
               <div className="w-20 h-20 bg-blue-600/10 border border-blue-500/20 rounded-3xl flex items-center justify-center text-blue-400 shadow-inner">
                  <Thermometer size={40} />
               </div>
               <div>
                  <div className="flex items-center gap-3">
                     <h1 className="text-4xl font-black text-white tracking-tighter">{report.internal_code}</h1>
                     <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${cfg.color}`}>
                        {cfg.label}
                     </span>
                  </div>
                  <p className="text-gray-400 font-bold mt-2 flex items-center gap-2">
                     <Calendar size={16} className="text-indigo-400" />
                     Medición del día {formatDate(report.report_date)}
                  </p>
               </div>
            </div>
         </div>
      </div>

      {report.no_fruit && (
         <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 flex items-center gap-4 text-amber-400 animate-in fade-in duration-300">
            <Info className="flex-shrink-0 w-6 h-6 text-amber-500" />
            <div>
               <h4 className="font-bold text-sm text-white">Día Sin Fruta en Cámara</h4>
               <p className="text-xs text-amber-400/80 mt-0.5">
                  Este día fue registrado sin fruta en las cámaras (cámaras de frío apagadas y despacho completado). No afecta el cumplimiento semanal de documentación de temperaturas.
               </p>
            </div>
         </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content (Left) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Temperatura</span>
                  {['admin', 'jefe_frio'].includes(user?.role || '') && !report.no_fruit && (
                    <button onClick={() => setEditingTemp(true)} className="p-2 bg-white/5 rounded-xl text-gray-500 hover:text-blue-400 transition-all">
                       <Edit3 size={16} />
                    </button>
                  )}
               </div>
               {editingTemp ? (
                 <div className="flex items-center gap-2 animate-in fade-in duration-200">
                    <input
                      type="number"
                      step="0.1"
                      value={tempValue}
                      onChange={e => setTempValue(e.target.value)}
                      autoFocus
                      className="w-full bg-black/40 border-2 border-blue-500/50 rounded-2xl px-4 py-3 text-white text-2xl font-black focus:outline-none"
                    />
                    <button onClick={saveTemperature} disabled={saving} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20">
                      {saving ? <RefreshCw size={24} className="animate-spin" /> : <Save size={24} />}
                    </button>
                 </div>
               ) : report.no_fruit ? (
                 <div className="text-4xl font-black text-amber-500 uppercase tracking-wider flex items-end gap-2">
                    Sin Fruta
                 </div>
               ) : (
                 <div className="text-5xl font-black text-white flex items-end gap-2">
                    {report.temperature_value !== null ? report.temperature_value : '—'}
                    <span className="text-2xl text-blue-500 font-bold mb-1">°C</span>
                 </div>
               )}
            </div>

            <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-4">Ubicación / Cámara</span>
               <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/5 rounded-2xl text-indigo-400">
                     <FolderOpen size={24} />
                  </div>
                  <p className="text-xl font-bold text-white">{report.chamber || 'Cámara General'}</p>
               </div>
            </div>
          </div>

          {/* Document Sections */}
          <div className="space-y-4">
             <h2 className="text-lg font-bold text-white px-2 flex items-center gap-2">
                <FileText className="text-blue-500" />
                Archivos del Reporte
             </h2>

             {report.no_fruit ? (
               <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3">
                  <Info size={32} className="text-amber-500" />
                  <p className="text-sm font-bold text-white uppercase tracking-wider">No se requiere documentación</p>
                  <p className="text-xs text-gray-400 max-w-md">
                     Este día fue registrado sin fruta en las cámaras (cámaras de frío apagadas y despacho completado).
                  </p>
               </div>
             ) : (
               /* Dynamic Render of Document Types - solo reporte diario y foto */
               ['daily_report', 'photo'].map((type) => {
                const label = DOC_TYPE_LABELS[type]
                const docs = docsByType[type] || []
                return (
                  <div key={type} className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-lg">
                    <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                       <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{label}</h3>
                       <span className="text-[10px] font-black text-gray-500 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                          {docs.length} ARCHIVOS
                       </span>
                    </div>
                    <div className="p-6 space-y-4">
                       {docs.map(doc => (
                         <div key={doc.id} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-blue-500/30 transition-all">
                            <div className="flex items-center gap-4 min-w-0">
                               <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-all">
                                  <FileText size={20} />
                               </div>
                               <div className="min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{doc.original_file_name}</p>
                                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-0.5 flex items-center gap-1.5">
                                     <User size={10} /> {doc.uploaded_by_user?.display_name || 'Sistema'} · {new Date(doc.created_at).toLocaleString('es-CL')}
                                  </p>
                               </div>
                            </div>
                            <div className="flex items-center gap-2">
                               {doc.storage_url ? (
                                 <button 
                                   onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} 
                                   className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all" 
                                   title="Ver en Supabase"
                                 >
                                    <ExternalLink size={16} />
                                 </button>
                               ) : doc.drive_file_url ? (
                                 <button 
                                   onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} 
                                   className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl transition-all flex items-center gap-2 hover:bg-amber-500 hover:text-white" 
                                   title="Ver en Google Drive"
                                 >
                                    <ExternalLink size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Drive</span>
                                 </button>
                               ) : (
                                 <div className="p-2.5 text-gray-700" title="Archivo no disponible">
                                   <XCircle size={20} />
                                 </div>
                               )}

                               {user?.role === 'admin' && (
                                 <button 
                                   onClick={() => handleDeleteDocument(doc.id)} 
                                   className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all" 
                                   title="Eliminar archivo"
                                 >
                                    <Trash2 size={16} />
                                 </button>
                               )}
                            </div>
                         </div>
                       ))}
                       {['admin', 'jefe_frio'].includes(user?.role || '') && (
                         <UploadZone
                           reportId={id}
                           reportCode={report.internal_code}
                           docType={type}
                           label={`Subir ${label.toLowerCase()}`}
                           onSuccess={fetchReport}
                         />
                       )}
                    </div>
                  </div>
                )
               })
             )}

             {/* Sección Otros / Respaldos - siempre visible, sin validación ni conteo */}
             <div className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-lg">
               <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                 <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Otros / Respaldos</h3>
                 <span className="text-[10px] font-black text-gray-500 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                   {(docsByType['backup'] || []).length} ARCHIVOS
                 </span>
               </div>
               <div className="p-6 space-y-4">
                 {(docsByType['backup'] || []).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(doc => (
                   <div key={doc.id} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-indigo-500/30 transition-all">
                     <div className="flex items-center gap-4 min-w-0">
                       <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-all">
                         <FileText size={20} />
                       </div>
                       <div className="min-w-0">
                         <p className="text-sm font-bold text-white truncate">{doc.original_file_name}</p>
                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-0.5 flex items-center gap-1.5">
                           <User size={10} /> {doc.uploaded_by_user?.display_name || 'Sistema'} · {new Date(doc.created_at).toLocaleString('es-CL')}
                         </p>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                        {doc.storage_url ? (
                          <button 
                            onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} 
                            className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all" 
                            title="Ver en Supabase"
                          >
                            <ExternalLink size={16} />
                          </button>
                        ) : doc.drive_file_url ? (
                          <button 
                            onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} 
                            className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl transition-all flex items-center gap-2 hover:bg-amber-500 hover:text-white" 
                            title="Ver en Google Drive"
                          >
                            <ExternalLink size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Drive</span>
                          </button>
                        ) : null}

                        {user?.role === 'admin' && (
                          <button 
                            onClick={() => handleDeleteDocument(doc.id)} 
                            className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all" 
                            title="Eliminar archivo"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                   </div>
                 ))}
                 {(docsByType['backup'] || []).length === 0 && (
                   <p className="text-gray-600 text-sm italic text-center py-2">No hay archivos extra en esta sección.</p>
                 )}
                 {!['gerencia', 'agronomo'].includes(user?.role || '') && (
                   <UploadZone
                     reportId={id}
                     reportCode={report.internal_code}
                     docType="backup"
                     label="Subir archivo extra / respaldo"
                     onSuccess={fetchReport}
                   />
                 )}
               </div>
             </div>
          </div>
        </div>

        {/* Sidebar / Metadata (Right) */}
        <div className="space-y-6">
           {/* Info Card */}
           <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Info size={14} className="text-blue-500" />
                    Información Adicional
                 </h3>
                 {['admin', 'jefe_frio'].includes(user?.role || '') && !editingInfo && (
                    <button onClick={() => setEditingInfo(true)} className="p-2 bg-white/5 rounded-xl text-gray-500 hover:text-blue-400 transition-all" title="Editar Información">
                       <Edit3 size={16} />
                    </button>
                 )}
              </div>

              {editingInfo ? (
                 <div className="space-y-4 animate-in fade-in duration-200">
                    {report.no_fruit ? (
                       <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 space-y-3">
                          <div className="flex items-center gap-2.5">
                             <input
                                type="checkbox"
                                id="edit_no_fruit"
                                checked={!noFruitValue}
                                onChange={e => setNoFruitValue(!e.target.checked)}
                                className="w-4.5 h-4.5 rounded border-white/10 bg-black/40 text-blue-600 focus:ring-blue-500/50 cursor-pointer"
                             />
                             <label htmlFor="edit_no_fruit" className="text-xs font-bold text-gray-300 cursor-pointer select-none">
                                Re-activar y registrar temperaturas para este día
                             </label>
                          </div>
                          <p className="text-[10px] text-gray-500">
                             Al desactivar el estado "Sin fruta", el reporte volverá a requerir el ingreso de valores y subida de archivos diarios.
                          </p>
                       </div>
                    ) : (
                       <>
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Cliente Asociado</label>
                             <input
                                type="text"
                                value={clientValue}
                                onChange={e => setClientValue(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                                placeholder="Ej: The Growers"
                             />
                          </div>
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Variedad de Fruta</label>
                             <input
                                type="text"
                                value={varietyValue}
                                onChange={e => setVarietyValue(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                                placeholder="Ej: Limones"
                             />
                          </div>
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Ubicación / Cámara</label>
                             <input
                                type="text"
                                value={chamberValue}
                                onChange={e => setChamberValue(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                                placeholder="Ej: Rack"
                             />
                          </div>
                       </>
                    )}
                    <div>
                       <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Observaciones</label>
                       <textarea
                          value={observationValue}
                          onChange={e => setObservationValue(e.target.value)}
                          rows={3}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none"
                          placeholder="Notas..."
                       />
                    </div>
                    <div className="flex gap-2 pt-2">
                       <button
                          onClick={() => setEditingInfo(false)}
                          className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                       >
                          Cancelar
                       </button>
                       <button
                          onClick={saveInfo}
                          disabled={saving}
                          className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                       >
                          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Guardar
                       </button>
                    </div>
                 </div>
              ) : (
                 <div className="space-y-6">
                    <div>
                       <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Cliente Asociado</span>
                       <p className="text-white font-medium">{report.client || 'Registro General (Sin cliente)'}</p>
                    </div>
                    <div>
                       <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Variedad de Fruta</span>
                       <p className="text-white font-medium">{report.variety || 'No especificada'}</p>
                    </div>
                    <div>
                       <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Cámara / Ubicación</span>
                       <p className="text-white font-medium">{report.chamber || 'Cámara General'}</p>
                    </div>
                    <div>
                       <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-1">Observaciones</span>
                       <p className="text-gray-400 text-sm italic">{report.observation || 'Sin comentarios adicionales.'}</p>
                    </div>
                 </div>
              )}
           </div>

           {/* Audit / Timeline Card */}
           <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                 <History size={60} className="text-indigo-500" />
              </div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                 <History size={14} className="text-indigo-500" />
                 Registro de Auditoría
              </h3>
              <div className="space-y-4 relative">
                 <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-white/5" />
                 
                 <div className="flex gap-4 relative">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 z-10 shrink-0">
                       <Clock size={14} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-white uppercase tracking-widest">Creado en Sistema</p>
                       <p className="text-[11px] text-gray-500 font-bold mt-1">
                          {new Date(report.created_at).toLocaleString('es-CL')}
                       </p>
                    </div>
                 </div>

                 <div className="flex gap-4 relative">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 z-10 shrink-0">
                       <User size={14} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-white uppercase tracking-widest">Responsable</p>
                       <p className="text-[11px] text-gray-500 font-bold mt-1">
                          {report.responsible?.display_name || 'Sistema (Automático)'}
                       </p>
                    </div>
                 </div>

                 <div className="flex gap-4 relative">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 z-10 shrink-0">
                       <RefreshCw size={14} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-white uppercase tracking-widest">Última Modificación</p>
                       <p className="text-[11px] text-gray-500 font-bold mt-1">
                          {new Date(report.updated_at).toLocaleString('es-CL')}
                       </p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <FilePreviewModal
        isOpen={previewFile?.isOpen || false}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
      />
    </div>
  )
}
