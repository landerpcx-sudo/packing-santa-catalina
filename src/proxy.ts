import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

// Rutas que NO requieren sesión de usuario.
// OJO con /api/cron: lo invoca Vercel Cron, que NO envía cookie de sesión. Si el
// proxy lo redirige a /login, la sincronización horaria a Google Drive —la red de
// seguridad que garantiza que todo archivo termine en Drive— nunca se ejecuta.
// La ruta se protege sola validando el header Authorization contra CRON_SECRET.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/google', '/api/cron/', '/sw.js', '/manifest.json']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rutas públicas
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Permitir archivos estáticos
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('session')?.value

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  const payload = await verifyToken(token)

  if (!payload) {
    const loginUrl = new URL('/login', request.url)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('session')
    return response
  }

  // Pasar datos de usuario al header para uso en API routes
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', payload.userId)
  requestHeaders.set('x-user-role', payload.role)
  requestHeaders.set('x-user-name', payload.username)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    /*
     * Excluir:
     * - _next/static (archivos estáticos de Next.js)
     * - _next/image (optimizador de imágenes)
     * - favicon.ico
     * - Archivos de public/ con extensiones de imagen, fuente, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)',
  ],
}
