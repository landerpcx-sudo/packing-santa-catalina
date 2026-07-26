import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { TABLAS_DOCUMENTOS, ETIQUETA_TABLA, DIAS_EN_PAPELERA, diasRestantes } from '@/lib/papelera'

export const maxDuration = 60

// GET /api/documentos/papelera
// Lista todos los documentos en la papelera, de los cuatro módulos, con los días
// que les quedan antes de poder purgarse. El archivo de cada uno sigue guardado.
export async function GET() {
  try {
    const headersList = await headers()
    if (headersList.get('x-user-role') !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const items: any[] = []

    for (const table of TABLAS_DOCUMENTOS) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('id, original_file_name, document_type, storage_path, drive_file_id, drive_file_url, deleted_at, deleted_by, created_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(500)

      // client_documents puede no existir en instalaciones antiguas: se ignora.
      if (error) continue

      for (const d of data || []) {
        items.push({
          ...d,
          table,
          modulo: ETIQUETA_TABLA[table] || table,
          dias_restantes: diasRestantes(d.deleted_at),
          conserva_archivo: Boolean(d.storage_path) || Boolean(d.drive_file_id),
        })
      }
    }

    items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())

    // Nombres de quienes eliminaron, para mostrarlos en la lista.
    const userIds = [...new Set(items.map(i => i.deleted_by).filter(Boolean))]
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users_app')
        .select('id, display_name')
        .in('id', userIds)

      const nombres = new Map((users || []).map(u => [u.id, u.display_name]))
      for (const item of items) {
        item.deleted_by_name = nombres.get(item.deleted_by) || null
      }
    }

    return NextResponse.json({
      data: {
        items,
        total: items.length,
        dias_retencion: DIAS_EN_PAPELERA,
      },
    })
  } catch (err: any) {
    console.error('GET /api/documentos/papelera error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
