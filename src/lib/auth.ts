import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_secret_cambia_esto_en_produccion'
)

export interface JWTPayload {
  userId: string
  username: string
  displayName: string
  role: string
  area: string | null
  canValidate: boolean
  canViewAll: boolean
  canDownloadAll: boolean
  canManageUsers: boolean
  canSyncDrive: boolean
  canCreateLot: boolean
  canViewDrive: boolean
  clientName?: string | null
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}
