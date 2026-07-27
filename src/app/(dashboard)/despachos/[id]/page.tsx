'use client'

import { useEffect, useState, useCallback, use, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
  ArrowLeft, Truck, CheckCircle, Clock, AlertCircle,
  XCircle, FileText, RefreshCw, ExternalLink, FolderOpen,
  Calendar, User, MapPin, Building2, Package, Image as ImageIcon, Trash2, Edit2,
  Download, Lock, ShieldAlert, DollarSign, Save, MoreVertical, Thermometer,
  ClipboardCheck, Archive, FileSpreadsheet, Wallet, BarChart3, Loader2
} from 'lucide-react'
import PalletUploadZone from '@/components/despachos/PalletUploadZone'
import UploadZone from '@/components/lotes/UploadZone'
import DocumentList, { DocumentoUI } from '@/components/documentos/DocumentList'
import ContainerLiquidationCard from '@/components/despachos/ContainerLiquidationCard'
import { useToast } from '@/components/layout/Toast'
import { useConfirm } from '@/components/layout/ConfirmDialog'
import { puedeGestionarDespacho, esSoloLectura, esAdmin } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getCountryFlag, getFruitInfo } from '@/lib/flags-and-fruits'

const NewDispatchModal = dynamic(() => import('@/components/despachos/NewDispatchModal'), { ssr: false })
const FilePreviewModal = dynamic(() => import('@/components/layout/FilePreviewModal'), { ssr: false })

interface DispatchDocument extends DocumentoUI {
  validation_status: string
  uploaded_by_user?: { display_name: string } | null
  validated_by_user?: { display_name: string } | null
}

interface Dispatch {
  id: string
  internal_code: string
  dispatch_code: string
  client: string | null
  species?: string | null
  destination: string | null
  dispatch_date: string | null
  expected_pallets: number | null
  container_number: string | null
  pack_list_status: string
  pata_pata_photos_count: number
  thermograph_photos_count: number
  overall_status: string
  payment_status: 'pending' | 'paid'
  invoice_amount: number | null
  advance_amount: number | null
  drive_folder_id: string | null
  drive_folder_finance_id: string | null
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

type Pestana = 'documentos' | 'financiero' | 'informes'

export default function DispatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const confirmar = useConfirm()

