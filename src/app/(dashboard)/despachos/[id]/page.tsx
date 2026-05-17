'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
  ArrowLeft, Truck, CheckCircle, Clock, AlertCircle, Check,
  XCircle, FileText, RefreshCw, ExternalLink, FolderOpen,
  Calendar, User, MapPin, Building2, Package, Image as ImageIcon, Trash2, Edit2, Download, Eye, Lock, ShieldAlert
} from 'lucide-react'
import ValidationModal from '@/components/lotes/ValidationModal'
import PalletUploadZone from '@/components/despachos/PalletUploadZone'
import UploadZone from '@/components/lotes/UploadZone' // General UploadZone
import NewDispatchModal from '@/components/despachos/NewDispatchModal'
import InlineValidation from '@/components/lotes/InlineValidation'
import FilePreviewModal from '@/components/layout/FilePreviewModal'

interface DispatchDocument {
  id: string
  document_type: string
  original_file_name: string
  version_number: number
  drive_file_url: string | null
  status: string
  validation_status: string
  observation: string | null
  created_at: string
  storage_url: string | null
  uploaded_by_user?: { display_name: string } | null
  validated_by_user?: { display_name: string } | null
}

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
  overall_status: string
  drive_folder_url: string | null
  created_at: string
  created_by_user?: { display_name: string } | null
  dispatch_documents?: DispatchDocument[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',      icon: <Clock className="w-4 h-4" /> },
  uploaded:  { label: 'En Proceso', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',      icon: <Package className="w-4 h-4" /> },
  validated: { label: 'Validado',   color: 'text-green-400 bg-green-500/10 border-green-500/30',   icon: <CheckCircle className="w-4 h-4" /> },
  observed:  { label: 'Observado',  color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: <AlertCircle className="w-4 h-4" /> },
  late:      { label: 'Atrasado',   color: 'text-red-400 bg-red-500/10 border-red-500/30',         icon: <XCircle className="w-4 h-4" /> },
  complete:  { label: 'Completo',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle className="w-4 h-4" /> },
  closed:    { label: 'Cerrado',    color: 'text-gray-400 bg-white/5 border-white/10',             icon: <Lock className="w-4 h-4" /> },
}

export default function DispatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [dispatch, setDispatch] = useState<Dispatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [valModal, setValModal] = useState<{ isOpen: boolean; docId: string; docName: string; tableName: string } | null>(null)
  const [validatingDocId, setValidatingDocId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ isOpen: boolean; url: string; name: string } | null>(null)

  const fetchDispatch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    const res = await fetch(`/api/despachos/${id}`)
    if (res.ok) {
      const json = await res.json()
      setDispatch(json.data)
    }
    setLoading(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => {
    fetchDispatch(false)
  }, [fetchDispatch])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        Cargando despacho...
      </div>
    )
  }

  if (!dispatch) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Despacho no encontrado.</p>
        <Link href="/despachos" className="text-indigo-400 text-sm mt-2 inline-block hover:underline">
          Volver a Despachos
        </Link>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[dispatch.overall_status] || STATUS_CONFIG.pending
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  const handleDeleteDocument = async (docId: string, tableName: string) => {
    if (dispatch?.overall_status === 'closed') {
      alert('No se pueden eliminar documentos de un despacho cerrado.')
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
      
      if (res.ok) {
        fetchDispatch(true)
      } else {
        const data = await res.json()
        alert(data.error || 'Error al eliminar el documento')
      }
    } catch (e) {
      alert('Error de conexión al intentar eliminar')
    }
  }

  const handleCloseDispatch = async () => {
    if (!confirm('¿Estás seguro de cerrar este despacho definitivamente? Ya no se podrán subir ni modificar documentos.')) return
    try {
      const res = await fetch(`/api/despachos/${id}/cerrar`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) fetchDispatch(true)
      else { const data = await res.json(); alert(data.error || 'Error al cerrar') }
    } catch (e) { alert('Error de conexión') }
  }

  const handleOpenDispatch = async () => {
    if (!confirm('¿Estás seguro de reabrir este despacho? Se podrán volver a subir y modificar documentos.')) return
    try {
      const res = await fetch(`/api/despachos/${id}/abrir`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) fetchDispatch(true)
      else { const data = await res.json(); alert(data.error || 'Error al reabrir') }
    } catch (e) { alert('Error de conexión') }
  }

  const docsByType = (dispatch.dispatch_documents || []).reduce((acc, doc) => {
    if (!acc[doc.document_type]) acc[doc.document_type] = []
    acc[doc.document_type].push(doc)
    return acc
  }, {} as Record<string, DispatchDocument[]>)

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      {/* Barra de progreso sutil durante refresco silencioso */}
      <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden transition-opacity duration-500 ${refreshing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
      </div>
      <ValidationModal
        isOpen={valModal?.isOpen || false}
        onClose={() => setValModal(null)}
        docId={valModal?.docId || ''}
        docName={valModal?.docName || ''}
        tableName={valModal?.tableName || ''}
      onValidated={() => fetchDispatch(true)}   
      />

      {/* Breadcrumb */}
      <div>
        <Link href="/despachos" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Volver a Despachos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
              <Truck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Despacho {dispatch.dispatch_code}</h1>
              <p className="text-gray-400 text-sm flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(dispatch.dispatch_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
            {dispatch.drive_folder_url && (user?.role === 'admin' || user?.canViewDrive) && (
              <a
                href={dispatch.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white text-sm transition-all"
              >
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                Carpeta en Drive
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <a
              href={`/api/despachos/${dispatch.id}/download-all`}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 transition-all text-sm"
            >
              <Download className="w-4 h-4" />
              Descargar Todo (.zip)
            </a>
            {(dispatch.overall_status === 'complete' || dispatch.overall_status === 'validated') && user?.role === 'admin' && (
              <button
                onClick={handleCloseDispatch}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
                title="Cerrar Despacho Definitivamente"
              >
                <Lock className="w-4 h-4" />
                Cerrar Despacho
              </button>
            )}
            {dispatch.overall_status === 'closed' && user?.role === 'admin' && (
              <button
                onClick={handleOpenDispatch}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 hover:bg-green-500/20 transition-all text-sm font-medium"
                title="Abrir Despacho"
              >
                <FolderOpen className="w-4 h-4" />
                Abrir Despacho
              </button>
            )}
            {user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 transition-all"
                title="Editar Información"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => fetchDispatch(true)} className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {dispatch.overall_status === 'closed' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-gray-400">
            <ShieldAlert className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-white">Despacho Cerrado para Auditoría</p>
              <p className="text-xs">Los documentos han sido sellados. No se permiten nuevas subidas ni validaciones.</p>
            </div>
          </div>
        </div>
      )}

      {/* Info del despacho */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" />Cliente</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.client || '—'}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" />Destino</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.destination || '—'}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Package className="w-3 h-3" />Pallets</p>
          <p className="text-white font-medium text-sm">{dispatch.expected_pallets || '—'} Esperados</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><User className="w-3 h-3" />Creado por</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.created_by_user?.display_name || 'Sistema'}</p>
        </div>
      </div>

      {/* Grid de Documentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Columna Izquierda: Pack List y Fotos */}
        <div className="space-y-6">
          {/* Pack List */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Pack List
              </h3>
              <span className={`text-xs px-2 py-1 rounded-full border ${(docsByType['pack_list'] || []).length >= 1 ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-400 border-gray-500/30 bg-gray-500/10'}`}>
                {(docsByType['pack_list'] || []).length} / 1
              </span>
            </div>
            <div className="space-y-3 mb-4">
              {(docsByType['pack_list'] || []).sort((a,b) => b.version_number - a.version_number).map((doc, index) => {
                const isLatest = index === 0 && (docsByType['pack_list'] || []).length > 1
                return (
                  <div key={doc.id} className={`border rounded-xl p-3 transition-all ${isLatest ? 'bg-indigo-500/10 border-indigo-500/30 ring-1 ring-indigo-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-3 mb-1">
                      <FileText className={`w-4 h-4 flex-shrink-0 ${isLatest ? 'text-indigo-400' : 'text-gray-400'}`} />
                      <span className={`text-sm flex-1 truncate ${isLatest ? 'text-indigo-100 font-medium' : 'text-gray-300'}`}>{doc.original_file_name}</span>
                      <div className="flex items-center gap-2">
                        {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive || !doc.storage_url) ? (
                          <button onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} className={`${!doc.storage_url ? 'text-amber-400' : 'text-indigo-400'} p-1 hover:bg-white/5 rounded flex items-center gap-1`} title={!doc.storage_url ? "Archivo Archivado en Drive" : "Ver en Google Drive"}>
                            <Eye className="w-4 h-4" />
                            {!doc.storage_url && <span className="text-[10px] font-bold">DRIVE</span>}
                          </button>
                        ) : doc.storage_url ? (
                          <button onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} className="text-gray-400 p-1 hover:bg-white/5 rounded" title="Ver en Supabase">
                            <Eye className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-gray-600 p-1"><XCircle className="w-4 h-4" /></span>
                        )}
                        {user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
                          <button onClick={() => handleDeleteDocument(doc.id, 'dispatch_documents')} className="text-red-400 p-1 hover:bg-red-400/10 rounded" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <p className={`text-[10px] ${isLatest ? 'text-indigo-300' : 'text-gray-500'}`}>
                          v{doc.version_number} • {formatDateTime(doc.created_at)}
                        </p>
                        {isLatest && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Actual</span>}
                      </div>
                      {doc.status === 'validated' && (
                        <p className="text-[10px] text-green-400 flex items-center gap-1 font-medium">
                          <CheckCircle className="w-3 h-3" /> Validado
                        </p>
                      )}
                      {doc.status === 'observed' && (
                        <p className="text-[10px] text-yellow-400 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3 h-3" /> Observado
                        </p>
                      )}
                    </div>
                    {doc.status !== 'validated' && user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
                      <div className="mt-2">
                        {validatingDocId === doc.id ? (
                          <InlineValidation 
                            docId={doc.id}
                            tableName="dispatch_documents"
                            onValidated={() => fetchDispatch(true)}
                            onCancel={() => setValidatingDocId(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setValidatingDocId(doc.id)}
                            className="w-full py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-xs font-medium transition-colors border border-blue-500/20"
                          >
                            Validar / Observar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {dispatch.overall_status !== 'closed' && (
              <UploadZone
                lotId={id}
                lotCode={dispatch.dispatch_code}
                documentType="pack_list"
                documentLabel="Pack List"
                onUploadSuccess={() => fetchDispatch(true)}
                uploadUrl={`/api/despachos/${id}/upload`}
              />
            )}
          </div>

          {/* Fotos Pata Pata */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                Fotos Pata a Pata
              </h3>
              {(() => {
                const minPhotos = Math.ceil((dispatch.expected_pallets || 0) / 2)
                const isComplete = dispatch.pata_pata_photos_count >= minPhotos
                return (
                  <span className={`text-xs px-2 py-1 rounded-full border ${isComplete ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>
                    {dispatch.pata_pata_photos_count} / {minPhotos} mín.
                  </span>
                )
              })()}
            </div>
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto pr-1">
              {(docsByType['pata_pata_photo'] || []).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(doc => (
                <div key={doc.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between group transition-all hover:bg-white/10">
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-300 text-[11px] truncate">{doc.original_file_name}</span>
                    </div>
                    <span className="text-[9px] text-gray-500 ml-5">{formatDateTime(doc.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive || !doc.storage_url) ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} className={`${!doc.storage_url ? 'text-amber-400' : 'text-indigo-400'} p-1 hover:bg-white/10 rounded flex items-center gap-1`} title={!doc.storage_url ? "Archivo Archivado en Drive" : "Ver en Google Drive"}>
                        <Eye className="w-3.5 h-3.5" />
                        {!doc.storage_url && <span className="text-[9px] font-bold">DRIVE</span>}
                      </button>
                    ) : doc.storage_url ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} className="text-gray-400 p-1 hover:bg-white/10 rounded" title="Ver en Supabase">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-gray-600 p-1"><XCircle className="w-3.5 h-3.5" /></span>
                    )}
                    {user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
                      <button onClick={() => handleDeleteDocument(doc.id, 'dispatch_documents')} className="text-red-400 p-1 hover:bg-red-400/10 rounded" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dispatch.overall_status !== 'closed' && (
              <PalletUploadZone dispatchId={id} onUploadSuccess={() => fetchDispatch(true)} />
            )}
          </div>
        </div>

        {/* Columna Derecha: Termógrafos y Otros */}
        <div className="space-y-6">
          {/* Termógrafos */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                Fotos Termógrafos
              </h3>
              <span className={`text-xs px-2 py-1 rounded-full border ${dispatch.thermograph_photos_count >= 2 ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-400 border-gray-500/30 bg-gray-500/10'}`}>
                {dispatch.thermograph_photos_count} / 2
              </span>
            </div>
            <div className="space-y-3 mb-4">
              {(docsByType['thermograph_photo'] || []).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(doc => (
                <div key={doc.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between group transition-all hover:bg-white/10">
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-300 text-[11px] truncate">{doc.original_file_name}</span>
                    </div>
                    <span className="text-[9px] text-gray-500 ml-5">{formatDateTime(doc.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive || !doc.storage_url) ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} className={`${!doc.storage_url ? 'text-amber-400' : 'text-indigo-400'} p-1 hover:bg-white/10 rounded flex items-center gap-1`} title={!doc.storage_url ? "Archivo Archivado en Drive" : "Ver en Google Drive"}>
                        <Eye className="w-3.5 h-3.5" />
                        {!doc.storage_url && <span className="text-[9px] font-bold">DRIVE</span>}
                      </button>
                    ) : doc.storage_url ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} className="text-gray-400 p-1 hover:bg-white/10 rounded" title="Ver en Supabase">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-gray-600 p-1"><XCircle className="w-3.5 h-3.5" /></span>
                    )}
                    {user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
                      <button onClick={() => handleDeleteDocument(doc.id, 'dispatch_documents')} className="text-red-400 p-1 hover:bg-red-400/10 rounded" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dispatch.overall_status !== 'closed' && (
              <UploadZone
                lotId={id}
                lotCode={dispatch.dispatch_code}
                documentType="thermograph_photo"
                documentLabel="Foto Termógrafo"
                accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'] }}
                onUploadSuccess={() => fetchDispatch(true)}
                uploadUrl={`/api/despachos/${id}/upload`}
              />
            )}
          </div>

          {/* Respaldos */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h3 className="text-white font-medium text-sm mb-4 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              Otros / Respaldos
            </h3>
            <div className="space-y-3 mb-4">
              {(docsByType['backup'] || []).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(doc => (
                <div key={doc.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between group transition-all hover:bg-white/10">
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-300 text-[11px] truncate">{doc.original_file_name}</span>
                    </div>
                    <span className="text-[9px] text-gray-500 ml-5">{formatDateTime(doc.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.drive_file_url && (user?.role === 'admin' || user?.canViewDrive || !doc.storage_url) ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.drive_file_url!, name: doc.original_file_name })} className={`${!doc.storage_url ? 'text-amber-400' : 'text-indigo-400'} p-1 hover:bg-white/10 rounded flex items-center gap-1`} title={!doc.storage_url ? "Archivo Archivado en Drive" : "Ver en Google Drive"}>
                        <Eye className="w-3.5 h-3.5" />
                        {!doc.storage_url && <span className="text-[9px] font-bold">DRIVE</span>}
                      </button>
                    ) : doc.storage_url ? (
                      <button onClick={() => setPreviewFile({ isOpen: true, url: doc.storage_url!, name: doc.original_file_name })} className="text-gray-400 p-1 hover:bg-white/10 rounded" title="Ver en Supabase">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-gray-600 p-1"><XCircle className="w-3.5 h-3.5" /></span>
                    )}
                    {user?.role === 'admin' && dispatch.overall_status !== 'closed' && (
                      <button onClick={() => handleDeleteDocument(doc.id, 'dispatch_documents')} className="text-red-400 p-1 hover:bg-red-400/10 rounded" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dispatch.overall_status !== 'closed' && (
              <UploadZone
                lotId={id}
                lotCode={dispatch.dispatch_code}
                documentType="backup"
                documentLabel="Respaldo"
                onUploadSuccess={() => fetchDispatch(true)}
                uploadUrl={`/api/despachos/${id}/upload`}
              />
            )}
          </div>
        </div>

      </div>

      {showEditModal && (
        <NewDispatchModal
          initialData={dispatch}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => fetchDispatch(true)}
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
