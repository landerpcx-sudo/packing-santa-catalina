'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Thermometer, Truck, ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const BOTTOM_ITEMS = [
  { href: '/dashboard',   label: 'Inicio',      icon: LayoutDashboard, roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/lotes',       label: 'Lotes',        icon: Package,         roles: ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'gerencia', 'agronomo'] },
  { href: '/temperaturas',label: 'Temp.',        icon: Thermometer,     roles: ['admin', 'jefe_frio', 'gerencia', 'agronomo'] },
  { href: '/despachos',   label: 'Despachos',    icon: Truck,           roles: ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo'] },
  { href: '/pendientes',  label: 'Pendientes',   icon: ClipboardList,   roles: ['admin'] },
]

/**
 * Barra de navegación inferior para móviles (Mejora #19)
 * Solo visible en pantallas menores a lg (1024px).
 */
export default function BottomNav() {
  const pathname = usePathname()
  const { user } = useAuth()

  const filtered = BOTTOM_ITEMS.filter(
    item => user?.role && item.roles.includes(user.role)
  ).slice(0, 5)

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-1.5 safe-area-inset-bottom"
      style={{
        backgroundColor: 'rgba(11, 22, 40, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
        paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {filtered.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-200 min-w-[52px]"
            style={{
              backgroundColor: isActive ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
            }}
          >
            <div className="relative">
              <Icon
                className={`w-5 h-5 transition-colors duration-200 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}
              />
              {isActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full"
                />
              )}
            </div>
            <span
              className={`text-[10px] font-bold transition-colors duration-200 ${
                isActive ? 'text-emerald-400' : 'text-slate-600'
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
