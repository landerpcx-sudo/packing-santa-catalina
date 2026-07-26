'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, Loader2, RefreshCw, Trash2, RotateCcw, AlertTriangle,
  FileSearch, HardDrive, Cloud, Archive, CheckCircle2, PackageSearch
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// PANEL DE SALUD DOCUMENTAL (solo administradores)
//
// Responde de un vistazo las tres preguntas que antes no tenían respuesta:
//   1. ¿Están todos los documentos respaldados en Google Drive?
//   2. ¿Hay archivos guardados que nadie registró? (subidas fantasma)
//   3. ¿Qué hay en la papelera y cómo lo recupero?
// ─────────────────────────────────────────────────────────────────────────────

interface Salud {
  resumen: {
    documentos_vivos: number
    respaldados_en_drive: number
    esperando_drive: number
    archivados_solo_drive: number
    en_papelera: number
    archivos_huerfanos: number
  }
  almacenamiento: { objetos: number; mb_usados: number; inventario_disponible: boolean }
  huerfanos: { path: string; size_bytes: number; created_at: string }[]
  aviso: string | null
}

interface ItemPapelera {
  id: string
  table: string
  modulo: string
  original_file_name: string
  document_type: string
  deleted_at: string
  deleted_by_name: string | null
  dias_restantes: number
  conserva_archivo: boolean
}

