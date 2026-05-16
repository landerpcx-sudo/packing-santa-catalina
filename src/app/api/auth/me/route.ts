import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const payload = await verifyToken(token)

  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: payload.userId,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      area: payload.area,
      canValidate: payload.canValidate,
      canViewAll: payload.canViewAll,
      canDownloadAll: payload.canDownloadAll,
      canManageUsers: payload.canManageUsers,
      canSyncDrive: payload.canSyncDrive,
      canCreateLot: payload.canCreateLot,
      canViewDrive: payload.canViewDrive,
    },
  })
}
