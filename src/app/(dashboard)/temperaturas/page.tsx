'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Thermometer, Plus, RefreshCw, CheckCircle, Clock,
  AlertCircle, XCircle, Calendar, FolderOpen, ExternalLink,
  ChevronRight, AlertTriangle, CalendarDays, ArrowLeft, ArrowRight
} from 'lucide-react'

interface TemperatureReport {
  id: string
  internal_code: string
  report_date: string
  chamber: string | null
  client: string | null
  temperature_value: number | null
  status: string
  observation: string | null
  drive_folder_url: string | null
  created_at: string
  responsible?: { display_name: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',    dot: 'bg-gray-500',   icon: <Clock className="w-3 h-3" /> },
  uploaded:  { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400', icon: <Thermometer className="w-3 h-3" /> },
  validated: { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400', icon: <CheckCircle className="w-3 h-3" /> },
  observed:  { label: 'Registrado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400', icon: <AlertCircle className="w-3 h-3" /> },
  late:      { label: 'Atrasado',   color: 'text-red-400 bg-red-500/10 border-red-500/30',       dot: 'bg-red-400',    icon: <XCircle className="w-3 h-3" /> },
}

// Modal de creación de nuevo reporte
function NewReportModal({ onClose, onCreated, initialDate }: { onClose: () => void; onCreated: () => void; initialDate?: string }) {
  const [form, setForm] = useState({
    report_date: initialDate || new Date().toISOString().split('T')[0],
    chamber: '',
    client: '',
    temperature_value: '',
    observation: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/temperaturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        temperature_value: form.temperature_value ? parseFloat(form.temperature_value) : null,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Error al crear el reporte')
    } else {
      onCreated()
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-r from-blue-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
              <Thermometer className="w-5 h-5" />
            </div>
            <h2 className="text-white font-bold text-lg tracking-tight">Registro de Temperatura</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-all p-2 hover:bg-white/5 rounded-full">
            <XCircle size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-red-400 text-xs font-medium animate-pulse">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2 ml-1">Fecha de Medición</label>
            <input
              type="date"
              required
              value={form.report_date}
              onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2 ml-1">Cámara</label>
              <input
                type="text"
                placeholder="Ej: Cámara 1"
                value={form.chamber}
                onChange={e => setForm(f => ({ ...f, chamber: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2 ml-1">Valor (°C)</label>
              <input
                type="number"
                step="0.1"
                placeholder="Ej: -1.5"
                value={form.temperature_value}
                onChange={e => setForm(f => ({ ...f, temperature_value: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2 ml-1">Cliente / Lote</label>
            <input
              type="text"
              placeholder="Ej: The Growers (Dejar vacío para general)"
              value={form.client}
              onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2 ml-1">Observaciones</label>
            <textarea
              placeholder="Notas adicionales..."
              rows={2}
              value={form.observation}
              onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-4 rounded-2xl border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-4 rounded-2xl bg-blue-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TemperaturasPage() {
  const [reports, setReports] = useState<TemperatureReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined)
  const [controlStartDate, setControlStartDate] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/temperaturas?limit=100')
      const configRes = await fetch('/api/settings/temperature-control')
      
      if (res.ok) {
        const json = await res.json()
        setReports(json.data || [])
        setTotal(json.total || 0)
      }
      
      if (configRes.ok) {
        const config = await configRes.json()
        if (config.value) setControlStartDate(config.value)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReports() }, [])

  // Lógica para detectar días faltantes (últimos 30 días)
  const getMissingDays = () => {
    const missing = []
    const checkDate = new Date()
    checkDate.setHours(0, 0, 0, 0)
    
    // Obtener la fecha de inicio de control desde la configuración
    const controlStart = controlStartDate ? new Date(controlStartDate) : new Date('2000-01-01')
    controlStart.setHours(0, 0, 0, 0)

    for (let i = 1; i <= 30; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      
      // Regla 1: No contar antes de la fecha de inicio (comparación de strings es más segura)
      if (controlStartDate && dateStr < controlStartDate) continue

      // Regla 2: No contar Sábados (6) ni Domingos (0)
      const dayOfWeek = d.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      const hasReport = reports.some(r => r.report_date === dateStr)
      if (!hasReport) {
        missing.push(dateStr)
      }
    }
    return missing.sort((a, b) => b.localeCompare(a))
  }

  const missingDays = getMissingDays()

  const formatDateShort = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}`
  }

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  // Generar datos para el calendario
  const getCalendarDays = () => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    
    const days = []
    // Padding días mes anterior
    const firstDay = start.getDay() // 0-6
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    
    // Días del mes actual
    for (let i = 1; i <= end.getDate(); i++) {
      const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i)
      const dateStr = d.toISOString().split('T')[0]
      const dayReports = reports.filter(r => r.report_date === dateStr)
      days.push({ date: dateStr, day: i, reports: dayReports })
    }
    
    return days
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {showModal && (
        <NewReportModal 
          onClose={() => { setShowModal(false); setSelectedDate(undefined); }} 
          onCreated={fetchReports} 
          initialDate={selectedDate}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-2xl text-blue-400">
              <Thermometer size={28} />
            </div>
            Control de Temperaturas
          </h1>
          <p className="text-gray-400 mt-2 ml-14">Historial y cumplimiento diario de cámaras de frío.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-white/5 p-1 rounded-2xl border border-white/10 flex">
             <button 
               onClick={() => setViewMode('calendar')}
               className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'calendar' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
             >
               Calendario
             </button>
             <button 
               onClick={() => setViewMode('list')}
               className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
             >
               Lista
             </button>
          </div>
          <button
            onClick={() => { setSelectedDate(undefined); setShowModal(true); }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95"
          >
            <Plus size={18} />
            Nuevo Registro
          </button>
        </div>
      </div>

      {/* Alerta de Incumplimiento */}
      {!loading && missingDays.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <AlertTriangle size={120} className="text-rose-500" />
          </div>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-500/20 rounded-2xl text-rose-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Días sin Registro Detectados</h3>
              <p className="text-rose-400/80 text-sm mt-1 max-w-md">
                Se han detectado {missingDays.length} días sin datos de temperatura en los últimos 30 días. Por normativa, deben estar todos registrados.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {missingDays.slice(0, 5).map(d => (
                  <button 
                    key={d}
                    onClick={() => { setSelectedDate(d); setShowModal(true); }}
                    className="px-3 py-1.5 bg-rose-500/20 border border-rose-500/30 rounded-xl text-[10px] font-bold text-rose-400 hover:bg-rose-500/30 transition-all uppercase tracking-widest"
                  >
                    Registrar {formatDateShort(d)}
                  </button>
                ))}
                {missingDays.length > 5 && <span className="text-[10px] text-gray-500 font-bold self-center">Y {missingDays.length - 5} MÁS...</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
             <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">Tasa de Cumplimiento</span>
             <span className="text-3xl font-black text-white">{Math.round(((30 - missingDays.length) / 30) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Resumen Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-5">
           <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
             <Calendar size={12} /> Hoy ({formatDateShort(today)})
           </p>
            {loading ? (
              <div className="h-7 w-24 rounded-lg bg-white/5 animate-pulse mt-2" />
            ) : reports.some(r => r.report_date === today) ? (
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xl mt-2">
                <CheckCircle size={20} /> Registrado
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500 font-bold text-xl mt-2">
                {new Date().getDay() === 0 || new Date().getDay() === 6 ? (
                  <>
                    <Clock size={20} /> No Requerido
                  </>
                ) : (
                  <>
                    <AlertCircle className="text-rose-400" size={20} /> <span className="text-rose-400">Pendiente</span>
                  </>
                )}
              </div>
            )}
        </div>
        <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-5">
           <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
             <RefreshCw size={12} /> Total Histórico
           </p>
           {loading ? (
             <div className="h-8 w-12 rounded-lg bg-white/5 animate-pulse mt-1" />
           ) : (
             <p className="text-3xl font-black text-white mt-1">{total}</p>
           )}
        </div>
        <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-5">
           <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
             <FolderOpen size={12} /> Con Archivos
           </p>
           {loading ? (
             <div className="h-8 w-12 rounded-lg bg-white/5 animate-pulse mt-1" />
           ) : (
             <p className="text-3xl font-black text-white mt-1">
               {reports.filter(r => r.status === 'uploaded' || r.status === 'validated').length}
             </p>
           )}
        </div>
        <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-5">
           <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
             <Clock size={12} /> Último Registro
           </p>
           {loading ? (
             <div className="h-7 w-24 rounded-lg bg-white/5 animate-pulse mt-2" />
           ) : (
             <p className="text-xl font-bold text-indigo-400 mt-2 truncate">
               {reports[0] ? formatDateShort(reports[0].report_date) : '—'}
             </p>
           )}
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'calendar' ? (
        <div className="space-y-4">
          {/* Calendar Controls */}
          <div className="flex items-center justify-between bg-[#0f172a] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 capitalize">
                <CalendarDays className="text-indigo-400" />
                {currentMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <div className="flex gap-1">
               <button 
                 onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                 className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"
               >
                 <ArrowLeft size={20} />
               </button>
               <button 
                 onClick={() => setCurrentMonth(new Date())}
                 className="px-4 py-2 hover:bg-white/5 rounded-xl text-[10px] font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-all"
               >
                 Mes Actual
               </button>
               <button 
                 onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                 className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"
               >
                 <ArrowRight size={20} />
               </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="grid grid-cols-7 border-b border-white/5 bg-white/5">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                <div key={d} className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 border-r border-white/5 last:border-0">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-collapse">
              {loading ? (
                Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-28 border-r border-b border-white/5 bg-white/[0.01] animate-pulse p-3 flex flex-col justify-between">
                    <div className="h-4 bg-white/5 rounded w-6" />
                    <div className="h-8 bg-white/5 rounded-xl w-full mt-2" />
                  </div>
                ))
              ) : getCalendarDays().map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="h-28 border-r border-b border-white/5 bg-black/10 last:border-r-0" />
                
                const isToday = day.date === today
                const isFuture = day.date > today
                
                // Nueva lógica de "Falta Registro":
                // 1. Debe ser anterior a hoy
                // 2. No debe tener reportes
                // 3. No debe ser fin de semana
                // 4. No debe ser anterior a la fecha de inicio de control
                const dObj = new Date(day.date + 'T12:00:00') // Usar mediodía para evitar problemas de zona horaria
                const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6
                const isBeforeStart = controlStartDate ? day.date < controlStartDate : false
                
                const isMissing = day.reports.length === 0 && day.date < today && !isFuture && !isWeekend && !isBeforeStart
                
                return (
                  <div 
                    key={day.date} 
                    onClick={() => {
                      if (day.reports.length === 1) router.push(`/temperaturas/${day.reports[0].id}`)
                      else if (day.reports.length === 0 && !isFuture) { setSelectedDate(day.date); setShowModal(true); }
                    }}
                    className={`h-28 p-3 border-r border-b border-white/5 relative group transition-all hover:z-10
                      ${isToday ? 'bg-blue-500/5' : ''} 
                      ${isMissing ? 'bg-rose-500/[0.03]' : ''} 
                      ${isFuture ? 'opacity-30 cursor-default' : 'hover:bg-indigo-500/10'}`}
                  >
                    <div className="flex justify-between items-start">
                       <span className={`text-xs font-bold ${isToday ? 'bg-blue-500 text-white w-6 h-6 rounded-lg flex items-center justify-center' : 'text-gray-500 group-hover:text-white'}`}>
                         {day.day}
                       </span>
                       {day.reports.length > 1 && !isFuture && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedDate(day.date); setShowModal(true); }}
                            className="p-1 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            title="Agregar reporte para otro cliente"
                          >
                             <Plus size={10} />
                          </button>
                       )}
                    </div>
                    
                    <div className="mt-2 space-y-1.5 max-h-[60px] overflow-y-auto custom-scrollbar">
                      {day.reports.map((report) => (
                        <div 
                          key={report.id} 
                          onClick={(e) => { e.stopPropagation(); router.push(`/temperaturas/${report.id}`); }}
                          className="flex items-center gap-1.5 px-1.5 py-1 bg-white/5 border border-white/5 rounded-lg hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all cursor-pointer group/item"
                        >
                          <div className="w-1 h-3 bg-emerald-500 rounded-full shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[9px] font-black text-white truncate leading-none">
                              {report.temperature_value}°C
                            </div>
                            <div className="text-[7px] text-gray-500 font-bold uppercase tracking-widest truncate leading-none mt-0.5 group-hover/item:text-gray-300">
                              {report.client || report.chamber || 'Cámara'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {isMissing && (
                      <div className="absolute inset-x-0 bottom-3 px-3">
                         <div className="flex items-center gap-1 text-[8px] font-black text-rose-500 uppercase tracking-widest">
                           <AlertTriangle size={10} /> Pendiente
                         </div>
                      </div>
                    )}

                    {day.reports.length === 0 && !isFuture && !isMissing && !isToday && (
                       <Plus size={14} className="absolute bottom-3 right-3 text-gray-700 opacity-0 group-hover:opacity-100 transition-all" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Cámara / Cliente</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-white/5 rounded w-24" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-white/5 rounded w-16" /></td>
                    <td className="px-6 py-4"><div className="h-6 bg-white/5 rounded-lg w-16" /></td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-white/5 rounded w-24 mb-1" />
                      <div className="h-3 bg-white/5 rounded w-16" />
                    </td>
                    <td className="px-6 py-4"><div className="h-4 bg-white/5 rounded w-20" /></td>
                    <td className="px-6 py-4 text-right"><div className="h-5 bg-white/5 rounded-full w-5 ml-auto" /></td>
                  </tr>
                ))
              ) : reports.map((report) => {
                const isToday = report.report_date === today
                return (
                  <tr 
                    key={report.id} 
                    onClick={() => router.push(`/temperaturas/${report.id}`)}
                    className={`hover:bg-white/[0.02] transition-all cursor-pointer group ${isToday ? 'bg-blue-500/5' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-white font-bold text-sm">
                        <Calendar size={14} className="text-gray-500" />
                        {formatDate(report.report_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs font-mono">{report.internal_code}</td>
                    <td className="px-6 py-4">
                       <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg font-bold border border-blue-500/20">
                         {report.temperature_value !== null ? `${report.temperature_value}°C` : '—'}
                       </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-white font-medium">{report.chamber || 'General'}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">{report.client || 'Sin Cliente'}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {report.responsible?.display_name || 'Sistema'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight size={18} className="text-gray-700 group-hover:text-white transition-all ml-auto" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