export default function DocumentHealthPanel() {
  const [salud, setSalud] = useState<Salud | null>(null)
  const [papelera, setPapelera] = useState<ItemPapelera[]>([])
  const [cargando, setCargando] = useState(true)
  const [rescatando, setRescatando] = useState(false)
  const [resultadoRescate, setResultadoRescate] = useState<any>(null)
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [verPapelera, setVerPapelera] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [resSalud, resPapelera] = await Promise.all([
        fetch('/api/admin/salud-documentos'),
        fetch('/api/documentos/papelera'),
      ])
      if (resSalud.ok) setSalud((await resSalud.json()).data)
      if (resPapelera.ok) setPapelera((await resPapelera.json()).data.items || [])
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo cargar el estado de los documentos.' })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const simularRescate = async () => {
    setRescatando(true)
    setResultadoRescate(null)
    try {
      const res = await fetch('/api/admin/rescatar-huerfanos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResultadoRescate(json)
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e.message || 'Error al revisar los archivos.' })
    } finally {
      setRescatando(false)
    }
  }

  const ejecutarRescate = async () => {
    setRescatando(true)
    try {
      const res = await fetch('/api/admin/rescatar-huerfanos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESCATAR' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResultadoRescate(json)
      setAviso({ tipo: 'ok', texto: json.message })
      await cargar()
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e.message || 'Error al reincorporar los archivos.' })
    } finally {
      setRescatando(false)
    }
  }

  const restaurar = async (item: ItemPapelera) => {
    setAccionEnCurso(item.id)
    try {
      const res = await fetch('/api/documentos/papelera/restaurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: item.table, id: item.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setAviso({ tipo: 'ok', texto: json.message })
      await cargar()
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e.message || 'No se pudo restaurar.' })
    } finally {
      setAccionEnCurso(null)
    }
  }

  const purgar = async (item: ItemPapelera) => {
    setAccionEnCurso(item.id)
    try {
      const res = await fetch('/api/documentos/papelera/purgar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: item.table, id: item.id, confirm: 'ELIMINAR DEFINITIVAMENTE' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setAviso({ tipo: 'ok', texto: json.message })
      await cargar()
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e.message || 'No se pudo eliminar.' })
    } finally {
      setAccionEnCurso(null)
    }
  }

  const r = salud?.resumen
  const todoRespaldado = r ? r.esperando_drive === 0 && r.archivos_huerfanos === 0 : false

  return (
    <section className="bg-[#1e293b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-8 space-y-6">
        <div className="flex items-start gap-5">
          <div className={`p-4 rounded-2xl ${todoRespaldado ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
            <ShieldCheck className="w-10 h-10" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Salud de los Documentos</h2>
              <button
                onClick={cargar}
                disabled={cargando}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-300 border border-white/10 rounded-xl hover:bg-white/5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
            <p className="text-gray-400 mt-2 max-w-2xl">
              Ningún documento subido se pierde. Aquí ves si todos tienen su copia permanente en Google Drive,
              si quedó algún archivo guardado sin registrar, y qué hay en la papelera.
            </p>
          </div>
        </div>

        {salud?.aviso && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-3 text-amber-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{salud.aviso}</span>
          </div>
        )}

        {aviso && (
          <div className={`rounded-2xl p-4 flex gap-3 text-sm border ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {aviso.tipo === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <span className="flex-1">{aviso.texto}</span>
            <button onClick={() => setAviso(null)} className="text-xs opacity-60 hover:opacity-100">cerrar</button>
          </div>
        )}

        {cargando && !salud ? (
          <div className="flex items-center gap-3 text-gray-400 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Revisando documentos...
          </div>
        ) : r ? (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicador icono={<HardDrive className="w-4 h-4" />} etiqueta="Documentos activos" valor={r.documentos_vivos} color="text-white" />
              <Indicador
                icono={<Cloud className="w-4 h-4" />}
                etiqueta="Respaldados en Drive"
                valor={`${r.respaldados_en_drive} / ${r.documentos_vivos}`}
                color={r.esperando_drive === 0 ? 'text-emerald-400' : 'text-amber-400'}
                nota={r.esperando_drive > 0 ? `${r.esperando_drive} esperando subir` : 'Todo respaldado'}
              />
              <Indicador
                icono={<PackageSearch className="w-4 h-4" />}
                etiqueta="Archivos sin registro"
                valor={r.archivos_huerfanos}
                color={r.archivos_huerfanos === 0 ? 'text-emerald-400' : 'text-red-400'}
                nota={r.archivos_huerfanos === 0 ? 'Ninguno' : 'Recuperables abajo'}
              />
              <Indicador
                icono={<Archive className="w-4 h-4" />}
                etiqueta="En la papelera"
                valor={r.en_papelera}
                color={r.en_papelera === 0 ? 'text-gray-400' : 'text-indigo-400'}
                nota={`${salud.almacenamiento.mb_usados} MB usados`}
              />
            </div>

            {r.archivados_solo_drive > 0 && (
              <p className="text-xs text-gray-500">
                {r.archivados_solo_drive} documento(s) ya liberaron su copia rápida y viven solo en Google Drive.
                Siguen accesibles desde la ficha con la etiqueta <b className="text-amber-400">DRIVE</b>.
              </p>
            )}

            {/* Rescate de subidas fantasma */}
            <div className="bg-[#0B0F19] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <FileSearch className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white">Rescate de subidas interrumpidas</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                    Si a alguien se le cortó internet justo al terminar de subir, el archivo quedó guardado pero
                    sin registro: invisible en la app. Esto los busca y los devuelve a su ficha. No borra nada.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={simularRescate}
                  disabled={rescatando}
                  className="px-5 py-2.5 bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-600/30 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {rescatando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                  Revisar sin tocar nada
                </button>

                {resultadoRescate?.simulacion && resultadoRescate.rescatados > 0 && (
                  <button
                    onClick={ejecutarRescate}
                    disabled={rescatando}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reincorporar {resultadoRescate.rescatados} archivo(s)
                  </button>
                )}
              </div>

              {resultadoRescate && (
                <div className="text-xs space-y-2 border-t border-white/10 pt-3">
                  <p className="text-gray-300">{resultadoRescate.message}</p>
                  {resultadoRescate.detalle_rescatados?.length > 0 && (
                    <ul className="text-gray-500 space-y-0.5 max-h-40 overflow-y-auto">
                      {resultadoRescate.detalle_rescatados.map((d: any, i: number) => (
                        <li key={i} className="truncate">• {d.nombre} <span className="text-gray-600">({d.entidad} {d.codigo})</span></li>
                      ))}
                    </ul>
                  )}
                  {resultadoRescate.detalle_no_identificados?.length > 0 && (
                    <details className="text-gray-500">
                      <summary className="cursor-pointer text-amber-400/80">
                        {resultadoRescate.no_identificados} archivo(s) no se pudieron identificar
                      </summary>
                      <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto pl-3">
                        {resultadoRescate.detalle_no_identificados.map((d: any, i: number) => (
                          <li key={i} className="truncate">• {d.path} — {d.motivo}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Papelera */}
            <div className="bg-[#0B0F19] border border-white/10 rounded-2xl p-5 space-y-4">
              <button
                onClick={() => setVerPapelera(v => !v)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Papelera de documentos ({papelera.length})</h3>
                    <p className="text-xs text-gray-400">
                      Lo eliminado se guarda 30 días y se restaura con un clic. El archivo nunca se destruyó.
                    </p>
                  </div>
                </div>
                <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider shrink-0">
                  {verPapelera ? 'Ocultar' : 'Ver'}
                </span>
              </button>

              {verPapelera && (
                papelera.length === 0 ? (
                  <p className="text-xs text-gray-500 border-t border-white/10 pt-3">
                    La papelera está vacía.
                  </p>
                ) : (
                  <div className="space-y-2 border-t border-white/10 pt-3 max-h-96 overflow-y-auto">
                    {papelera.map(item => (
                      <div key={`${item.table}_${item.id}`} className="flex flex-wrap items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-[220px]">
                          <p className="text-xs text-white font-medium truncate">{item.original_file_name}</p>
                          <p className="text-[10px] text-gray-500">
                            {item.modulo} · {item.document_type}
                            {item.deleted_by_name ? ` · eliminado por ${item.deleted_by_name}` : ''}
                            {' · '}
                            {item.dias_restantes > 0
                              ? `${item.dias_restantes} día(s) de protección`
                              : 'ya se puede purgar'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restaurar(item)}
                            disabled={accionEnCurso === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-600/30 transition disabled:opacity-50"
                          >
                            {accionEnCurso === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Restaurar
                          </button>
                          {item.dias_restantes === 0 && (
                            <button
                              onClick={() => purgar(item)}
                              disabled={accionEnCurso === item.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-red-500/10 transition disabled:opacity-50"
                              title="Eliminar definitivamente (queda copia en la papelera de Google Drive)"
                            >
                              <Trash2 className="w-3 h-3" />
                              Purgar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}

function Indicador({
  icono, etiqueta, valor, color, nota,
}: {
  icono: React.ReactNode
  etiqueta: string
  valor: number | string
  color: string
  nota?: string
}) {
  return (
    <div className="bg-[#0B0F19] border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
        {icono}
        {etiqueta}
      </div>
      <p className={`text-2xl font-black mt-1.5 ${color}`}>{valor}</p>
      {nota && <p className="text-[10px] text-gray-500 mt-0.5">{nota}</p>}
    </div>
  )
}
