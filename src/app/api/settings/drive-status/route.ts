import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'google_drive_tokens')
      .single()

    if (error || !data || !data.value) {
      return NextResponse.json({ connected: false })
    }

    // Comprobar si value es un objeto con access_token y no un objeto vacío
    const tokenObj = data.value as any;
    if (Object.keys(tokenObj).length === 0) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({ connected: !!tokenObj.access_token || !!tokenObj.refresh_token })
  } catch (err) {
    return NextResponse.json({ connected: false })
  }
}
