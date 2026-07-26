'use client'

import { useState } from 'react'
import {
  FileText, Image as ImageIcon, Eye, Trash2, CheckCircle, AlertCircle,
  XCircle, Upload, ChevronDown
} from 'lucide-react'
import InlineValidation from '@/components/lotes/InlineValidation'

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE DOCUMENTOS — un único componente para toda la app.
//
// Sustituye a las cinco copias casi idénticas que había en la ficha de
// despacho (Pack List, Pata a Pata, Termógrafos, Respaldos, Calidad Destino).
// Cada copia se fue tocando por separado y por eso la pantalla se veía
// despareja: distinto tamaño de icono, distinto orden, distinto texto.
//
// Novedades respecto de aquellas copias:
//   · La zona de subida se abre al pulsar "Subir", no las cinco a la vez.
//   · Las fotos se ven como miniaturas, no como una lista de nombres.
//   · Cada tarjeta dice qué falta ("1 de 2 · falta 1"), no solo un número.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentoUI {
  id: string
  document_type: string
  original_file_name: string
  version_number?: number
  drive_file_url: string | null
  storage_url: string | null
  status: string
  observation?: string | null
  created_at: string
}

interface DocumentListProps {
  titulo: string
  icono: React.ReactNode
  documentos: DocumentoUI[]
  /** Cuántos se esperan. Si se indica, la tarjeta informa lo que falta. */
  requeridos?: number
  /** 'galeria' muestra miniaturas (fotos); 'lista' muestra filas (documentos). */
  variante?: 'lista' | 'galeria'
  /** Se muestra bajo el título para explicar qué va aquí. */
  ayuda?: string
  tableName: string
  puedeSubir?: boolean
  puedeEliminar?: boolean
  puedeValidar?: boolean
  puedeVerDrive?: boolean
  zonaSubida?: React.ReactNode
  onPreview: (url: string, nombre: string) => void
  onEliminar: (docId: string, tabla: string) => void
  onValidado: () => void
}

const esImagen = (nombre: string) => /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(nombre)

