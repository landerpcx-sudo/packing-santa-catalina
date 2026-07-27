import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ToastProvider } from '@/components/layout/Toast'
import { ConfirmProvider } from '@/components/layout/ConfirmDialog'
import NavigationEvents from '@/components/layout/NavigationEvents'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Packing Santa Catalina — Control Documental',
  description: 'Sistema de control y trazabilidad documental para Packing Santa Catalina. Gestión de lotes, temperaturas y despachos.',
  keywords: ['packing', 'santa catalina', 'trazabilidad', 'documentos', 'lotes', 'despachos'],
  robots: 'noindex, nofollow',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Packing SC',
  },
}

export const viewport: Viewport = {
  themeColor: '#059669',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Anti-flash: aplica el tema antes de que React hidrate */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sc-theme')||'dark';document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                  navigator.serviceWorker.register('/sw.js').then(function() {
                    console.log('Service Worker registrado con éxito');
                  }).catch(function(err) {
                    console.error('Error al registrar Service Worker:', err);
                  });
                } else {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function() {
                      console.log('Service Worker registrado con éxito en load');
                    }).catch(function(err) {
                      console.error('Error al registrar Service Worker en load:', err);
                    });
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <ConfirmProvider>
                <Suspense fallback={null}>
                  <NavigationEvents />
                </Suspense>
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
