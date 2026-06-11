import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Estadísticas agregadas del dashboard.
// Reemplaza la descarga de cientos de filas en el cliente por conteos
// hechos en SQL: la respuesta pesa ~1 KB en lugar de cientos de KB.

const count = (table: string) =>
  supabaseAdmin.from(table).select('id', { count: 'exact', head: true })

export async function GET() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

    const [
      lotsTotal,
      lotsComplete,
      lotsIncomplete,
      lotsObserved,
      lotsRecPending,
      lotsQualPending,
      lotsProcPending,
      dispTotal,
      dispComplete,
      dispPending,
      dispLate,
      tempsTotal,
      tempsPending,
      tempsLate,
      recentTemps,
    ] = await Promise.all([
      count('lots'),
      count('lots').in('overall_status', ['complete', 'validated', 'closed']),
      count('lots').or('overall_status.is.null,overall_status.in.(pending,uploaded,late)'),
      count('lots').eq('overall_status', 'observed'),
      count('lots').eq('reception_status', 'pending'),
      count('lots').eq('quality_status', 'pending'),
      count('lots').eq('process_status', 'pending'),
      count('dispatches'),
      count('dispatches').in('overall_status', ['complete', 'closed']),
      count('dispatches').in('overall_status', ['pending', 'uploaded', 'observed', 'late']),
      count('dispatches').eq('overall_status', 'late'),
      count('temperature_reports'),
      count('temperature_reports').eq('status', 'pending'),
      count('temperature_reports').in('status', ['late', 'observed']),
      supabaseAdmin
        .from('temperature_reports')
        .select('id, report_date, status, temperature_value, chamber, client')
        .order('report_date', { ascending: false })
        .limit(60),
    ])

    const firstError = [
      lotsTotal, lotsComplete, lotsIncomplete, lotsObserved, lotsRecPending,
      lotsQualPending, lotsProcPending, dispTotal, dispComplete, dispPending,
      dispLate, tempsTotal, tempsPending, tempsLate, recentTemps,
    ].find(r => r.error)
    if (firstError?.error) throw firstError.error

    const temps = recentTemps.data ?? []
    const todayReport = temps.find(r => r.report_date === today) ?? null

    // Últimas 7 mediciones con valor, en orden cronológico, para el minigráfico
    const miniChart = temps
      .filter(r => r.temperature_value !== null && r.temperature_value !== undefined)
      .sort((a, b) => a.report_date.localeCompare(b.report_date))
      .slice(-7)

    return NextResponse.json({
      data: {
        lotes: {
          total: lotsTotal.count ?? 0,
          completos: lotsComplete.count ?? 0,
          incompletos: lotsIncomplete.count ?? 0,
          observados: lotsObserved.count ?? 0,
          recPending: lotsRecPending.count ?? 0,
          qualPending: lotsQualPending.count ?? 0,
          procPending: lotsProcPending.count ?? 0,
        },
        despachos: {
          total: dispTotal.count ?? 0,
          completos: dispComplete.count ?? 0,
          pendientes: dispPending.count ?? 0,
          atrasados: dispLate.count ?? 0,
        },
        temperaturas: {
          total: tempsTotal.count ?? 0,
          pendientes: tempsPending.count ?? 0,
          atrasados: tempsLate.count ?? 0,
          today,
          todayReport: todayReport
            ? { temperature_value: todayReport.temperature_value, status: todayReport.status }
            : null,
        },
        miniChart,
      },
    })
  } catch (err: any) {
    console.error('GET /api/dashboard/stats error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
