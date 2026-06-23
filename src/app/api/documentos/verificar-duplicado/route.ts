import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const hash = searchParams.get('hash')

    if (!hash) {
      return NextResponse.json({ error: 'El hash es requerido.' }, { status: 400 })
    }

    // 1. Buscar en lot_documents
    const { data: lotDoc } = await supabaseAdmin
      .from('lot_documents')
      .select('original_file_name, lot_id, lots(internal_code)')
      .eq('file_hash', hash)
      .maybeSingle()

    if (lotDoc) {
      return NextResponse.json({
        exists: true,
        fileName: lotDoc.original_file_name,
        module: 'Lotes',
        code: (lotDoc.lots as any)?.internal_code || 'Desconocido',
        details: `Lote ${(lotDoc.lots as any)?.internal_code || 'Desconocido'}`
      })
    }

    // 2. Buscar en dispatch_documents
    const { data: dispatchDoc } = await supabaseAdmin
      .from('dispatch_documents')
      .select('original_file_name, dispatch_id, dispatches(internal_code)')
      .eq('file_hash', hash)
      .maybeSingle()

    if (dispatchDoc) {
      return NextResponse.json({
        exists: true,
        fileName: dispatchDoc.original_file_name,
        module: 'Despachos',
        code: (dispatchDoc.dispatches as any)?.internal_code || 'Desconocido',
        details: `Despacho ${(dispatchDoc.dispatches as any)?.internal_code || 'Desconocido'}`
      })
    }

    // 3. Buscar en temperature_documents
    const { data: tempDoc } = await supabaseAdmin
      .from('temperature_documents')
      .select('original_file_name, temperature_report_id, temperature_reports(internal_code)')
      .eq('file_hash', hash)
      .maybeSingle()

    if (tempDoc) {
      return NextResponse.json({
        exists: true,
        fileName: tempDoc.original_file_name,
        module: 'Temperaturas',
        code: (tempDoc.temperature_reports as any)?.internal_code || 'Desconocido',
        details: `Medición de Temp. ${(tempDoc.temperature_reports as any)?.internal_code || 'Desconocido'}`
      })
    }

    // 4. Buscar en client_documents
    const { data: clientDoc } = await supabaseAdmin
      .from('client_documents')
      .select('original_file_name, client_id, clients(name)')
      .eq('file_hash', hash)
      .maybeSingle()

    if (clientDoc) {
      return NextResponse.json({
        exists: true,
        fileName: clientDoc.original_file_name,
        module: 'Clientes',
        code: (clientDoc.clients as any)?.name || 'Desconocido',
        details: `Cliente ${(clientDoc.clients as any)?.name || 'Desconocido'}`
      })
    }

    return NextResponse.json({ exists: false })
  } catch (err: any) {
    console.error('Error en verificar-duplicado API:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
