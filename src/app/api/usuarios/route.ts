import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET: Listar usuarios (Solo Admins)
export async function GET() {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users_app')
      .select('id, username, display_name, role, area, active, can_validate, can_view_all, can_download_all, can_manage_users, can_sync_drive, can_create_lot, can_view_drive, client_name, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: users })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: Crear nuevo usuario
export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const currentUserId = headersList.get('x-user-id')
    const body = await request.json()
    const { username, display_name, role, area, password, can_validate, can_view_all, can_download_all, can_manage_users, can_sync_drive, can_create_lot, can_view_drive, client_name } = body

    if (!username || !password || !display_name || !role) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }

    // Hash de la contraseña
    const password_hash = await bcrypt.hash(password, 12)

    const { data: user, error } = await supabaseAdmin
      .from('users_app')
      .insert({
        username: username.toLowerCase().trim(),
        display_name,
        role,
        area: area || null,
        password_hash,
        can_validate: !!can_validate,
        can_view_all: !!can_view_all,
        can_download_all: !!can_download_all,
        can_manage_users: !!can_manage_users,
        can_sync_drive: !!can_sync_drive,
        can_create_lot: !!can_create_lot,
        can_view_drive: !!can_view_drive,
        client_name: client_name ? client_name.trim().toUpperCase() : null,
        active: true
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'El nombre de usuario ya existe.' }, { status: 409 })
      }
      throw error
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: currentUserId || null,
      action: 'CREATE_USER',
      entity_type: 'users_app',
      entity_id: user.id,
      details: { username: user.username, role: user.role }
    })

    return NextResponse.json({ data: user }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
