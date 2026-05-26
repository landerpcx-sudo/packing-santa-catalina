import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder } from '@/lib/drive'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const from = (page - 1) * limit

  const { data, error, count } = await supabaseAdmin
    .from('temperature_reports')
    .select('*, responsible:responsible_id(display_name)', { count: 'exact' })
    .order('report_date', { ascending: false })
    .range(from, from + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count, page, limit })
}

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Validar rol de escritura
    if (userRole !== 'admin' && userRole !== 'jefe_frio') {
      return NextResponse.json({ error: 'No tienes permisos para crear reportes de temperatura.' }, { status: 403 })
    }

    const body = await request.json()
    const { report_date, chamber, client, variety, temperature_value, observation, is_ambient = false } = body

    if (!report_date) {
      return NextResponse.json({ error: 'La fecha del reporte es requerida.' }, { status: 400 })
    }

    // Generar código interno: TEMP-2026-05-16-CLIENTE-VARIEDAD o TEMP-2026-05-16-AMBIENTE
    let internal_code = ''
    if (is_ambient) {
      internal_code = `TEMP-${report_date}-AMBIENTE`
    } else {
      const clientSuffix = client ? `-${client.toUpperCase().replace(/\s+/g, '_')}` : ''
      const varietySuffix = variety ? `-${variety.toUpperCase().replace(/\s+/g, '_')}` : ''
      internal_code = `TEMP-${report_date}${clientSuffix}${varietySuffix}`
    }

    // Verificar que no exista reporte para esa fecha Y tipo (ambiente o cliente + variedad específicos)
    const query = supabaseAdmin
      .from('temperature_reports')
      .select('id')
      .eq('report_date', report_date)
      .eq('is_ambient', is_ambient)
    
    if (!is_ambient) {
      if (client) {
        query.eq('client', client)
      } else {
        query.is('client', null)
      }

      if (variety) {
        query.eq('variety', variety)
      } else {
        query.is('variety', null)
      }
    }

    const { data: existing } = await query.single()

    if (existing) {
      if (is_ambient) {
        return NextResponse.json({ error: `Ya existe un reporte de temperatura ambiente para el ${report_date}.` }, { status: 409 })
      } else {
        return NextResponse.json({ 
          error: `Ya existe un reporte de temperatura para el ${report_date}${client ? ` del cliente ${client}` : ''}${variety ? ` (variedad ${variety})` : ''}.` 
        }, { status: 409 })
      }
    }

    // Crear carpeta en Drive dentro de la carpeta raíz de temperaturas
    const rootFolderId = process.env.ROOT_DRIVE_FOLDER_ID!
    let driveFolderId: string | null = null
    let driveFolderUrl: string | null = null

    try {
      const folderName = is_ambient 
        ? `TEMP-${report_date} - AMBIENTE`
        : `TEMP-${report_date}${client ? ` - ${client}` : ''}${variety ? ` - ${variety}` : ''}`
      const driveFolder = await createFolder(folderName, rootFolderId)
      driveFolderId = driveFolder.id!
      driveFolderUrl = driveFolder.url!
    } catch (driveError) {
      console.error('Error al crear carpeta de temperatura en Drive:', driveError)
      // No bloqueamos la creación si Drive falla
    }

    const { data: report, error } = await supabaseAdmin
      .from('temperature_reports')
      .insert({
        internal_code,
        report_date,
        chamber: chamber || null,
        client: is_ambient ? null : (client || null),
        variety: is_ambient ? null : (variety || null),
        temperature_value: temperature_value || null,
        observation: observation || null,
        responsible_id: userId || null,
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
        status: 'pending',
        is_ambient,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: 'CREATE_TEMPERATURE_REPORT',
      entity_type: 'temperature_reports',
      entity_id: report.id,
      details: { internal_code, report_date },
    })

    return NextResponse.json({ data: report }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/temperaturas error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
