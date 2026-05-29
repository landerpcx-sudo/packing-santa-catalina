'use client'

import { useState, useEffect } from 'react'
import { X, Package, User, Leaf, Tag } from 'lucide-react'

interface NewLotModalProps {
  onClose: () => void
  onSuccess: () => void
  initialData?: any
}

export default function NewLotModal({ onClose, onSuccess, initialData }: NewLotModalProps) {
  const isEdit = !!initialData
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    lot_number: initialData?.lot_number || '',
    client: initialData?.client || '',
    producer: initialData?.producer || '',
    species: initialData?.species || 'Manzana',
    variety: initialData?.variety || '',
  })

  const [suggestions, setSuggestions] = useState<{
    clients: string[]
    producers: string[]
    varieties: string[]
  }>({ clients: [], producers: [], varieties: [] })

  useEffect(() => {
    fetch('/api/catalogos')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setSuggestions({
            clients: data.clients || [],
            producers: data.producers || [],
            varieties: data.varieties || [],
          })
        }
      })
      .catch(err => console.error('Error cargando catálogos:', err))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const url = isEdit ? `/api/lotes/${initialData.id}` : '/api/lotes'
      const method = isEdit ? 'PATCH' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || `Error al ${isEdit ? 'editar' : 'crear'} el lote`)
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400/60 focus:bg-white/8 transition-all duration-200 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#111827] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-gradient-to-r from-green-900/30 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">{isEdit ? 'Editar Lote' : 'Nuevo Lote'}</h2>
              <p className="text-gray-400 text-xs">{isEdit ? `Editando ${initialData.internal_code}` : 'Se creará automáticamente la carpeta en Drive'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Número de lote */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5 ml-1">
              Número de Lote {!isEdit && <span className="text-red-400">*</span>}
            </label>
            <div className="relative">
              <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                maxLength={3}
                required
                disabled={isEdit}
                placeholder="ej: 009"
                value={form.lot_number}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setForm({ ...form, lot_number: val })
                }}
                onBlur={() => {
                  if (form.lot_number) {
                    setForm({ ...form, lot_number: form.lot_number.toString().trim().padStart(3, '0') })
                  }
                }}
                className={`${inputClass} pl-10 ${isEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
            {!isEdit && form.lot_number && (
              <p className="text-green-400 text-xs mt-1 ml-1">
                Código: LOT-{new Date().getFullYear()}-{form.lot_number.toString().padStart(3, '0')}
              </p>
            )}
            {isEdit && (
              <p className="text-gray-500 text-[10px] mt-1 ml-1">El número de lote no se puede cambiar para mantener consistencia con Drive.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cliente */}
            <div>
              <label className="block text-gray-400 text-xs font-medium mb-1.5 ml-1">Cliente</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <select
                  value={form.client}
                  onChange={(e) => setForm({ ...form, client: e.target.value })}
                  className={inputClass + ' pl-10 appearance-none cursor-pointer'}
                  required
                >
                  <option value="" className="bg-[#111827]">Selecciona un cliente</option>
                  {suggestions.clients.map(c => (
                    <option key={c} value={c} className="bg-[#111827]">{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Productor */}
            <div>
              <label className="block text-gray-400 text-xs font-medium mb-1.5 ml-1">Productor</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Nombre del productor"
                  value={form.producer}
                  onChange={(e) => setForm({ ...form, producer: e.target.value.toUpperCase() })}
                  className={inputClass + ' pl-10'}
                  list="producers-list"
                />
                <datalist id="producers-list">
                  {suggestions.producers.map(p => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Especie */}
            <div>
              <label className="block text-gray-400 text-xs font-medium mb-1.5 ml-1">Especie</label>
              <div className="relative">
                <Leaf className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <select
                  value={form.species}
                  onChange={(e) => setForm({ ...form, species: e.target.value })}
                  className={inputClass + ' pl-10 appearance-none cursor-pointer'}
                >
                  <option value="Manzana" className="bg-[#111827]">Manzana</option>
                  <option value="Pera" className="bg-[#111827]">Pera</option>
                  <option value="Limón" className="bg-[#111827]">Limón</option>
                  <option value="Cereza" className="bg-[#111827]">Cereza</option>
                  <option value="Uva" className="bg-[#111827]">Uva</option>
                  <option value="Nectarín" className="bg-[#111827]">Nectarín</option>
                  <option value="Durazno" className="bg-[#111827]">Durazno</option>
                  <option value="Ciruela" className="bg-[#111827]">Ciruela</option>
                  <option value="Otra" className="bg-[#111827]">Otra</option>
                </select>
              </div>
            </div>

            {/* Variedad */}
            <div>
              <label className="block text-gray-400 text-xs font-medium mb-1.5 ml-1">Variedad</label>
              <div className="relative">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="ej: Fuji, Williams"
                  value={form.variety}
                  onChange={(e) => setForm({ ...form, variety: e.target.value.toUpperCase() })}
                  className={inputClass + ' pl-10'}
                  list="varieties-list"
                />
                <datalist id="varieties-list">
                  {suggestions.varieties.map(v => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Info Drive (Sólo en creación) */}
          {!isEdit && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="w-5 h-5 mt-0.5 flex-shrink-0">
                <svg viewBox="0 0 87.3 78" className="w-full h-full opacity-60">
                  <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H13.4c0 1.55-.4 3.1-1.2 4.5z" fill="#0066da"/>
                  <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.4C.4 49.8 0 51.35 0 52.9h27.5z" fill="#00ac47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60.1l5.85 11.5z" fill="#ea4335"/>
                  <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="M59.8 52.9H27.5L13.75 76.7c1.35.8 2.9 1.3 4.5 1.3H69.05c1.6 0 3.15-.45 4.5-1.3z" fill="#2684fc"/>
                  <path d="M73.4 26.45l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.25L43.65 25l16.45 27.9H87.1c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
              </div>
              <p className="text-blue-300/70 text-xs leading-relaxed">
                Al crear el lote, se generará automáticamente una carpeta en Google Drive con las subcarpetas correspondientes.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-white/15 rounded-xl text-gray-300 hover:bg-white/5 hover:text-white transition-all text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !form.lot_number}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isEdit ? 'Guardando...' : 'Creando en Drive...'}
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  {isEdit ? 'Guardar Cambios' : 'Crear Lote'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
