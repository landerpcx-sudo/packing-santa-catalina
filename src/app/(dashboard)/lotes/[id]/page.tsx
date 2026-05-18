'use client'

import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
  ArrowLeft, FileText, CheckCircle, Clock, AlertCircle, Check,
  XCircle, Image as ImageIcon, FolderOpen, Calendar,
  RefreshCw, Package, ExternalLink, Lock, ShieldAlert, Download, Eye, Trash2, Edit2, Info, Cloud
} from 'lucide-react'
import UploadZone from '@/components/lotes/UploadZone'
import NewLotModal from '@/components/lotes/NewLotModal'
import InlineValidation from '@/components/lotes/InlineValidation'
import ValidationModal from '@/components/lotes/ValidationModal'
import FilePreviewModal from '@/components/layout/FilePreviewModal'

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
  drive_folder_id: string | null
  drive_folder_url: string | null
  created_at: string
  lot_documents?: LotDocument[]
}

interface LotDocument {
  id: string
  document_type: string
  original_file_name: string
  drive_file_url: string | null
  version_number: number
  is_correction: boolean
  status: string
  validation_status: string
  observation: string | null
  created_at: string
  storage_url: string | null
  uploaded_by_user?: { display_name: string }
  validated_by_user?: { display_name: string } | null
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

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  dotColor: 'bg-red-500',  textColor: 'text-red-400',    icon: <Clock className="w-4 h-4" /> },
  uploaded:  { label: 'Subido',     dotColor: 'bg-yellow-400',textColor: 'text-yellow-400', icon: <UploadIcon className="w-4 h-4" /> },
  validated: { label: 'Aprobado',   dotColor: 'bg-green-400', textColor: 'text-green-400',  icon: <CheckCircle className="w-4 h-4" /> },
  observed:  { label: 'Observado',  dotColor: 'bg-yellow-400',textColor: 'text-yellow-400', icon: <AlertCircle className="w-4 h-4" /> },
  late:      { label: 'Atrasado',   dotColor: 'bg-red-500',   textColor: 'text-red-400',    icon: <XCircle className="w-4 h-4" /> },
}

function UploadIcon(props: any) { return <div {...props}>⬆️</div> }

const DocTypeConfig: Record<string, { label: string; color: string }> = {
  reception:    { label: 'Informe Recepción',   color: 'text-blue-400' },
  quality:      { label: 'Control Calidad',     color: 'text-purple-400' },
  process:      { label: 'Informe Proceso',     color: 'text-orange-400' },
  photo_process:{ label: 'Fotos Proceso',       color: 'text-pink-400' },
  backup:       { label: 'Respaldo',            color: 'text-gray-400' },
  other:        { label: 'Otro',                color: 'text-gray-400' },
}

import { useRouter } from 'next/navigation'

