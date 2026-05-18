'use client'

import { useState } from 'react'
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
  { href: '/temperaturas', label: 'Temperaturas', icon: Thermometer, roles: ['admin', 'jefe_frio', 'gerencia', 'agronomo'] },
  { href: '/despachos', label: 'Despachos', icon: Truck, roles: ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/pendientes', label: 'Pendientes', icon: ClipboardList, roles: ['admin'] },
  { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
  { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
  { href: '/auditoria', label: 'Auditoría', icon: ScrollText, roles: ['admin'] },
]

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()

  const filteredNav = NAV_ITEMS.filter(item =>
    user?.role && item.roles.includes(user.role)
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="p-6" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
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

      {/* User info */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--nav-active-bg)', border: '1px solid var(--nav-active-border)' }}
          >
            <span className="font-semibold text-sm" style={{ color: 'var(--nav-active-text)' }}>
              {user?.displayName?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.displayName}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {user?.role ? ROLE_DISPLAY_NAMES[user.role as Role] : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {filteredNav.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group"
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
              <Icon size={18} style={{ color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)' }} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={14} style={{ color: 'var(--nav-active-text)' }} />}
            </Link>
          )
        })}
      </nav>

      {/* Footer: Theme toggle + Logout */}
      <div className="px-3 py-4 space-y-1" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        {/* Toggle modo claro/oscuro */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
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
            ? <Sun size={18} className="text-amber-400" />
            : <Moon size={18} className="text-indigo-500" />
          }
          <span>{isDark ? 'Modo Día' : 'Modo Noche'}</span>
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
            style={{
              backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)',
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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.08)'
            ;(e.currentTarget as HTMLElement).style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
          }}
        >
          <LogOut size={18} />
          Cerrar sesión
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
