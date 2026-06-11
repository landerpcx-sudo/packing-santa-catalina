import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { invalidateDriveClientCache } from '@/lib/drive'

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const payload = await verifyToken(sessionToken)
    
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('system_settings')
      .delete()
      .eq('key', 'google_drive_tokens')

    if (error) throw error

    invalidateDriveClientCache()

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error al desconectar Drive:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