  const [dispatch, setDispatch] = useState<Dispatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ isOpen: boolean; url: string; name: string } | null>(null)
  const [editingInvoiceAmount, setEditingInvoiceAmount] = useState<string>('')
  const [editingAdvanceAmount, setEditingAdvanceAmount] = useState<string>('')
  const [savingAmounts, setSavingAmounts] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [pestana, setPestana] = useState<Pestana>('documentos')

  // La pestaña puede venir en la URL (?tab=financiero) para que el botón
  // "Finanzas" del listado entre directo al módulo financiero.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'financiero' || tab === 'informes' || tab === 'documentos') {
      setPestana(tab)
    }
  }, [])

  const fetchDispatch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    const res = await fetch(`/api/despachos/${id}`)
    if (res.ok) {
      const json = await res.json()
      setDispatch(json.data)
      setEditingInvoiceAmount(json.data.invoice_amount !== null && json.data.invoice_amount !== undefined ? json.data.invoice_amount.toString() : '')
      setEditingAdvanceAmount(json.data.advance_amount !== null && json.data.advance_amount !== undefined ? json.data.advance_amount.toString() : '')
    }
    setLoading(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => {
    fetchDispatch(false)
  }, [fetchDispatch])

  // Cerrar el menú de acciones al hacer clic fuera
  useEffect(() => {
    if (!menuAbierto) return
    const alClicar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', alClicar)
    return () => document.removeEventListener('mousedown', alClicar)
  }, [menuAbierto])

  const cerrado = dispatch?.overall_status === 'closed'
  const admin = esAdmin(user?.role)
  const soloLectura = esSoloLectura(user?.role)
  const puedeSubir = !cerrado && !soloLectura
  const puedeSubirFotos = puedeSubir && puedeGestionarDespacho(user?.role)
  const puedeVerDrive = admin || Boolean(user?.canViewDrive)

  const handleSaveAmounts = async () => {
    if (cerrado) {
      toast.warning('No se pueden modificar montos de un despacho cerrado.')
      return
    }
    setSavingAmounts(true)
    try {
      const inv = editingInvoiceAmount.trim() !== '' ? parseFloat(editingInvoiceAmount) : null
      const adv = editingAdvanceAmount.trim() !== '' ? parseFloat(editingAdvanceAmount) : 0
      const res = await fetch(`/api/despachos/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.userId || '',
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({ invoice_amount: inv, advance_amount: adv })
      })
      if (res.ok) {
        await fetchDispatch(true)
        toast.success('Montos guardados.')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar los montos')
      }
    } catch (e) {
      toast.error('Error de conexión al guardar los montos')
    } finally {
      setSavingAmounts(false)
    }
  }

  const formatCLP = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return '—'
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  const docsByType = useMemo(() => {
    return (dispatch?.dispatch_documents || []).reduce((acc, doc) => {
      if (!acc[doc.document_type]) acc[doc.document_type] = []
      acc[doc.document_type].push(doc)
      return acc
    }, {} as Record<string, DispatchDocument[]>)
  }, [dispatch])

  // Progreso del despacho: qué falta para darlo por completo.
  const progreso = useMemo(() => {
    if (!dispatch) return { hechos: 0, total: 0, pendientes: [] as string[] }
    const minFotos = Math.ceil((dispatch.expected_pallets || 0) / 2)
    const requisitos = [
      { nombre: 'Pack List', ok: (docsByType['pack_list'] || []).length > 0 },
      { nombre: 'Pack List validado', ok: dispatch.pack_list_status === 'validated' },
      { nombre: `Fotos pata a pata (mín. ${minFotos})`, ok: (docsByType['pata_pata_photo'] || []).length >= minFotos },
      { nombre: 'Fotos de termógrafos (2)', ok: (docsByType['thermograph_photo'] || []).length >= 2 },
      { nombre: 'Factura', ok: (docsByType['factura'] || []).length > 0 },
      { nombre: 'Contenedor pagado', ok: dispatch.payment_status === 'paid' },
    ]
    return {
      hechos: requisitos.filter(r => r.ok).length,
      total: requisitos.length,
      pendientes: requisitos.filter(r => !r.ok).map(r => r.nombre),
    }
  }, [dispatch, docsByType])

  const handleDeleteDocument = async (docId: string, tableName: string) => {
    if (cerrado) {
      toast.warning('No se pueden eliminar documentos de un despacho cerrado.')
      return
    }
    const ok = await confirmar({
      title: 'Enviar a la papelera',
      message: 'El archivo NO se borra: se guarda 30 días y puedes restaurarlo desde Configuración → Salud de los Documentos.',
      confirmText: 'Enviar a la papelera',
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/documentos/${tableName}/${docId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) {
        fetchDispatch(true)
        toast.success('Documento enviado a la papelera.')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al eliminar el documento')
      }
    } catch (e) {
      toast.error('Error de conexión al intentar eliminar')
    }
  }

  // Se mantiene la confirmación escrita ("ELIMINAR") en vez del modal
  // estándar: es la única acción que destruye el despacho por completo y
  // vale la pena que cueste más trabajo confirmarla por error.
  const handleDeleteDispatch = async () => {
    const confirmation = prompt('🛑 ¡ADVERTENCIA CRÍTICA!\n\n¿Estás seguro de que deseas ELIMINAR ESTE DESPACHO COMPLETAMENTE?\n\nEsta acción:\n1. Borrará el registro de la Base de Datos.\n2. Enviará la carpeta de Google Drive a la papelera.\n3. Es irreversible.\n\nEscribe "ELIMINAR" en mayúsculas para confirmar:')
    if (confirmation !== 'ELIMINAR') {
      if (confirmation !== null) toast.info('Eliminación cancelada.')
      return
    }
    try {
      const res = await fetch(`/api/despachos/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) {
        toast.success('Despacho eliminado con éxito.')
        router.push('/despachos')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al eliminar el despacho.')
      }
    } catch (e) {
      toast.error('Error de conexión al intentar eliminar.')
    }
  }

  const handleCloseDispatch = async () => {
    const ok = await confirmar({
      title: 'Cerrar despacho',
      message: '¿Cerrar este despacho definitivamente? Ya no se podrán subir ni modificar documentos.',
      confirmText: 'Cerrar despacho',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/despachos/${id}/cerrar`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) { fetchDispatch(true); toast.success('Despacho cerrado.') }
      else { const data = await res.json(); toast.error(data.error || 'Error al cerrar') }
    } catch (e) { toast.error('Error de conexión') }
  }

  const handleOpenDispatch = async () => {
    const ok = await confirmar({
      title: 'Reabrir despacho',
      message: '¿Reabrir este despacho? Se podrán volver a subir y modificar documentos.',
      confirmText: 'Reabrir',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/despachos/${id}/abrir`, {
        method: 'POST',
        headers: { 'x-user-id': user?.userId || '', 'x-user-role': user?.role || '' }
      })
      if (res.ok) { fetchDispatch(true); toast.success('Despacho reabierto.') }
      else { const data = await res.json(); toast.error(data.error || 'Error al reabrir') }
    } catch (e) { toast.error('Error de conexión') }
  }

  const handleTogglePaymentStatus = async () => {
    if (!dispatch) return
    if (cerrado) {
      toast.warning('No se puede modificar el estado de pago de un despacho cerrado.')
      return
    }
    const newStatus = dispatch.payment_status === 'paid' ? 'pending' : 'paid'
    const ok = await confirmar({
      title: newStatus === 'paid' ? 'Marcar como pagado' : 'Marcar como pendiente',
      message: newStatus === 'paid'
        ? '¿Confirmas que este contenedor se encuentra pagado en su totalidad?'
        : '¿Cambiar el estado del contenedor a pendiente de pago?',
      confirmText: 'Confirmar',
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/despachos/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.userId || '',
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({ payment_status: newStatus })
      })
      if (res.ok) { fetchDispatch(true); toast.success('Estado de pago actualizado.') }
      else { const data = await res.json(); toast.error(data.error || 'Error al actualizar el estado de pago') }
    } catch (e) {
      toast.error('Error de conexión al actualizar estado de pago')
    }
  }

  const abrirPreview = (url: string, name: string) => setPreviewFile({ isOpen: true, url, name })

  // Zona de subida estándar para un tipo de documento.
  const zonaSubida = (tipo: string, etiqueta: string, aceptaExcel = false) => (
    <UploadZone
      lotId={id}
      lotCode={dispatch?.dispatch_code || ''}
      documentType={tipo}
      documentLabel={etiqueta}
      accept={aceptaExcel ? {
        'application/pdf': ['.pdf'],
        'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
        'application/vnd.ms-excel': ['.xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
      } : undefined}
      onUploadSuccess={() => fetchDispatch(true)}
      uploadUrl={`/api/despachos/${id}/upload`}
    />
  )

  const tarjetaFinanciera = (tipo: string, etiqueta: string) => (
    <DocumentList
      key={tipo}
      titulo={etiqueta}
      icono={<FileText className="w-4 h-4 text-emerald-400" />}
      documentos={docsByType[tipo] || []}
      tableName="dispatch_documents"
      puedeSubir={puedeSubir}
      puedeEliminar={admin && !cerrado}
      puedeValidar={admin && !cerrado}
      puedeVerDrive={puedeVerDrive}
      zonaSubida={zonaSubida(tipo, etiqueta, true)}
      onPreview={abrirPreview}
      onEliminar={handleDeleteDocument}
      onValidado={() => fetchDispatch(true)}
    />
  )

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
  const minFotos = Math.ceil((dispatch.expected_pallets || 0) / 2)
  const saldo = Number(dispatch.invoice_amount || 0) - Number(dispatch.advance_amount || 0)

  const fruit = getFruitInfo(dispatch.species, dispatch.client)
  const country = getCountryFlag(dispatch.destination)

  const PESTANAS: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = [
    { id: 'documentos', etiqueta: 'Documentos y fotos', icono: <FileText className="w-4 h-4" /> },
    { id: 'financiero', etiqueta: 'Financiero', icono: <Wallet className="w-4 h-4" /> },
    { id: 'informes', etiqueta: 'Informes y descargas', icono: <Download className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6 max-w-5xl pb-10">
      <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden transition-opacity duration-500 ${refreshing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
      </div>

      {/* ── CABECERA ─────────────────────────────────────────────────────── */}
      <div>
        <Link href="/despachos" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Volver a Despachos
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-b from-white/10 to-white/5 border border-white/15 rounded-2xl flex items-center justify-center shrink-0 shadow-xl p-1" title={`Especie: ${fruit.label}`}>
              <span className="text-3xl sm:text-4xl leading-none filter drop-shadow-md">
                {fruit.icon}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">Despacho {dispatch.dispatch_code}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                <span className="text-indigo-400 font-semibold flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(dispatch.dispatch_date)}
                </span>
                <span className="text-gray-600">|</span>
                <span><strong>Cliente:</strong> {dispatch.client || '—'}</span>
                {dispatch.container_number && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span><strong>Contenedor:</strong> {dispatch.container_number}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Estados + menú único de acciones (antes: 9 botones en fila) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${
              dispatch.payment_status === 'paid'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
            }`}>
              {dispatch.payment_status === 'paid' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              {dispatch.payment_status === 'paid' ? 'Pagado' : 'Pago Pendiente'}
            </span>

            <button
              onClick={() => fetchDispatch(true)}
              className="p-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuAbierto(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                <MoreVertical className="w-4 h-4" />
                Acciones
              </button>

              {menuAbierto && (
                <div className="absolute right-0 mt-2 w-64 bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden py-1">
                  {dispatch.drive_folder_url && puedeVerDrive && (
                    <a
                      href={dispatch.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuAbierto(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-indigo-400" />
                      Abrir carpeta en Drive
                      <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                    </a>
                  )}

                  <button
                    onClick={() => { setMenuAbierto(false); setPestana('informes') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-400" />
                    Informes y descargas
                  </button>

                  {admin && !cerrado && (
                    <button
                      onClick={() => { setMenuAbierto(false); setShowEditModal(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-gray-400" />
                      Editar información
                    </button>
                  )}

                  {(dispatch.overall_status === 'complete' || dispatch.overall_status === 'validated') && admin && (
                    <button
                      onClick={() => { setMenuAbierto(false); handleCloseDispatch() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Lock className="w-4 h-4 text-amber-400" />
                      Cerrar despacho
                    </button>
                  )}

                  {cerrado && admin && (
                    <button
                      onClick={() => { setMenuAbierto(false); handleOpenDispatch() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-green-400" />
                      Reabrir despacho
                    </button>
                  )}

                  {admin && (
                    <>
                      <div className="h-px bg-white/10 my-1" />
                      <button
                        onClick={() => { setMenuAbierto(false); handleDeleteDispatch() }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar despacho
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de progreso: qué falta, de un vistazo */}
        <div className="mt-5 bg-white/3 border border-white/8 rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-300">
              {progreso.hechos} de {progreso.total} requisitos completos
            </span>
            {progreso.pendientes.length > 0 ? (
              <span className="text-[11px] text-amber-400 truncate max-w-full">
                Falta: {progreso.pendientes.join(' · ')}
              </span>
            ) : (
              <span className="text-[11px] text-emerald-400 font-semibold">Todo listo ✓</span>
            )}
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progreso.hechos === progreso.total ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${(progreso.hechos / progreso.total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {cerrado && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3 text-gray-400">
          <ShieldAlert className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Despacho cerrado para auditoría</p>
            <p className="text-xs">Los documentos están sellados. No se permiten nuevas subidas ni validaciones.</p>
          </div>
        </div>
      )}

      {/* ── DATOS RESUMEN ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" />Cliente</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.client || '—'}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" />Destino</p>
          <p className="text-white font-semibold text-base truncate flex items-center gap-2.5">
            {country.flagUrl ? (
              <img 
                src={country.flagUrl} 
                alt={country.label} 
                className="h-5.5 w-8 rounded-xs inline-block object-cover border border-white/20 shadow-md shrink-0" 
              />
            ) : (
              <span className="text-2xl leading-none shrink-0">{country.flag}</span>
            )}
            <span className="truncate">{dispatch.destination || '—'}</span>
          </p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Package className="w-3 h-3" />Pallets</p>
          <p className="text-white font-medium text-sm">{dispatch.expected_pallets || '—'} esperados</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Truck className="w-3 h-3" />Contenedor</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.container_number || '—'}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><User className="w-3 h-3" />Creado por</p>
          <p className="text-white font-medium text-sm truncate">{dispatch.created_by_user?.display_name || 'Sistema'}</p>
        </div>
      </div>

      {/* ── PESTAÑAS ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-white/8 overflow-x-auto">
        {PESTANAS.map(p => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap ${
              pestana === p.id
                ? 'border-indigo-500 text-indigo-600 dark:text-white font-semibold'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            {p.icono}
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: DOCUMENTOS Y FOTOS ──────────────────────────────────── */}
      {pestana === 'documentos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <DocumentList
              titulo="Pack List"
              icono={<FileSpreadsheet className="w-4 h-4 text-indigo-400" />}
              ayuda="El listado de embalaje del contenedor. Alimenta la liquidación."
              documentos={docsByType['pack_list'] || []}
              requeridos={1}
              tableName="dispatch_documents"
              puedeSubir={puedeSubir}
              puedeEliminar={admin && !cerrado}
              puedeValidar={admin && !cerrado}
              puedeVerDrive={puedeVerDrive}
              zonaSubida={zonaSubida('pack_list', 'Pack List')}
              onPreview={abrirPreview}
              onEliminar={handleDeleteDocument}
              onValidado={() => fetchDispatch(true)}
            />

            <DocumentList
              titulo="Fotos Pata a Pata"
              icono={<ImageIcon className="w-4 h-4 text-indigo-400" />}
              ayuda={`Mínimo ${minFotos} fotos (una cada dos pallets).`}
              documentos={docsByType['pata_pata_photo'] || []}
              requeridos={minFotos}
              variante="galeria"
              tableName="dispatch_documents"
              puedeSubir={puedeSubirFotos}
              puedeEliminar={admin && !cerrado}
              puedeVerDrive={puedeVerDrive}
              zonaSubida={<PalletUploadZone dispatchId={id} onUploadSuccess={() => fetchDispatch(true)} />}
              onPreview={abrirPreview}
              onEliminar={handleDeleteDocument}
              onValidado={() => fetchDispatch(true)}
            />
          </div>

          <div className="space-y-6">
            <DocumentList
              titulo="Fotos Termógrafos"
              icono={<Thermometer className="w-4 h-4 text-indigo-400" />}
              ayuda="Dos fotos del registro de temperatura del contenedor."
              documentos={docsByType['thermograph_photo'] || []}
              requeridos={2}
              variante="galeria"
              tableName="dispatch_documents"
              puedeSubir={puedeSubirFotos}
              puedeEliminar={admin && !cerrado}
              puedeVerDrive={puedeVerDrive}
              zonaSubida={
                <UploadZone
                  lotId={id}
                  lotCode={dispatch.dispatch_code}
                  documentType="thermograph_photo"
                  documentLabel="Foto Termógrafo"
                  accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'] }}
                  onUploadSuccess={() => fetchDispatch(true)}
                  uploadUrl={`/api/despachos/${id}/upload`}
                />
              }
              onPreview={abrirPreview}
              onEliminar={handleDeleteDocument}
              onValidado={() => fetchDispatch(true)}
            />

            <DocumentList
              titulo="Recepción de Calidad en Destino"
              icono={<ClipboardCheck className="w-4 h-4 text-indigo-400" />}
              ayuda="Informe de cómo llegó la fruta al mercado de destino."
              documentos={docsByType['calidad_destino'] || []}
              tableName="dispatch_documents"
              puedeSubir={puedeSubirFotos}
              puedeEliminar={admin && !cerrado}
              puedeVerDrive={puedeVerDrive}
              zonaSubida={zonaSubida('calidad_destino', 'Calidad en Destino')}
              onPreview={abrirPreview}
              onEliminar={handleDeleteDocument}
              onValidado={() => fetchDispatch(true)}
            />

            <DocumentList
              titulo="Otros / Respaldos"
              icono={<Archive className="w-4 h-4 text-indigo-400" />}
              ayuda="Cualquier documento adicional del despacho."
              documentos={docsByType['backup'] || []}
              tableName="dispatch_documents"
              puedeSubir={puedeSubirFotos}
              puedeEliminar={admin && !cerrado}
              puedeVerDrive={puedeVerDrive}
              zonaSubida={zonaSubida('backup', 'Respaldo')}
              onPreview={abrirPreview}
              onEliminar={handleDeleteDocument}
              onValidado={() => fetchDispatch(true)}
            />
          </div>
        </div>
      )}

      {/* ── PESTAÑA: FINANCIERO ──────────────────────────────────────────── */}
      {pestana === 'financiero' && (
        <div className="space-y-6">
          {/* Resumen económico: antes estos montos estaban enterrados dentro
              de las tarjetas de documento "Factura" y "Abonos". */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Resumen económico del contenedor
              </h2>
              {['admin', 'gerencia'].includes(user?.role || '') && (
                <button
                  onClick={handleTogglePaymentStatus}
                  disabled={cerrado}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs transition-all shadow-md ${
                    dispatch.payment_status === 'paid'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={cerrado ? 'El despacho está cerrado' : undefined}
                >
                  {dispatch.payment_status === 'paid' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  {dispatch.payment_status === 'paid' ? 'Pagado (marcar pendiente)' : 'Marcar como pagado'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-2">
                <label className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Monto Factura ($ CLP)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="number" min="0" step="1" placeholder="Ej: 10000000"
                      value={editingInvoiceAmount}
                      onChange={(e) => setEditingInvoiceAmount(e.target.value)}
                      disabled={cerrado || savingAmounts}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400/50 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveAmounts}
                    disabled={cerrado || savingAmounts}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-lg font-bold text-white">{formatCLP(dispatch.invoice_amount)}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-2">
                <label className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Abonos / Adelantos ($ CLP)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="number" min="0" step="1" placeholder="Ej: 5000000"
                      value={editingAdvanceAmount}
                      onChange={(e) => setEditingAdvanceAmount(e.target.value)}
                      disabled={cerrado || savingAmounts}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400/50 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveAmounts}
                    disabled={cerrado || savingAmounts}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-lg font-bold text-indigo-300">{formatCLP(dispatch.advance_amount || 0)}</p>
              </div>

              <div className={`border rounded-xl p-3.5 flex flex-col justify-center ${
                saldo <= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${saldo <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Saldo adeudado
                </p>
                <p className={`text-2xl font-black mt-1 ${saldo <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {formatCLP(saldo)} {saldo <= 0 ? '✓' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Liquidación del contenedor */}
          <ContainerLiquidationCard
            dispatchId={id}
            dispatchCode={dispatch.dispatch_code}
            isClosed={cerrado}
            userId={user?.userId}
          />

          {/* Documentos de respaldo financiero */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Documentos de respaldo financiero
              </h2>
              <p className="text-gray-400 text-xs mt-1">Guías, proformas, facturas, abonos y pagos de la carga.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tarjetaFinanciera('guia_despacho', '1. Guía de Despacho')}
              {tarjetaFinanciera('proforma', '2. Proforma')}
              {tarjetaFinanciera('factura', '3. Factura')}
              {tarjetaFinanciera('abonos_adelantos', '4. Abonos o Adelantos')}
              {tarjetaFinanciera('pagos_liquidaciones', '5. Pagos y Liquidaciones')}
            </div>
          </div>
        </div>
      )}

      {/* ── PESTAÑA: INFORMES Y DESCARGAS ────────────────────────────────── */}
      {pestana === 'informes' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <TarjetaInforme
            icono={<FileText className="w-6 h-6" />}
            color="indigo"
            titulo="Dossier del despacho"
            descripcion="Portada de control, fotos de pallets, termógrafos y el Pack List, todo en un PDF."
            detalle={`${(docsByType['pata_pata_photo'] || []).length} fotos de pallet · ${(docsByType['thermograph_photo'] || []).length} termógrafos`}
            href={`/api/despachos/${dispatch.id}/reporte-pdf`}
            textoBoton="Ver PDF"
          />

          <TarjetaInforme
            icono={<BarChart3 className="w-6 h-6" />}
            color="emerald"
            titulo="Informe financiero"
            descripcion="Venta por calibre, gastos en destino, utilidad del contenedor y ranking de rentabilidad."
            detalle="Se genera con la liquidación guardada"
            href={`/api/despachos/${dispatch.id}/liquidacion/reporte-pdf`}
            textoBoton="Ver PDF"
          />

          <TarjetaInforme
            icono={<Download className="w-6 h-6" />}
            color="blue"
            titulo="Todos los archivos"
            descripcion="Descarga en un .zip todos los documentos y fotos originales de este despacho."
            detalle={`${(dispatch.dispatch_documents || []).length} archivos`}
            href={`/api/despachos/${dispatch.id}/download-all`}
            textoBoton="Descargar .zip"
            descarga
          />
        </div>
      )}

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

// Tarjeta de la pestaña de informes: muestra una barra de carga dinámica al generar
// PDFs o compilar archivos ZIP para dar feedback en tiempo real al usuario.
function TarjetaInforme({
  icono, color, titulo, descripcion, detalle, href, textoBoton, descarga = false,
}: {
  icono: React.ReactNode
  color: 'indigo' | 'emerald' | 'blue'
  titulo: string
  descripcion: string
  detalle: string
  href: string
  textoBoton: string
  descarga?: boolean
}) {
  const [generando, setGenerando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [estadoTexto, setEstadoTexto] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const colores = {
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  }[color]

  const barColores = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
  }[color]

  const handleDescarga = async () => {
    if (generando) return
    setGenerando(true)
    setErrorMsg(null)
    setProgreso(10)
    setEstadoTexto('Iniciando procesamiento...')

    // Si es previsualización de PDF, abrimos la pestaña síncronamente para evitar que el navegador la bloquee como pop-up
    let newTab: Window | null = null
    if (!descarga) {
      newTab = window.open('about:blank', '_blank')
      if (newTab) {
        newTab.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Generando ${titulo}...</title>
              <meta charset="utf-8">
              <style>
                body { background-color: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); padding: 2rem; border-radius: 1rem; text-align: center; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
                .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.25rem; }
                @keyframes spin { to { transform: rotate(360deg); } }
                h2 { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 700; }
                p { margin: 0; color: #94a3b8; font-size: 0.875rem; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="spinner"></div>
                <h2>Generando ${titulo}</h2>
                <p>Procesando imágenes y documentos. Por favor espera un momento...</p>
              </div>
            </body>
          </html>
        `)
      }
    }

    let p = 10
    timerRef.current = setInterval(() => {
      p += Math.floor(Math.random() * 8) + 4
      if (p > 90) p = 90
      setProgreso(p)
      if (p > 30 && p <= 60) setEstadoTexto('Recopilando documentos y fotos...')
      else if (p > 60 && p <= 85) setEstadoTexto('Compilando páginas en PDF...')
      else if (p > 85) setEstadoTexto('Finalizando archivo...')
    }, 350)

    try {
      const res = await fetch(href)
      if (timerRef.current) clearInterval(timerRef.current)

      if (!res.ok) {
        let text = 'Error al generar el archivo.'
        try {
          const errJson = await res.json()
          if (errJson.error) text = errJson.error
        } catch {}
        throw new Error(text)
      }

      setProgreso(100)
      setEstadoTexto('¡Completado! Abriendo...')

      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      if (descarga) {
        const contentDisp = res.headers.get('content-disposition')
        let filename = 'archivo.zip'
        if (contentDisp && contentDisp.includes('filename=')) {
          filename = contentDisp.split('filename=')[1].replace(/"/g, '')
        }
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        if (newTab && !newTab.closed) {
          newTab.location.href = blobUrl
        } else {
          window.open(blobUrl, '_blank')
        }
      }

      setTimeout(() => {
        setGenerando(false)
        setProgreso(0)
        setEstadoTexto('')
      }, 1200)
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current)
      if (newTab && !newTab.closed) {
        newTab.close()
      }
      setGenerando(false)
      setProgreso(0)
      setErrorMsg(err.message || 'Ocurrió un error al generar el documento')
    }
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden transition-all hover:border-white/15">
      <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${colores}`}>
        {icono}
      </div>
      <div className="flex-1">
        <h3 className="text-white font-semibold text-sm">{titulo}</h3>
        <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{descripcion}</p>
        <p className="text-gray-500 text-[11px] mt-2 font-mono">{detalle}</p>
      </div>

      {generando && (
        <div className="space-y-2 my-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-300 font-medium flex items-center gap-1.5 truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
              <span className="truncate">{estadoTexto}</span>
            </span>
            <span className="text-gray-300 font-mono font-bold shrink-0 ml-2">{progreso}%</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColores}`}
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleDescarga}
        disabled={generando}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
          generando
            ? 'opacity-75 cursor-wait'
            : 'hover:brightness-125 cursor-pointer'
        } ${colores}`}
      >
        {generando ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generando ({progreso}%)...
          </>
        ) : (
          <>
            {descarga ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
            {textoBoton}
          </>
        )}
      </button>
    </div>
  )
}
