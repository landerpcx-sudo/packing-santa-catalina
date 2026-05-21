import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // 0. Obtener configuración de inicio de control
    const { data: config } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'temperature_control_start_date')
      .single()
    
    // 1. Obtener Lotes pendientes (con documentos subidos pero no validados)
    const { data: lots, error: lotsError } = await supabaseAdmin
      .from('lots')
      .select(`
        id,
        internal_code,
        display_name,
        client,
        reception_status,
        quality_status,
        process_status,
        created_at,
        lot_documents(id, document_type, status, validation_status, original_file_name, storage_url, drive_file_url)
      `)
      .or('reception_status.eq.uploaded,quality_status.eq.uploaded,process_status.eq.uploaded,reception_status.eq.observed,quality_status.eq.observed,process_status.eq.observed')
      .order('created_at', { ascending: false })

    if (lotsError) throw lotsError

    // 2. Obtener Despachos pendientes
    const { data: dispatches, error: despError } = await supabaseAdmin
      .from('dispatches')
      .select(`
        id,
        internal_code,
        client,
        pack_list_status,
        photos_status,
        overall_status,
        created_at,
        dispatch_documents(id, document_type, status, validation_status, original_file_name, storage_url, drive_file_url)
      `)
      .or('overall_status.eq.pending,overall_status.eq.uploaded,overall_status.eq.observed,overall_status.eq.late')
      .neq('overall_status', 'complete')
      .order('created_at', { ascending: false })

    if (despError) throw despError

    // 3. Chequeo de cumplimiento de temperaturas (últimos 7 días)
    const today = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(today.getDate() - 7)
    
    // Obtener reportes recientes en formato de fecha pura
    const { data: recentTemps } = await supabaseAdmin
      .from('temperature_reports')
      .select('report_date')
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])

    const missingDays = []
    const controlStartDateStr = config?.value || '2000-01-01'

    for (let i = 1; i <= 7; i++) {
       const d = new Date()
       d.setDate(today.getDate() - i)
       const dateStr = d.toISOString().split('T')[0]
       
       // Regla 1: No contar antes del inicio configurado (usando strings para evitar líos de timezone)
       if (dateStr < controlStartDateStr) continue
       
       // Regla 2: Omitir Sábados (6) y Domingos (0)
       const dayOfWeek = d.getDay()
       if (dayOfWeek === 0 || dayOfWeek === 6) continue

       if (!recentTemps?.some(t => t.report_date === dateStr)) {
         missingDays.push(dateStr)
       }
    }

    return NextResponse.json({
      data: {
        lots: lots || [],
        dispatches: dispatches || [],
        missing_temperatures: missingDays,
        total: (lots?.length || 0) + (dispatches?.length || 0) + (missingDays.length > 0 ? 1 : 0)
      }
    })
  } catch (err: any) {
    console.error('API Pendientes Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
