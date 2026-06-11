import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { syncAllPendingToDrive } from '@/lib/drive-sync'

// Cron automático: reintenta subir a Drive cualquier documento que haya quedado
// pendiente (drive_file_id = null). Es la red de seguridad final que garantiza
// que ningún archivo se quede sin sincronizar, aun si la subida en segundo plano
// del momento de la carga falló.
//
// Vercel Cron envía el header Authorization: Bearer <CRON_SECRET>.
// Si CRON_SECRET no está configurado, el endpoint queda bloqueado por seguridad.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado.' }, { status: 503 })
  }

  const authHeader = (await headers()).get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const results = await syncAllPendingToDrive()
    const totalSynced =
      results.lot_documents.success +
      results.dispatch_documents.success +
      results.temperature_documents.success

    console.log('[CRON] Sincronización a Drive completada:', JSON.stringify(results))
    return NextResponse.json({ ok: true, synced: totalSynced, results })
  } catch (err: any) {
    console.error('[CRON] Error en sincronización a Drive:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
