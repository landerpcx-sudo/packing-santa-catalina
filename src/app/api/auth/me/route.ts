import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const payload = await verifyToken(token)

  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  // Consultar en la base de datos para obtener los permisos más actualizados en tiempo real
  const { data: user, error } = await supabaseAdmin
    .from('users_app')
    .select('id, username, display_name, role, area, active, can_validate, can_view_all, can_download_all, can_manage_users, can_sync_drive, can_create_lot, can_view_drive, client_name')
    .eq('id', payload.userId)
    .single()

  if (error || !user || !user.active) {
    // Si el usuario no existe o ha sido desactivado, expiramos la cookie de sesión
    const response = NextResponse.json({ user: null }, { status: 401 })
    response.cookies.delete('session')
    return response
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      area: user.area,
      canValidate: user.can_validate,
      canViewAll: user.can_view_all,
      canDownloadAll: user.can_download_all,
      canManageUsers: user.can_manage_users,
      canSyncDrive: user.can_sync_drive,
      canCreateLot: user.can_create_lot,
      canViewDrive: user.role === 'admin',
      client_name: user.client_name || null,
      clientName: user.client_name || null,
    },
  })
}
