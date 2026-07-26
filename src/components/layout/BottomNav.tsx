'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Thermometer, Truck, ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'

const BOTTOM_ITEMS = [
  { href: '/dashboard',   label: 'Inicio',      icon: LayoutDashboard, roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/lotes',       label: 'Lotes',        icon: Package,         roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'gerencia', 'agronomo', 'cliente'] },
  { href: '/temperaturas',label: 'Temp.',        icon: Thermometer,     roles: ['admin', 'jefe_frio', 'gerencia', 'agronomo'] },
  { href: '/despachos',   label: 'Despachos',    icon: Truck,           roles: ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo', 'cliente'] },
  { href: '/pendientes',  label: 'Pendientes',   icon: ClipboardList,   roles: ['admin'] },
]

/**
 * Barra de navegación inferior para móviles (Mejora #19)
 * Solo visible en pantallas menores a lg (1024px).
 * Soporta modo claro/oscuro con texturas de cristal.
 */
export default function BottomNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { isDark } = useTheme()

  const filtered = BOTTOM_ITEMS.filter(
    item => user?.role && item.roles.includes(user.role)
  ).slice(0, 5)

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-1.5 safe-area-inset-bottom bottom-nav-glass`}
      style={{
        backgroundColor: isDark ? 'rgba(11, 22, 40, 0.96)' : undefined,
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        borderTop: isDark ? '1px solid rgba(255,255,255,0.07)' : undefined,
        boxShadow: isDark ? '0 -8px 32px rgba(0,0,0,0.4)' : undefined,
        paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Inner light top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 30%, rgba(16,185,129,0.1) 50%, rgba(255,255,255,0.06) 70%, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(0,0,0,0.02) 30%, rgba(16,185,129,0.06) 50%, rgba(0,0,0,0.02) 70%, transparent)'
        }}
      />

      {filtered.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-200 min-w-[52px] bottom-nav-item relative"
            style={{
              backgroundColor: isActive
                ? (isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(16, 185, 129, 0.1)')
                : 'transparent',
            }}
          >
            <div className="relative">
              <Icon
                className={`w-5 h-5 transition-colors duration-200 ${
                  isActive
                    ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
                    : (isDark ? 'text-slate-500' : 'text-slate-400')
                }`}
              />
              {isActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full indicator-online"
                />
              )}
            </div>
            <span
              className={`text-[10px] font-bold transition-colors duration-200 ${
                isActive
                  ? (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  : (isDark ? 'text-slate-600' : 'text-slate-400')
              }`}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

