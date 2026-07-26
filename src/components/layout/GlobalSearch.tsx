'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, Package, Truck, Briefcase, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface Resultado {
  tipo: 'lote' | 'despacho' | 'cliente'
  id: string
  titulo: string
  subtitulo: string
  href: string
}

const ICONOS = { lote: Package, despacho: Truck, cliente: Briefcase }

// ─────────────────────────────────────────────────────────────────────────────
// Buscador global: antes, para encontrar un contenedor o un lote había que
// adivinar en qué módulo estaba y usar el filtro de esa pantalla. Esto busca
// en Lotes, Despachos y Clientes a la vez, desde cualquier pantalla.
// ─────────────────────────────────────────────────────────────────────────────
export default function GlobalSearch() {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResultados([]); return }
    setBuscando(true)
    try {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q.trim())}`, {
        headers: { 'x-user-role': user?.role || '' },
      })
      const json = await res.json()
      setResultados(json.data || [])
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [user])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, buscar])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResultados([]) }
  }, [open])

  // Atajo de teclado: Ctrl/Cmd + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const irA = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200"
        style={{ backgroundColor: 'var(--nav-hover-bg)', color: 'var(--text-secondary)' }}
      >
        <Search size={16} />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar despacho, lote, contenedor o cliente..."
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
              />
              {buscando && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {query.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p className="text-center text-gray-500 text-sm py-8">Sin resultados para "{query}"</p>
              )}
              {resultados.map(r => {
                const Icon = ICONOS[r.tipo]
                return (
                  <button
                    key={`${r.tipo}_${r.id}`}
                    onClick={() => irA(r.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-white/5 text-indigo-400 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{r.titulo}</p>
                      {r.subtitulo && <p className="text-xs text-gray-500 truncate">{r.subtitulo}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
