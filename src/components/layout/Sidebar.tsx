'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { ROLE_DISPLAY_NAMES, Role } from '@/lib/constants'
import {
  LayoutDashboard,
  Package,
  Thermometer,
  Truck,
  ClipboardList,
  Users,
  Briefcase,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/lotes', label: 'Lotes / Recepción', icon: Package, roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'gerencia', 'agronomo'] },
  { href: '/clientes', label: 'Clientes', icon: Briefcase, roles: ['admin', 'gerencia', 'agronomo'] },
  { href: '/temperaturas', label: 'Temperaturas', icon: Thermometer, roles: ['admin', 'jefe_frio', 'gerencia', 'agronomo'] },
  { href: '/despachos', label: 'Despachos', icon: Truck, roles: ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/pendientes', label: 'Pendientes', icon: ClipboardList, roles: ['admin'] },
  { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
  { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
  { href: '/auditoria', label: 'Auditoría', icon: ScrollText, roles: ['admin'] },
]

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  const filteredNav = NAV_ITEMS.filter(item =>
    user?.role && item.roles.includes(user.role)
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full relative scanline-effect" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center justify-center mb-2">
          <img
            src={isDark ? '/logo.png' : '/logo-color.png'}
            alt="Packing Santa Catalina"
            className={`h-12 w-auto transition-all duration-300 ${isDark ? 'brightness-0 invert' : ''}`}
          />
        </div>
        <p className="text-xs text-center font-medium" style={{ color: 'var(--text-muted)' }}>
          Control Documental
        </p>
      </div>
      <div className="sidebar-divider" />

      {/* User info */}
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/10"
              style={{
                background: 'linear-gradient(135deg, var(--nav-active-text) 0%, #0284c7 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <span className="font-bold text-sm text-white drop-shadow-sm">
                {user?.displayName?.charAt(0).toUpperCase()}
              </span>
            </div>
            <span
              className={`absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full border-2 border-[#090e1a] ${
                isOnline ? 'indicator-online' : 'indicator-offline'
              }`}
              title={isOnline ? 'Conexión activa' : 'Sin conexión'}
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.displayName}
            </p>
            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
              {user?.role ? ROLE_DISPLAY_NAMES[user.role as Role] : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="sidebar-divider" />

      {/* Navegación */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {filteredNav.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive ? 'nav-active-glow' : ''
              }`}
              style={{
                backgroundColor: isActive ? 'var(--nav-active-bg)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--nav-idle-text)',
                border: isActive ? '1px solid var(--nav-active-border)' : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nav-hover-bg)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--nav-hover-text)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--nav-idle-text)'
                }
              }}
            >
              <Icon size={17} style={{ color: isActive ? 'var(--nav-active-text)' : 'var(--text-secondary)' }} className="transition-transform duration-200 group-hover:scale-105" />
              <span className="flex-1 tracking-tight">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer: Theme toggle + Logout */}
      <div className="sidebar-divider" />
      <div className="px-3 py-3 space-y-1">
        {/* Toggle modo claro/oscuro */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nav-hover-bg)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--nav-hover-text)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
          }}
        >
          {isDark
            ? <Sun size={17} className="text-amber-400 animate-spin-slow" />
            : <Moon size={17} className="text-indigo-500" />
          }
          <span className="tracking-tight">{isDark ? 'Modo Día' : 'Modo Noche'}</span>
          <span
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider"
            style={{
              backgroundColor: isDark ? 'rgba(251,191,36,0.12)' : 'rgba(99,102,241,0.12)',
              color: isDark ? '#fbbf24' : '#6366f1',
            }}
          >
            {isDark ? 'Claro' : 'Oscuro'}
          </span>
        </button>

        {/* Logout */}
        <button
          id="btn-logout"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.06)'
            ;(e.currentTarget as HTMLElement).style.color = '#f87171'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
          }}
        >
          <LogOut size={17} className="text-red-500/70" />
          <span className="tracking-tight">Cerrar sesión</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className="hidden lg:flex flex-col w-64 h-screen sticky top-0 transition-colors duration-300"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* Botón hamburger móvil */}
      <button
        id="btn-mobile-menu"
        className="lg:hidden fixed top-4 left-4 z-[70] p-2 rounded-xl border text-sm font-medium transition-all"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menú"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay móvil */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar móvil */}
      <aside
        className={`lg:hidden fixed left-0 top-0 z-[60] h-full w-72 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        <SidebarContent />
      </aside>
    </>
  )
}
