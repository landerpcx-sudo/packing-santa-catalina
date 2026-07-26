import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { cleanupStorage } from '@/lib/storage-cleanup'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 60

// Libera espacio en Supabase quitando copias que YA están confirmadas en Google Drive.
//
// Por defecto SIMULA: informa qué haría sin tocar nada. Para ejecutar el borrado
// real hay que enviar explícitamente { confirm: "LIBERAR ESPACIO" }.
//
// Se retiró el antiguo GET con contraseña escrita en el código fuente: disparaba
// esta misma operación desde el navegador sin más protección que una cadena fija.
export async function POST(req: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const ejecutarDeVerdad = body?.confirm === 'LIBERAR ESPACIO'
    const result = await cleanupStorage({ dryRun: !ejecutarDeVerdad })

    if (ejecutarDeVerdad && result.success) {
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId || null,
        action: 'CLEANUP_STORAGE',
        entity_type: 'storage',
        entity_id: null,
        details: {
          copias_liberadas: result.purgedCount,
          mb_liberados: result.freedMB,
          omitidos: result.skipped?.length || 0,
        },
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
