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
  Thermometer
} from 'lucide-react'

function ConfigurationContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [pendingDocs, setPendingDocs] = useState<{ lots: any[], dispatches: any[], total: number }>({ lots: [], dispatches: [], total: 0 })
  const [syncingAll, setSyncingAll] = useState(false)
  
  // Temperature Settings
  const [tempStartDate, setTempStartDate] = useState('')
  const [savingTemp, setSavingTemp] = useState(false)

  useEffect(() => {
    fetchStatus()
    fetchTempSettings()
    
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
    
    try {
      setSyncingAll(true)
      const res = await fetch('/api/settings/drive-sync-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'lot_documents' }) // El endpoint ya maneja lotes y despachos si se desea, o lo llamamos secuencial
      })

      // Llamada para despachos también
      await fetch('/api/settings/drive-sync-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'dispatch_documents' })
      })
      
      await fetchPendingDocs()
      alert('Sincronización completada.')
    } catch (e) {
      alert('Error en la sincronización.')
    } finally {
      setSyncingAll(false)
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

      {/* Pending Sync Section */}
      {googleConnected && (
        <section className="bg-[#0f172a] border border-indigo-500/20 rounded-3xl overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className={`p-4 rounded-2xl ${pendingDocs.total > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {pendingDocs.total > 0 ? <AlertTriangle className="w-8 h-8" /> : <FileCheck className="w-8 h-8" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Sincronización de Archivos Pendientes</h2>
                  <p className="text-gray-400 mt-1">
                    {pendingDocs.total > 0 
                      ? `Hay ${pendingDocs.total} archivos que solo están en Supabase y no han llegado a Google Drive.`
                      : 'Todos los archivos están correctamente respaldados en Google Drive.'}
                  </p>
                </div>
              </div>

              {pendingDocs.total > 0 && (
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  {syncingAll ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  Sincronizar {pendingDocs.total} Archivos
                </button>
              )}
            </div>

            {pendingDocs.total > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Documentos de Lotes</span>
                    <span className="text-lg font-bold text-white">{pendingDocs.lots.length}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Documentos de Despachos</span>
                    <span className="text-lg font-bold text-white">{pendingDocs.dispatches.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

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
