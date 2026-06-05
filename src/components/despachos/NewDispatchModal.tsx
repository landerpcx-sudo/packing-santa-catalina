'use client'

import { useState, useEffect } from 'react'
import { X, Truck, Calendar, MapPin, Building2, Package } from 'lucide-react'

interface Props {
  onClose: () => void
  onSuccess: () => void
  initialData?: any
}

function getLocalDateString(d: Date = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function NewDispatchModal({ onClose, onSuccess, initialData }: Props) {
  const isEdit = !!initialData
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<string[]>([])

  const [formData, setFormData] = useState({
    dispatch_code: initialData?.dispatch_code || '',
    client: initialData?.client || '',
    destination: initialData?.destination || '',
    expected_pallets: initialData?.expected_pallets?.toString() || '',
    dispatch_date: initialData?.dispatch_date ? initialData.dispatch_date.split('T')[0] : getLocalDateString(),
    container_number: initialData?.container_number || ''
  })

  useEffect(() => {
    fetch('/api/catalogos')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setClients(data.clients || [])
        }
      })
      .catch(err => console.error('Error cargando catálogo en despachos:', err))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = isEdit ? `/api/despachos/${initialData.id}` : '/api/despachos'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || `Error al ${isEdit ? 'editar' : 'crear'} el despacho`)
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!loading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{isEdit ? 'Editar Despacho' : 'Nuevo Despacho'}</h2>
              <p className="text-sm text-gray-400">{isEdit ? `Editando ${initialData.internal_code}` : 'Registra una nueva salida de fruta'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Código de Despacho {!isEdit && '(Obligatorio)'}
              </label>
              <div className="relative">
                <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  maxLength={3}
                  required
                  disabled={isEdit}
                  value={formData.dispatch_code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '')
                    setFormData({ ...formData, dispatch_code: val })
                  }}
                  onBlur={() => {
                    if (formData.dispatch_code) {
                      setFormData({ 
                        ...formData, 
                        dispatch_code: formData.dispatch_code.toString().trim().padStart(3, '0') 
                      })
                    }
                  }}
                  placeholder="Ej: 001"
                  className={`w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all ${isEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Fecha de Despacho
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    required
                    value={formData.dispatch_date}
                    onChange={(e) => setFormData({ ...formData, dispatch_date: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Pallets Esperados
                </label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="number"
                    min="1"
                    value={formData.expected_pallets}
                    onChange={(e) => setFormData({ ...formData, expected_pallets: e.target.value })}
                    placeholder="Ej: 22"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Cliente
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <select
                  required
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#1a1f2e]">Selecciona un cliente</option>
                  {clients.map(c => (
                    <option key={c} value={c} className="bg-[#1a1f2e]">{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Destino
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="Ej: Puerto Valparaíso"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Número del Contenedor {!isEdit && '(Obligatorio)'}
              </label>
              <div className="relative">
                <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  required={!isEdit}
                  value={formData.container_number}
                  onChange={(e) => setFormData({ ...formData, container_number: e.target.value })}
                  placeholder="Ej: MSKU1234567"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-400/50 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isEdit ? 'Guardando...' : 'Creando despacho...'}
                </>
              ) : (
                isEdit ? 'Guardar Cambios' : 'Crear Despacho'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
