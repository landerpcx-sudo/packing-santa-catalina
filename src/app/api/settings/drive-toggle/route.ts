import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export async function POST(req: Request) {
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

    const body = await req.json()
    const { enable } = body

    if (enable) {
      const { error } = await supabaseAdmin
        .from('system_settings')
        .upsert({ 
          key: 'google_drive_sync_enabled', 
          value: { enabled: true },
          updated_at: new Date().toISOString()
        })
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('system_settings')
        .delete()
        .eq('key', 'google_drive_sync_enabled')
      if (error) throw error
    }

    return NextResponse.json({ success: true, enabled: enable })
  } catch (err: any) {
    console.error('Error al cambiar estado de Drive:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
