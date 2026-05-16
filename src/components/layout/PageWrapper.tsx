'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

export default function PageWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    // key={pathname} hace que React destruya y recree el div en cada navegación,
    // disparando la animación CSS de entrada en cada cambio de ruta.
    <div key={pathname} className="page-transition">
      {children}
    </div>
  )
}
