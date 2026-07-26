import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { signToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Usuario y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Buscar usuario en Supabase
    const { data: user, error } = await supabaseAdmin
      .from('users_app')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .eq('active', true)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      )
    }

    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.password_hash)

    if (!passwordValid) {
      // Registrar intento fallido en auditoría
      await supabaseAdmin.from('audit_log').insert({
        user_id: user.id,
        action: 'login_failed',
        entity_type: 'user',
        entity_id: user.id,
        details: { username, reason: 'wrong_password' },
      })

      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      )
    }

    // Crear token JWT
    const token = await signToken({
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      area: user.area,
      canValidate: !!user.can_validate,
      canViewAll: !!user.can_view_all,
      canDownloadAll: !!user.can_download_all,
      canManageUsers: !!user.can_manage_users,
      canSyncDrive: !!user.can_sync_drive,
      canCreateLot: !!user.can_create_lot,
      canViewDrive: user.role === 'admin',
      clientName: user.client_name || null,
    })

    // Registrar login exitoso
    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id,
      action: 'login',
      entity_type: 'user',
      entity_id: user.id,
      details: { username },
    })

    // Crear respuesta con cookie httpOnly
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        area: user.area,
        canValidate: !!user.can_validate,
        canViewAll: !!user.can_view_all,
        canDownloadAll: !!user.can_download_all,
        canManageUsers: !!user.can_manage_users,
        canSyncDrive: !!user.can_sync_drive,
        canCreateLot: !!user.can_create_lot,
        canViewDrive: user.role === 'admin',
        client_name: user.client_name || null,
      },
    })

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60, // 8 horas
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
