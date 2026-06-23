'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/context/AuthContext'
import { 
  Cloud, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  HardDrive, 
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Database,
  FileCheck,
  Loader2,
  Send,
  Thermometer,
  Plus
} from 'lucide-react'

function ConfigurationContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [pendingDocs, setPendingDocs] = useState<{ lots: any[], dispatches: any[], temperatures: any[], total: number }>({ lots: [], dispatches: [], temperatures: [], total: 0 })
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 })
  const [currentSyncingName, setCurrentSyncingName] = useState('')
  
  // Temperature Settings
  const [tempStartDate, setTempStartDate] = useState('')
  const [savingTemp, setSavingTemp] = useState(false)

  // Cámaras de Frío
  const [chambers, setChambers] = useState<any[]>([])
  const [loadingChambers, setLoadingChambers] = useState(false)
  const [newChamberName, setNewChamberName] = useState('')
  const [savingChamber, setSavingChamber] = useState(false)

  // Reorganización
  const [reorganizing, setReorganizing] = useState(false)
  const [reorganizeResult, setReorganizeResult] = useState<any>(null)

  useEffect(() => {
    fetchStatus()
    fetchTempSettings()
    fetchChambers()
    
    const connected = searchParams.get('google_connected')
    const error = searchParams.get('google_error')
    
    if (connected === 'true') {
      setTimeout(() => fetchStatus(), 1000)
    } else if (error) {
      alert(`Error al conectar con Google: ${decodeURIComponent(error)}`)
    }
  }, [searchParams])

  useEffect(() => {
    if (googleConnected) {
      fetchPendingDocs()
    }
  }, [googleConnected])

  const fetchChambers = async () => {
    setLoadingChambers(true)
    try {
      const res = await fetch('/api/chambers')
      if (res.ok) {
        const json = await res.json()
        setChambers(json.data || [])
      }
    } catch (e) {
      console.error('Error fetching chambers:', e)
    } finally {
      setLoadingChambers(false)
    }
  }

  const handleAddChamber = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChamberName.trim()) return
    setSavingChamber(true)
    try {
      const res = await fetch('/api/chambers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChamberName })
      })
      if (res.ok) {
        setNewChamberName('')
        fetchChambers()
        alert('Cámara creada correctamente.')
      } else {
        const err = await res.json()
        alert(`Error: ${err.error || 'No se pudo crear la cámara.'}`)
      }
    } catch {
      alert('Error de conexión.')
    } finally {
      setSavingChamber(false)
    }
  }

  const handleToggleChamber = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/chambers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      })
      if (res.ok) {
        fetchChambers()
      } else {
        alert('Error al actualizar el estado de la cámara.')
      }
    } catch {
      alert('Error de conexión.')
    }
  }

  const handleReorganizeDrive = async () => {
    if (!confirm('🚨 ATENCIÓN: Esta acción reorganizará todas las carpetas en Google Drive por cliente (creando subcarpetas Recepciones, Despachos y Financiero) y moverá los archivos existentes de forma 100% segura. Los enlaces y visualizadores en la app seguirán funcionando sin problemas. ¿Deseas iniciar la reorganización?')) {
      return
    }

    setReorganizing(true)
    setReorganizeResult(null)
    try {
      const res = await fetch('/api/admin/reorganize-drive', { 
        method: 'POST' 
      })
      const json = await res.json()
      if (res.ok) {
        setReorganizeResult(json.report)
        alert('🎉 ¡Reorganización de carpetas de Google Drive completada con éxito!')
      } else {
        alert(`Error: ${json.error || 'Ocurrió un error inesperado.'}`)
      }
    } catch {
      alert('Error de conexión.')
    } finally {
      setReorganizing(false)
    }
  }

  const fetchPendingDocs = async () => {
    try {
      const res = await fetch('/api/settings/drive-sync-pending')
      if (res.ok) {
        const d = await res.json()
        setPendingDocs(d.data)
      }
    } catch (err) {
      console.error('Error fetching pending docs:', err)
    }
  }

  const handleSyncAll = async () => {
    if (!pendingDocs.total) return
    
    // Crear el arreglo de tareas individuales
    const tasks = [
      ...(pendingDocs.lots || []).map(d => ({ id: d.id, name: d.original_file_name, table: 'lot_documents' })),
      ...(pendingDocs.dispatches || []).map(d => ({ id: d.id, name: d.original_file_name, table: 'dispatch_documents' })),
      ...(pendingDocs.temperatures || []).map(d => ({ id: d.id, name: d.original_file_name, table: 'temperature_documents' }))
    ]

    setSyncingAll(true)
    setSyncProgress({ current: 0, total: tasks.length })
    
    let successCount = 0
    let failedCount = 0
    const failureReasons: { name: string, reason: string }[] = []

    // Función para procesar un documento individual
    const syncDoc = async (task: { id: string, name: string, table: string }) => {
      setCurrentSyncingName(task.name || 'Archivo')
      try {
        const res = await fetch('/api/settings/drive-sync-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: task.id, table: task.table })
        })
        if (res.ok) {
          const json = await res.json()
          // El endpoint devuelve { data: { success, failed, errors: [{name, reason}] } }
          if (json.data && json.data.success > 0) {
            successCount++
          } else {
            failedCount++
            const reason = json.data?.errors?.[0]?.reason || 'Razón desconocida.'
            failureReasons.push({ name: task.name || 'Archivo', reason })
          }
        } else {
          failedCount++
          const json = await res.json().catch(() => null)
          failureReasons.push({ name: task.name || 'Archivo', reason: json?.error || `Error HTTP ${res.status}.` })
        }
      } catch (err: any) {
        failedCount++
        failureReasons.push({ name: task.name || 'Archivo', reason: err?.message || 'Error de conexión.' })
      } finally {
        setSyncProgress(prev => ({ ...prev, current: Math.min(prev.current + 1, tasks.length) }))
      }
    }

    // Procesar de forma SECUENCIAL (uno a uno).
    //
    // Antes se subían 3 en paralelo, pero eso causaba dos problemas:
    //   1. Carpetas duplicadas en Drive: si varios documentos del mismo lote/
    //      despacho aún sin carpeta corrían a la vez, cada uno creaba su propia
    //      carpeta. Secuencialmente, el primero crea la carpeta y el resto la
    //      reutilizan (leen drive_folder_id ya guardado en la BD).
    //   2. Ráfagas que disparaban el límite de tasa de Google Drive.
    // En secuencial, cada documento lee el estado fresco de la BD y reutiliza la
    // carpeta existente, sin duplicados ni saturación.
    for (const task of tasks) {
      await syncDoc(task)
    }

    await fetchPendingDocs()
    setSyncingAll(false)
    setCurrentSyncingName('')

    if (failedCount > 0) {
      // Agrupar archivos por razón para un diagnóstico claro.
      const byReason = new Map<string, string[]>()
      for (const f of failureReasons) {
        const list = byReason.get(f.reason) || []
        list.push(f.name)
        byReason.set(f.reason, list)
      }
      const detail = Array.from(byReason.entries())
        .map(([reason, names]) => `• ${reason}\n   Archivos (${names.length}): ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`)
        .join('\n\n')

      const tokenIssue = failureReasons.some(f => /token|reconect|invalid|expirad/i.test(f.reason))

      alert(
        `Sincronización finalizada con advertencias.\n\n` +
        `✅ Éxito: ${successCount} archivos sincronizados.\n` +
        `❌ Fallidos: ${failedCount} archivos no pudieron subirse.\n\n` +
        `Motivo(s) del fallo:\n\n${detail}\n\n` +
        (tokenIssue
          ? `➡️ Hay un problema de credenciales: desconecta y vuelve a conectar Google Drive, luego reintenta.`
          : `➡️ Vuelve a pulsar "Sincronizar" — los errores temporales (límite de tasa de Google) suelen resolverse al reintentar.`)
      )
    } else {
      alert(`🎉 ¡Sincronización completada con éxito!\n\nSe subieron todos los ${successCount} archivos a Google Drive correctamente.`)
    }
  }

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const r = await fetch('/api/settings/drive-status')
      if (r.ok) {
        const d = await r.json()
        setGoogleConnected(d.connected)
      }
    } catch (err) {
      console.error('Error checking drive status:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTempSettings = async () => {
    try {
      const res = await fetch('/api/settings/temperature-control')
      if (res.ok) {
        const d = await res.json()
        if (d.value) setTempStartDate(d.value)
      }
    } catch (err) {
      console.error('Error fetching temp settings:', err)
    }
  }

  const handleSaveTempSettings = async () => {
    if (!tempStartDate) return
    setSavingTemp(true)
    try {
      const res = await fetch('/api/settings/temperature-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: tempStartDate })
      })
      if (res.ok) {
        alert('Configuración de temperatura actualizada correctamente.')
      } else {
        alert('Error al guardar la configuración.')
      }
    } catch (e) {
      alert('Error de red al guardar.')
    } finally {
      setSavingTemp(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de que deseas desactivar la sincronización con Google Drive? Todos los archivos nuevos se guardarán solo en Supabase.')) {
      return
    }

    try {
      setDisconnecting(true)
      const res = await fetch('/api/settings/drive-disconnect', {
        method: 'DELETE'
      })
      
      if (!res.ok) throw new Error(await res.text())
      
      setGoogleConnected(false)
      alert('Sincronización desactivada correctamente.')
    } catch (e: any) {
      alert('Error al desconectar: ' + e.message)
    } finally {
      setDisconnecting(false)
    }
  }

  const handleConnect = () => {
    window.location.href = '/api/auth/google'
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <ShieldCheck className="w-16 h-16 text-red-500/20 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
        <p className="text-gray-400">Solo los administradores pueden acceder a la configuración del sistema.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-white">Configuración del Sistema</h1>
        <p className="text-gray-400 mt-2">Administra las integraciones y preferencias globales de la plataforma.</p>
      </div>

      {/* Google Drive Card */}
      <section 
        className="bg-[#1e293b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300"
      >
        <div className="p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className={`p-4 rounded-2xl ${googleConnected ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                <Cloud className="w-10 h-10" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">Google Drive Cloud Storage</h2>
                  {googleConnected ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30">
                      <CheckCircle2 size={12} />
                      Conectado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/20 text-slate-400 border border-slate-500/30">
                      <XCircle size={12} />
                      Desconectado
                    </span>
                  )}
                </div>
                <p className="text-gray-400 mt-2 max-w-lg">
                  Respaldo automático de todos los informes y fotos en tu cuenta personal de Google Drive. 
                  Aprovecha el almacenamiento masivo para mantener un historial ilimitado.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px]">
              {loading ? (
                <div className="flex items-center justify-center p-3">
                  <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : googleConnected ? (
                <>
                  <button 
                    onClick={handleConnect}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl border border-white/10 transition-all"
                  >
                    <RefreshCw size={18} />
                    Actualizar Token
                  </button>
                  <button 
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center justify-center gap-2 px-6 py-3 text-red-400 hover:text-red-300 font-medium transition-all group"
                  >
                    {disconnecting ? <RefreshCw className="animate-spin" size={16} /> : <XCircle size={16} />}
                    <span className="group-hover:underline">Desactivar Sincronización</span>
                  </button>
                </>
              ) : (
                <button 
                  onClick={handleConnect}
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Cloud size={20} />
                  Vincular Google Drive
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center gap-3 text-gray-400">
              <HardDrive size={18} className="text-blue-400" />
              <span>Espacio Personal (5TB+)</span>
            </div>
            <div className="flex items-center gap-3 text-gray-400">
              <ShieldCheck size={18} className="text-emerald-400" />
              <span>Backup Redundante</span>
            </div>
            <div className="flex items-center gap-3 text-gray-400">
              <Database size={18} className="text-purple-400" />
              <span>Sincronización Realtime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Temperature Control Section */}
      <section className="bg-[#1e293b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-8">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Thermometer className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">Parámetros de Control Operacional</h2>
              <p className="text-gray-400 mt-2 max-w-lg">
                Define las reglas de negocio para el cumplimiento diario de temperaturas. 
                El sistema omitirá automáticamente los fines de semana (Sábados y Domingos).
              </p>
              
              <div className="mt-8 space-y-6 max-w-md">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 ml-1">
                    Inicio del Control Histórico
                  </label>
                  <div className="flex gap-3">
                    <input 
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                    <button
                      onClick={handleSaveTempSettings}
                      disabled={savingTemp || !tempStartDate}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                    >
                      {savingTemp ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                      Guardar
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2 italic">
                    * Los días anteriores a esta fecha no serán contados como faltantes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cámaras de Frío */}
      <section className="bg-[#1e293b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-8">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-teal-500/10 text-teal-400">
              <Thermometer className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">Cámaras en Frío</h2>
              <p className="text-gray-400 mt-2">
                Define las cámaras disponibles para registrar las mediciones diarias de temperatura. 
                Los usuarios sólo podrán elegir de esta lista para evitar errores de digitación.
              </p>

              {/* Crear nueva cámara */}
              <form onSubmit={handleAddChamber} className="mt-6 flex gap-3 max-w-md">
                <input
                  type="text"
                  required
                  placeholder="Ej: CÁMARA 3"
                  value={newChamberName}
                  onChange={(e) => setNewChamberName(e.target.value.toUpperCase())}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-all"
                />
                <button
                  type="submit"
                  disabled={savingChamber || !newChamberName.trim()}
                  className="px-6 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm uppercase tracking-wider shrink-0"
                >
                  {savingChamber ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                  Agregar
                </button>
              </form>

              {/* Listado de cámaras */}
              <div className="mt-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4 ml-1">
                  Cámaras Configuradas
                </h4>
                {loadingChambers ? (
                  <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                    <Loader2 size={16} className="animate-spin text-teal-500" />
                    Cargando cámaras...
                  </div>
                ) : chambers.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 italic">No hay cámaras de frío registradas.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                    {chambers.map((chamber) => (
                      <div
                        key={chamber.id}
                        className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:border-white/10"
                      >
                        <div>
                          <p className="text-sm font-bold text-white tracking-wide">{chamber.name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {chamber.active ? '🟢 Activa' : '🔴 Inactiva'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleChamber(chamber.id, !chamber.active)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                              chamber.active
                                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                                : 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
                            }`}
                          >
                            {chamber.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pending Sync Section */}
      {googleConnected && (
        <section 
          className="relative overflow-hidden border border-indigo-500/20 rounded-3xl shadow-xl transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(99, 102, 241, 0.04) 100%)',
            backdropFilter: 'blur(20px)'
          }}
        >
          <div className="p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-5 flex-1">
                <div className={`p-4 rounded-2xl flex-shrink-0 transition-transform duration-300 ${pendingDocs.total > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {pendingDocs.total > 0 ? <AlertTriangle className="w-8 h-8 animate-pulse" /> : <FileCheck className="w-8 h-8" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black tracking-tight text-white">Sincronización de Archivos Pendientes</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {pendingDocs.total > 0 
                      ? `Hay ${pendingDocs.total} archivos registrados en Supabase que aún no han sido respaldados en Google Drive.`
                      : 'Todos los documentos están sincronizados con Google Drive correctamente.'}
                  </p>
                  
                  {syncingAll && (
                    <div className="mt-4 space-y-2">
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5 relative">
                        <div 
                          className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        <span className="text-blue-400 lowercase italic normal-case truncate max-w-[280px]">
                          Subiendo: {currentSyncingName}
                        </span>
                        <span>
                          {syncProgress.current} / {syncProgress.total} ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
 
              {pendingDocs.total > 0 && !syncingAll && (
                <button
                  onClick={handleSyncAll}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Send size={16} />
                  Sincronizar {pendingDocs.total} Archivos
                </button>
              )}

              {syncingAll && (
                <div className="flex items-center gap-2.5 px-6 py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold rounded-2xl select-none min-w-[200px] justify-center">
                  <Loader2 size={16} className="animate-spin" />
                  Sincronizando...
                </div>
              )}
            </div>
 
            {pendingDocs.total > 0 && !syncingAll && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 transition-all hover:border-white/10 hover:bg-white/8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Documentos de Lotes</span>
                    <span className="text-lg font-black text-white">{pendingDocs.lots?.length || 0}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 transition-all hover:border-white/10 hover:bg-white/8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Documentos de Despachos</span>
                    <span className="text-lg font-black text-white">{pendingDocs.dispatches?.length || 0}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 transition-all hover:border-white/10 hover:bg-white/8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Documentos de Temperatura</span>
                    <span className="text-lg font-black text-white">{pendingDocs.temperatures?.length || 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {/* Reorganización de Drive (Herramientas de Mantenimiento) */}
      <section className="bg-[#1e293b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-8">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500">
              <Cloud className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">Mantenimiento y Estructura de Archivos</h2>
              <p className="text-gray-400 mt-2 max-w-xl">
                Reorganiza programáticamente las carpetas de Google Drive de todos los clientes creados. 
                Crea las subcarpetas <b>Recepciones</b>, <b>Despachos</b> y <b>Financiero</b> para cada uno, 
                y agrupa de forma segura los lotes, despachos y facturas existentes sin alterar sus IDs ni romper accesos.
              </p>

              <div className="mt-6 flex flex-col gap-4 max-w-xl">
                <button
                  type="button"
                  onClick={handleReorganizeDrive}
                  disabled={reorganizing}
                  className="w-fit px-8 py-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-amber-900/30 flex items-center gap-3 text-sm uppercase tracking-wider shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {reorganizing ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
                  Reestructurar Google Drive por Cliente
                </button>

                {reorganizing && (
                  <p className="text-amber-400 text-xs animate-pulse font-medium">
                    ⚠️ Moviendo carpetas y archivos en Google Drive de forma segura, por favor no cierres esta página...
                  </p>
                )}

                {reorganizeResult && (
                  <div className="mt-4 bg-[#0B0F19] border border-white/10 rounded-2xl p-5 max-h-[300px] overflow-y-auto space-y-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2">
                      Reporte de Reorganización:
                    </h4>
                    {reorganizeResult.map((rep: any, idx: number) => (
                      <div key={idx} className="space-y-2 text-xs">
                        <p className="font-bold text-teal-400 uppercase tracking-wide">💼 {rep.clientName}</p>
                        
                        {rep.createdSubfolders.length > 0 && (
                          <p className="text-gray-400 pl-4">
                            📁 Subcarpetas creadas: <span className="text-white font-medium">{rep.createdSubfolders.join(', ')}</span>
                          </p>
                        )}
                        
                        {rep.movedLots.length > 0 && (
                          <div className="pl-4">
                            <p className="text-gray-400">📦 Lotes movidos a Recepciones ({rep.movedLots.length}):</p>
                            <ul className="list-disc list-inside text-gray-500 pl-2">
                              {rep.movedLots.map((l: string, i: number) => <li key={i}>{l}</li>)}
                            </ul>
                          </div>
                        )}

                        {rep.movedDispatches.length > 0 && (
                          <div className="pl-4">
                            <p className="text-gray-400">🚚 Despachos movidos a Despachos ({rep.movedDispatches.length}):</p>
                            <ul className="list-disc list-inside text-gray-500 pl-2">
                              {rep.movedDispatches.map((d: string, i: number) => <li key={i}>{d}</li>)}
                            </ul>
                          </div>
                        )}

                        {rep.movedDocuments.length > 0 && (
                          <div className="pl-4">
                            <p className="text-gray-400">📄 Archivos financieros movidos ({rep.movedDocuments.length}):</p>
                            <ul className="list-disc list-inside text-gray-500 pl-2">
                              {rep.movedDocuments.map((doc: string, i: number) => <li key={i}>{doc}</li>)}
                            </ul>
                          </div>
                        )}

                        {rep.errors.length > 0 && (
                          <div className="pl-4 text-red-400">
                            <p className="font-semibold">❌ Errores detectados:</p>
                            <ul className="list-disc list-inside pl-2">
                              {rep.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Info Areas */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex gap-4">
          <AlertTriangle className="text-amber-500 flex-shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-amber-500">Nota de Almacenamiento</h3>
            <p className="text-sm text-amber-500/80 mt-1">
              La base de datos Supabase tiene un límite de almacenamiento menor. Google Drive se utiliza como el repositorio principal para archivos pesados e históricos.
            </p>
          </div>
        </div>
        
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-6 flex gap-4">
          <RefreshCw className="text-blue-500 flex-shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-blue-500">Mantenimiento de Tokens</h3>
            <p className="text-sm text-blue-500/80 mt-1">
              Si experimentas errores de subida, intenta "Actualizar Token" para renovar los permisos de acceso a tu cuenta de Drive.
            </p>
          </div>
        </div>
      </section>

      <div className="text-center pt-8">
        <p className="text-gray-500 text-sm">
          ¿Necesitas ayuda con la configuración? 
          <a href="#" className="ml-2 text-blue-500 hover:underline flex inline-flex items-center gap-1">
            Ver manual de administración <ExternalLink size={12} />
          </a>
        </p>
      </div>
    </div>
  )
}

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-blue-500" /></div>}>
      <ConfigurationContent />
    </Suspense>
  )
}
