'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Scroll-to-top automático al cambiar de ruta (Mejora #20)
 * Se monta una sola vez en el layout raíz.
 */
export default function NavigationEvents() {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
