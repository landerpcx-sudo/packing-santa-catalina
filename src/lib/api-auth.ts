import { verifyToken, JWTPayload } from './auth'

/**
 * Extrae y verifica el token de sesión JWT desde la petición HTTP.
 * Sirve como barrera de seguridad redundante para las API routes.
 */
export async function getAuthenticatedUser(request: Request): Promise<JWTPayload | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=')
        return [k, v.join('=')]
      })
    )

    const token = cookies['session']
    if (!token) return null

    return await verifyToken(token)
  } catch {
    return null
  }
}
