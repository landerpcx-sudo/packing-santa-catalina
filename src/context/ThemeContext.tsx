'use client'

import { createContext, useContext, useEffect, useState, ReactNode, MouseEvent } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: (event?: MouseEvent<any>) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  isDark: true,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  const applyTheme = (t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    if (t === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  useEffect(() => {
    const saved = (localStorage.getItem('sc-theme') as Theme | null) || 'dark'
    setTheme(saved)
    applyTheme(saved)
  }, [])

  const toggleTheme = (e?: MouseEvent<any>) => {
    const next = theme === 'dark' ? 'light' : 'dark'

    // Si no está soportado o no es una interacción con coordenadas (ej. teclado), cambia directo
    if (typeof document === 'undefined' || !document.startViewTransition || !e || !e.clientX) {
      setTheme(next)
      localStorage.setItem('sc-theme', next)
      applyTheme(next)
      return
    }

    const x = e.clientX
    const y = e.clientY
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      setTheme(next)
      localStorage.setItem('sc-theme', next)
      applyTheme(next)
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      document.documentElement.animate(
        {
          clipPath: theme === 'dark' ? clipPath : [...clipPath].reverse(),
        },
        {
          duration: 400,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: theme === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)',
        }
      )
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
