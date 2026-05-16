import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase-admin'

// PATCH: Actualizar usuario (Activar/Desactivar, Cambiar Rol, Cambiar Password)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const currentUserId = headersList.get('x-user-id')
    const body = await request.json()
    const { display_name, role, area, active, can_validate, can_view_all, can_download_all, can_manage_users, can_sync_drive, can_create_lot, can_view_drive, password } = body

    const updateData: any = {}
    if (display_name !== undefined) updateData.display_name = display_name
    if (role !== undefined) updateData.role = role
    if (area !== undefined) updateData.area = area
    if (active !== undefined) updateData.active = active
    if (can_validate !== undefined) updateData.can_validate = can_validate
    if (can_view_all !== undefined) updateData.can_view_all = can_view_all
    if (can_download_all !== undefined) updateData.can_download_all = can_download_all
    if (can_manage_users !== undefined) updateData.can_manage_users = can_manage_users
    if (can_sync_drive !== undefined) updateData.can_sync_drive = can_sync_drive
    if (can_create_lot !== undefined) updateData.can_create_lot = can_create_lot
    if (can_view_drive !== undefined) updateData.can_view_drive = can_view_drive
    
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 12)
    }

    const { data: user, error } = await supabaseAdmin
      .from('users_app')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: currentUserId || null,
      action: 'UPDATE_USER',
      entity_type: 'users_app',
      entity_id: id,
      details: { ...updateData, password_hash: password ? 'CHANGED' : undefined }
    })

    return NextResponse.json({ data: user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: Eliminar usuario (Uso precavido, preferible desactivar)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const currentUserId = headersList.get('x-user-id')

    const { error } = await supabaseAdmin
      .from('users_app')
      .delete()
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('audit_log').insert({
      user_id: currentUserId || null,
      action: 'DELETE_USER',
      entity_type: 'users_app',
      entity_id: id
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