export default function LoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const router = useRouter()
  const [lot, setLot] = useState<Lot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [valModal, setValModal] = useState<{isOpen: boolean, docId: string, docName: string, tableName: string} | null>(null)
  const [validatingDocId, setValidatingDocId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ isOpen: boolean; url: string; name: string } | null>(null)

  const checkDriveConnection = async () => {
    try {
      const res = await fetch('/api/settings/drive-status')
      const json = await res.json()
      setDriveConnected(json.connected)
    } catch (e) {}
  }

  const fetchLot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    const res = await fetch(`/api/lotes/${id}`)
    if (res.ok) {
      const json = await res.json()
      setLot(json.data)
    }
    setLoading(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => { 
    fetchLot(false) 
    checkDriveConnection()
  }, [fetchLot])

  const handleDeleteDocument = async (docId: string, tableName: string) => {
    if (lot?.overall_status === 'closed') {
      alert('No se pueden eliminar documentos de un lote cerrado.')
      return
    }
    if (!confirm('¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer.')) return
    
    try {
      const res = await fetch(`/api/documentos/${tableName}/${docId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': user?.userId || '',
          'x-user-role': user?.role || ''
        }
      })
      if (res.ok) fetchLot(true)
      else alert('Error al eliminar')
    } catch (e) { alert('Error de conexión') }
  }

  const handleDeleteLot = async () => {
    const confirmation = prompt('🛑 ¡ADVERTENCIA CRÍTICA!\n\n¿Estás seguro de que deseas ELIMINAR ESTE LOTE COMPLETAMENTE?\n\nEsta acción:\n1. Borrará el registro de la Base de Datos.\n2. Enviará la carpeta de Google Drive a la papelera.\n3. Es irreversible.\n\nEscribe "ELIMINAR" en mayúsculas para confirmar:')
    
    if (confirmation !== 'ELIMINAR') {
      alert('Eliminación cancelada.')
      return
    }

    try {
      const res = await fetch(`/api/lotes/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) {
        alert('Lote eliminado con éxito.')
        router.push('/lotes')
      } else {
        const data = await res.json()
        alert(data.error || 'Error al eliminar el lote.')
      }
    } catch (e) {
      alert('Error de conexión al intentar eliminar.')
    }
  }

  const handleCloseLot = async () => {
    if (!confirm('¿Estás seguro de cerrar este lote definitivamente? Ya no se podrán subir ni modificar documentos.')) return
    try {
      const res = await fetch(`/api/lotes/${id}/cerrar`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) fetchLot(true)
      else { const data = await res.json(); alert(data.error || 'Error al cerrar') }
    } catch (e) { alert('Error de conexión') }
  }

  const handleOpenLot = async () => {
    if (!confirm('¿Estás seguro de reabrir este lote? Se podrán volver a subir y modificar documentos.')) return
    try {
      const res = await fetch(`/api/lotes/${id}/abrir`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) fetchLot(true)
      else { const data = await res.json(); alert(data.error || 'Error al reabrir') }
    } catch (e) { alert('Error de conexión') }
  }

  if (loading) return <div className="flex items-center justify-center h-64 gap-3 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin" /> Cargando...</div>
  if (!lot) return <div className="text-center py-16 text-gray-400">Lote no encontrado.</div>

  const docsByType = (lot.lot_documents || []).reduce((acc, doc) => {
    if (!acc[doc.document_type]) acc[doc.document_type] = []
    acc[doc.document_type].push(doc)
    return acc
  }, {} as Record<string, LotDocument[]>)

  const stages = [
    { key: 'reception', label: 'Informe de Recepción', status: lot.reception_status, deadline: lot.reception_deadline, docType: 'reception', docLabel: 'Informe de Recepción (PDF)', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] } },
    { key: 'quality', label: 'Control de Calidad', status: lot.quality_status, deadline: lot.quality_deadline, docType: 'quality', docLabel: 'Informe de Calidad (PDF)', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] } },
    { key: 'process', label: 'Informe de Proceso', status: lot.process_status, deadline: lot.process_deadline, docType: 'process', docLabel: 'Informe de Proceso (PDF)', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] } },
  ]

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return '—'
    const d = new Date(deadline)
    const diff = Math.round((d.getTime() - Date.now()) / 3600000)
    return diff < 0 ? `⚠ Vencido hace ${Math.abs(diff)}h` : diff < 24 ? `Vence en ${diff}h` : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <ValidationModal isOpen={valModal?.isOpen || false} onClose={() => setValModal(null)} docId={valModal?.docId || ''} docName={valModal?.docName || ''} tableName={valModal?.tableName || ''} onValidated={() => fetchLot(true)} />
      
      <div>
        <Link href="/lotes" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-4"><ArrowLeft className="w-4 h-4" /> Volver a Lotes</Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center"><Package className="w-6 h-6 text-green-400" /></div>
            <div><h1 className="text-2xl font-bold text-white">{lot.display_name}</h1><p className="text-gray-400 text-sm">{lot.internal_code}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {lot.drive_folder_url && (user?.role === 'admin' || user?.canViewDrive) && (
              <a
                href={lot.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white text-sm transition-all"
                title="Abrir carpeta en Google Drive"
              >
                <Cloud className="w-4 h-4 text-blue-400" />
                Carpeta en Drive
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <a href={`/api/lotes/${lot.id}/download-all`} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 hover:bg-blue-500/20 transition-all text-sm"><Download className="w-4 h-4" /> Descargar Todo</a>
            {(lot.overall_status === 'complete' || lot.overall_status === 'validated') && user?.role === 'admin' && (
              <button onClick={handleCloseLot} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400 hover:bg-orange-500/20 text-sm font-medium transition-all"><Lock className="w-4 h-4" /> Cerrar Lote</button>
            )}
            {lot.overall_status === 'closed' && user?.role === 'admin' && (
              <button onClick={handleOpenLot} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 hover:bg-green-500/20 text-sm font-medium transition-all"><FolderOpen className="w-4 h-4" /> Abrir Lote</button>
            )}
            {user?.role === 'admin' && lot.overall_status !== 'closed' && (
              <button onClick={() => setShowEditModal(true)} className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-indigo-400" title="Editar Información"><Edit2 className="w-4 h-4" /></button>
            )}
            {user?.role === 'admin' && (
              <button onClick={handleDeleteLot} className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all" title="Eliminar Lote Permanentemente"><Trash2 className="w-4 h-4" /></button>
            )}
            <button onClick={() => fetchLot(true)} className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-all"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
      </div>

      {lot.overall_status === 'closed' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-gray-500" />
            <div><p className="text-sm font-medium text-white">Lote Cerrado para Auditoría</p><p className="text-xs text-gray-400">Los documentos han sido sellados.</p></div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-gray-200 font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-green-400" />
          Documentos Requeridos
        </h2>

        {stages.map((stage) => {
          const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.pending
          const stageDocs = docsByType[stage.docType] || []
          const isOverdue = stage.deadline && new Date(stage.deadline) < new Date() && stage.status === 'pending'

          return (
            <div
              key={stage.key}
              className={`bg-white/3 border rounded-2xl overflow-hidden transition-all
                ${isOverdue ? 'border-red-500/30' : 'border-white/8'}
              `}
            >
              {/* Header etapa */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${cfg.dotColor} ${stage.status === 'late' ? 'animate-pulse' : ''}`} />
                  <div>
                    <p className="text-white font-semibold text-sm">{stage.label}</p>
                    <p className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                      Plazo: {formatDeadline(stage.deadline)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                    stage.status === 'pending' ? 'border-gray-700 text-gray-400 bg-gray-500/10' :
                    stage.status === 'uploaded' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-400/10' :
                    stage.status === 'validated' ? 'border-green-500/30 text-green-400 bg-green-400/10' :
                    stage.status === 'observed' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-400/10' :
                    'border-red-500/30 text-red-400 bg-red-400/10'
                  }`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              </div>

              {/* Contenido etapa */}
              <div className="p-5 space-y-4">
                {/* Documentos subidos */}
                {stageDocs.length > 0 && (
                  <div className="space-y-2">
                    {stageDocs.sort((a,b) => b.version_number - a.version_number).map((doc, index) => {
                      const isLatest = index === 0 && stageDocs.length > 1
                      return (
                        <div 
                          key={doc.id} 
                          className={`flex flex-col gap-2 border rounded-xl px-4 py-3 transition-all
                            ${isLatest ? 'bg-green-500/5 border-green-500/30 ring-1 ring-green-500/10' : 'bg-white/3 border-white/5'}
                          `}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className={`w-4 h-4 flex-shrink-0 ${isLatest ? 'text-green-400' : 'text-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${isLatest ? 'text-green-100' : 'text-white'}`}>
                                {doc.original_file_name}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className={`text-[11px] ${isLatest ? 'text-green-400/70' : 'text-gray-500'}`}>
                                  v{doc.version_number} • {doc.uploaded_by_user?.display_name || 'Sistema'} • {formatDate(doc.created_at)}
                                </p>
                                {isLatest && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Actual</span>}
                              </div>
                            </div>
                            {doc.is_correction && (
                              <span className="text-orange-400 text-[10px] bg-orange-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Corrección
                              </span>
                            )}
                          {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive || !doc.storage_url) ? (
                            <button
                              onClick={() => {
                                const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(doc.original_file_name)
                                setPreviewFile({ 
                                  isOpen: true, 
                                  url: (isImage && doc.storage_url) ? doc.storage_url : doc.drive_file_url!, 
                                  name: doc.original_file_name 
                                })
                              }}
                              className={`${!doc.storage_url ? 'text-amber-400' : 'text-blue-400'} hover:opacity-80 flex-shrink-0 flex items-center gap-1`}
                              title={!doc.storage_url ? "Archivo Archivado en Drive" : "Ver en Google Drive"}
                            >
                              <Eye className="w-4 h-4" />
                              {!doc.storage_url && <span className="text-[10px] font-bold">DRIVE</span>}
                            </button>
                          ) : doc.storage_url ? (
                            <button
                              onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })}
                              className="text-gray-400 hover:text-white flex-shrink-0"
                              title="Ver en Visor Alternativo (Supabase)"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="text-gray-600 flex items-center gap-1" title="Archivo no disponible en este momento">
                              <XCircle className="w-4 h-4" />
                            </div>
                          )}
                            {user?.role === 'admin' && lot.overall_status !== 'closed' && (
                              <button
                                onClick={() => handleDeleteDocument(doc.id, 'lot_documents')}
                                className="text-red-400 hover:text-red-300 p-1 hover:bg-red-400/10 rounded flex-shrink-0"
                                title="Eliminar registro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Validaciones */}
                          {doc.status !== 'validated' && lot.overall_status !== 'closed' && user?.role === 'admin' && (
                            <div className="mt-1 border-t border-white/5 pt-2">
                              {validatingDocId === doc.id ? (
                                <InlineValidation 
                                  docId={doc.id}
                                  tableName="lot_documents"
                                  onValidated={() => fetchLot(true)}
                                  onCancel={() => setValidatingDocId(null)}
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setValidatingDocId(doc.id)}
                                    className="text-xs px-3 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-1.5 font-medium"
                                  >
                                    <Check className="w-3 h-3" />
                                    Validar / Observar
                                  </button>
                                  {doc.status === 'observed' && doc.observation && (
                                    <div className="text-xs text-yellow-400 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Observado: <span className="text-yellow-400/80 italic">{doc.observation}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {doc.status === 'validated' && (
                            <div className="flex items-center gap-1.5 mt-1 border-t border-white/5 pt-2 text-xs text-green-400">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Validado por {doc.validated_by_user?.display_name || 'Admin'}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Zona de subida */}
                {lot.overall_status !== 'closed' && ['admin', 'jefe_frio', 'calidad', 'cuadratura'].includes(user?.role || '') && (
                  <UploadZone
                    lotId={lot.id}
                    lotCode={lot.internal_code}
                    documentType={stage.docType}
                    documentLabel={stage.docLabel}
                    accept={stage.accept}
                    onUploadSuccess={() => fetchLot(true)}
                  />
                )}

              </div>
            </div>
          )
        })}
      </div>

      {docsByType['backup'] && docsByType['backup'].length > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <h3 className="text-gray-300 font-medium text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Respaldos y Otros
          </h3>
          {docsByType['backup'].map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300 text-sm flex-1 truncate">{doc.original_file_name}</span>
              {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive) ? (
                <a href={doc.drive_file_url} target="_blank" rel="noopener noreferrer" className="text-blue-400" title="Ver en Google Drive">
                  <Eye className="w-3.5 h-3.5" />
                </a>
              ) : (
                <a href={doc.storage_url || '#'} target="_blank" rel="noopener noreferrer" className="text-gray-400" title="Ver en Supabase">
                  <Eye className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {showEditModal && (
        <NewLotModal 
          initialData={lot} 
          onClose={() => setShowEditModal(false)} 
          onSuccess={() => fetchLot(true)} 
        />
      )}

      <FilePreviewModal
        isOpen={previewFile?.isOpen || false}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
      />
    </div>
  )
}
