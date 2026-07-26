import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncDocsToDrive, type SyncTable } from '@/lib/drive-sync'

// GET /api/settings/drive-sync-pending - Listar archivos no sincronizados
export async function GET() {
  try {
    const { data: lotDocs, error: err1 } = await supabaseAdmin
      .from('lot_documents')
      .select('id, original_file_name, lot_id, document_type, created_at')
      .is('drive_file_id', null)
      .is('deleted_at', null)

    const { data: dispatchDocs, error: err2 } = await supabaseAdmin
      .from('dispatch_documents')
      .select('id, original_file_name, dispatch_id, document_type, created_at')
      .is('drive_file_id', null)
      .is('deleted_at', null)

    const { data: tempDocs, error: err3 } = await supabaseAdmin
      .from('temperature_documents')
      .select('id, original_file_name, temperature_report_id, document_type, created_at')
      .is('drive_file_id', null)
      .is('deleted_at', null)

    if (err1 || err2 || err3) throw new Error('Error al consultar documentos pendientes.')

    return NextResponse.json({
      data: {
        lots: lotDocs,
        dispatches: dispatchDocs,
        temperatures: tempDocs,
        total: (lotDocs?.length || 0) + (dispatchDocs?.length || 0) + (tempDocs?.length || 0)
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/settings/drive-sync-pending - Sincronizar todos o uno específico.
// Toda la lógica vive en el módulo compartido @/lib/drive-sync (mismo camino
// que usan la subida en segundo plano y el cron automático).
export async function POST(request: Request) {
  try {
    const { docId, table } = await request.json()

    const valid: SyncTable[] = ['lot_documents', 'dispatch_documents', 'temperature_documents']
    if (!valid.includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    const results = await syncDocsToDrive({ table, docId })
    return NextResponse.json({ data: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
