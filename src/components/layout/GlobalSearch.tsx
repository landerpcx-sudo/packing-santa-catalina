'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, Loader2, Package, Truck, Briefcase, X, CornerDownLeft } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface Resultado {
  tipo: 'lote' | 'despacho' | 'cliente'
  id: string
  titulo: string
  subtitulo: string
  href: string
}

const ICONOS = { lote: Package, despacho: Truck, cliente: Briefcase }
const ETIQUETAS = { lote: 'Lote', despacho: 'Despacho', cliente: 'Cliente' }

// ─────────────────────────────────────────────────────────────────────────────
// Buscador global: antes, para encontrar un contenedor o un lote había que
// adivinar en qué módulo estaba y usar el filtro de esa pantalla. Esto busca
// en Lotes, Despachos y Clientes a la vez, desde cualquier pantalla.
//
// El modal se monta UNA sola vez en el layout (vía GlobalSearchProvider) y se
// dibuja con createPortal sobre <body>, igual que Toast. Es imprescindible:
// el <aside> de la barra lateral lleva backdrop-filter, y un ancestro con
// backdrop-filter convierte a sus hijos `position: fixed` en relativos a él,
// así que un modal montado dentro del sidebar salía encogido a 256px en vez de
// cubrir la pantalla. Además, SidebarContent se dibuja dos veces (escritorio y
// móvil), por lo que un buscador montado ahí duplicaba el atajo Ctrl+K.
// ─────────────────────────────────────────────────────────────────────────────

interface GlobalSearchContextValue {
  abrirBuscador: () => void
  cerrarBuscador: () => void
  buscadorAbierto: boolean
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext)
  if (!ctx) throw new Error('useGlobalSearch debe usarse dentro de GlobalSearchProvider')
  return ctx
}

// ─── Botón disparador (va dentro del sidebar) ────────────────────────────────
export default function GlobalSearchButton() {
  const { abrirBuscador } = useGlobalSearch()

  return (
    <button
      onClick={abrirBuscador}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200"
      style={{ backgroundColor: 'var(--nav-hover-bg)', color: 'var(--text-secondary)' }}
      aria-label="Abrir buscador global"
    >
      <Search size={16} />
      <span className="flex-1 text-left">Buscar...</span>
      <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Ctrl K</kbd>
    </button>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [activo, setActivo] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cada búsqueda lleva un número de orden: si una respuesta lenta llega
  // después de otra más nueva, se descarta en vez de pisar los resultados.
  const peticionRef = useRef(0)

  const buscar = useCallback(async (q: string) => {
    const nro = ++peticionRef.current
    if (q.trim().length < 2) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    try {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q.trim())}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-id': user?.userId || '',
          'x-user-client-name': user?.client_name || user?.clientName || '',
        },
      })
      const json = await res.json()
      if (nro !== peticionRef.current) return
      setResultados(json.data || [])
      setActivo(0)
    } catch {
      if (nro === peticionRef.current) setResultados([])
    } finally {
      if (nro === peticionRef.current) setBuscando(false)
    }
  }, [user])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, buscar])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // Bloquea el scroll del fondo mientras el buscador está abierto
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [])

  const irA = useCallback((href: string) => {
    onClose()
    router.push(href)
  }, [onClose, router])

  // Navegación con teclado: ↑ ↓ para moverse, Enter para abrir, Esc para cerrar
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo(i => (resultados.length ? (i + 1) % resultados.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo(i => (resultados.length ? (i - 1 + resultados.length) % resultados.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = resultados[activo]
      if (r) irA(r.href)
    }
  }

  // Mantiene visible el resultado seleccionado al moverse con el teclado
  useEffect(() => {
    const nodo = listaRef.current?.children[activo] as HTMLElement | undefined
    nodo?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar despacho, lote, contenedor o cliente..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Texto a buscar"
          />
          {buscando && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
          <button
            onClick={onClose}
            className="shrink-0 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cerrar buscador"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto" ref={listaRef}>
          {query.trim().length < 2 && (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>
              Escribe al menos 2 letras para buscar
            </p>
          )}
          {query.trim().length >= 2 && !buscando && resultados.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>
              Sin resultados para &quot;{query}&quot;
            </p>
          )}
          {resultados.map((r, i) => {
            const Icon = ICONOS[r.tipo]
            const seleccionado = i === activo
            return (
              <button
                key={`${r.tipo}_${r.id}`}
                onClick={() => irA(r.href)}
                onMouseEnter={() => setActivo(i)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                style={{ backgroundColor: seleccionado ? 'var(--nav-hover-bg)' : 'transparent' }}
              >
                <div className="p-2 rounded-lg text-indigo-400 shrink-0" style={{ backgroundColor: 'var(--bg-badge)' }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.titulo}</p>
                  {r.subtitulo && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{r.subtitulo}</p>}
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0"
                  style={{ backgroundColor: 'var(--bg-badge)', color: 'var(--text-muted)' }}
                >
                  {ETIQUETAS[r.tipo]}
                </span>
                {seleccionado && <CornerDownLeft className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
              </button>
            )
          })}
        </div>

        {resultados.length > 0 && (
          <div
            className="flex items-center gap-4 px-4 py-2 border-t text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <span>↑ ↓ para moverse</span>
            <span>Enter para abrir</span>
            <span>Esc para cerrar</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Provider: estado compartido + atajo Ctrl+K (una sola instancia) ─────────
export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const abrirBuscador = useCallback(() => setOpen(true), [])
  const cerrarBuscador = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <GlobalSearchContext.Provider value={{ abrirBuscador, cerrarBuscador, buscadorAbierto: open }}>
      {children}
      {mounted && open && createPortal(
        <GlobalSearchModal onClose={cerrarBuscador} />,
        document.body
      )}
    </GlobalSearchContext.Provider>
  )
}
