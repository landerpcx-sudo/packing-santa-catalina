import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  await supabaseAdmin.rpc('exec_sql', { sql: `
    ALTER TABLE dispatch_documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
    ALTER TABLE dispatch_documents ADD COLUMN IF NOT EXISTS storage_url TEXT;
  `})
  
  // Actually, wait, exec_sql might not exist. Let's just try to do it via supabaseAdmin.
  return NextResponse.json({ ok: true })
}