export default function DocumentList({
  titulo,
  icono,
  documentos,
  requeridos,
  variante = 'lista',
  ayuda,
  tableName,
  puedeSubir = false,
  puedeEliminar = false,
  puedeValidar = false,
  puedeVerDrive = false,
  zonaSubida,
  onPreview,
  onEliminar,
  onValidado,
}: DocumentListProps) {
  const [subiendoAbierto, setSubiendoAbierto] = useState(false)
  const [validandoId, setValidandoId] = useState<string | null>(null)

  const ordenados = [...documentos].sort((a, b) => {
    const v = (b.version_number || 0) - (a.version_number || 0)
    if (v !== 0) return v
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const total = documentos.length
  const faltan = requeridos ? Math.max(0, requeridos - total) : 0
  const completo = requeridos ? total >= requeridos : total > 0

  const fechaHora = (f: string) =>
    new Date(f).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const abrir = (doc: DocumentoUI) => {
    const url = esImagen(doc.original_file_name) && doc.storage_url
      ? doc.storage_url
      : doc.drive_file_url || doc.storage_url
    if (url) onPreview(url, doc.original_file_name)
  }

  const botonVer = (doc: DocumentoUI, pequeno = false) => {
    const tam = pequeno ? 'w-3.5 h-3.5' : 'w-4 h-4'
    const soloDrive = !doc.storage_url
    if (!doc.drive_file_url && !doc.storage_url) {
      return <span className="text-gray-600 p-1"><XCircle className={tam} /></span>
    }
    if (soloDrive && !puedeVerDrive) {
      return <span className="text-gray-600 p-1" title="Archivado en Drive"><XCircle className={tam} /></span>
    }
    return (
      <button
        onClick={() => abrir(doc)}
        className={`${soloDrive ? 'text-amber-400' : 'text-indigo-400'} p-1 hover:bg-white/10 rounded flex items-center gap-1`}
        title={soloDrive ? 'Archivo archivado en Google Drive' : 'Ver documento'}
      >
        <Eye className={tam} />
        {soloDrive && <span className="text-[9px] font-bold">DRIVE</span>}
      </button>
    )
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            {icono}
            {titulo}
          </h3>
          {ayuda && <p className="text-gray-500 text-[11px] mt-0.5">{ayuda}</p>}
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap shrink-0 ${
            completo
              ? 'text-green-400 border-green-500/30 bg-green-500/10'
              : total > 0
              ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
              : 'text-gray-400 border-gray-500/30 bg-gray-500/10'
          }`}
        >
          {requeridos
            ? completo
              ? `${total} ✓`
              : `${total} de ${requeridos} · falta${faltan === 1 ? '' : 'n'} ${faltan}`
            : total === 0
            ? 'Sin archivos'
            : total}
        </span>
      </div>

      {/* Contenido */}
      {total === 0 ? (
        <p className="text-gray-500 text-xs italic mb-4">Todavía no se ha subido nada aquí.</p>
      ) : variante === 'galeria' ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 max-h-72 overflow-y-auto pr-1">
          {ordenados.map(doc => (
            <div key={doc.id} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5">
              {doc.storage_url && esImagen(doc.original_file_name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.storage_url}
                  alt={doc.original_file_name}
                  loading="lazy"
                  className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                  onClick={() => abrir(doc)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 cursor-pointer" onClick={() => abrir(doc)}>
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[9px] text-white truncate">{doc.original_file_name}</p>
                <p className="text-[8px] text-gray-400">{fechaHora(doc.created_at)}</p>
              </div>

              {puedeEliminar && (
                <button
                  onClick={() => onEliminar(doc.id, tableName)}
                  className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                  title="Enviar a la papelera"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
          {ordenados.map((doc, index) => {
            const esActual = index === 0 && ordenados.length > 1
            return (
              <div
                key={doc.id}
                className={`border rounded-xl p-3 transition-all ${
                  esActual ? 'bg-indigo-500/10 border-indigo-500/30 ring-1 ring-indigo-500/20' : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <FileText className={`w-4 h-4 flex-shrink-0 ${esActual ? 'text-indigo-400' : 'text-gray-400'}`} />
                  <span className={`text-sm flex-1 truncate ${esActual ? 'text-indigo-100 font-medium' : 'text-gray-300'}`}>
                    {doc.original_file_name}
                  </span>
                  <div className="flex items-center gap-2">
                    {botonVer(doc)}
                    {puedeEliminar && (
                      <button
                        onClick={() => onEliminar(doc.id, tableName)}
                        className="text-red-400 p-1 hover:bg-red-400/10 rounded"
                        title="Enviar a la papelera (recuperable 30 días)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <p className={`text-[10px] ${esActual ? 'text-indigo-300' : 'text-gray-500'}`}>
                      {doc.version_number ? `v${doc.version_number} • ` : ''}{fechaHora(doc.created_at)}
                    </p>
                    {esActual && (
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Actual
                      </span>
                    )}
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

                {doc.status === 'observed' && doc.observation && (
                  <p className="mt-2 text-[11px] text-yellow-300/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-2 py-1.5">
                    {doc.observation}
                  </p>
                )}

                {doc.status !== 'validated' && puedeValidar && (
                  <div className="mt-2">
                    {validandoId === doc.id ? (
                      <InlineValidation
                        docId={doc.id}
                        tableName={tableName}
                        onValidated={() => { setValidandoId(null); onValidado() }}
                        onCancel={() => setValidandoId(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setValidandoId(doc.id)}
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
      )}

      {/* Zona de subida: cerrada por defecto para no llenar la pantalla */}
      {puedeSubir && zonaSubida && (
        subiendoAbierto ? (
          <div className="space-y-2">
            {zonaSubida}
            <button
              onClick={() => setSubiendoAbierto(false)}
              className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSubiendoAbierto(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/15 rounded-xl text-gray-400 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all text-xs font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir {titulo.replace(/^\d+\.\s*/, '')}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </button>
        )
      )}
    </div>
  )
}
