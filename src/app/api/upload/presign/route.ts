import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveMimeType } from '@/lib/mime-helper'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')

    const body = await request.json()
    const { entity, entityId, documentType, fileName, folios } = body

    if (!entity || !entityId || !documentType || !fileName) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos para preparar la subida.' }, { status: 400 })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = fileName.split('.').pop() || 'pdf'
    let sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    let storagePath = ''
    let versionNumber = 1

    if (entity === 'despachos') {
      const { data: dispatch, error: dispatchErr } = await supabaseAdmin
        .from('dispatches')
        .select('id, internal_code, dispatch_code')
        .eq('id', entityId)
        .single()

      if (dispatchErr || !dispatch) {
        return NextResponse.json({ error: 'Despacho no encontrado.' }, { status: 404 })
      }

      // Renombrado inteligente para despachos
      if (documentType === 'pack_list') {
        sanitizedName = `Packlist ${dispatch.dispatch_code}.${ext}`
      } else if (documentType === 'thermograph_photo') {
        sanitizedName = `Foto_Termografo_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'pata_pata_photo' && folios) {
        sanitizedName = `Pallet_${folios.replace(/[^a-zA-Z0-9- ]/g, '_')}.${ext}`
      } else if (documentType === 'guia_despacho') {
        sanitizedName = `Guia_Despacho_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'proforma') {
        sanitizedName = `Proforma_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'factura') {
        sanitizedName = `Factura_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'abonos_adelantos') {
        sanitizedName = `Abono_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'pagos_liquidaciones') {
        sanitizedName = `Pago_Liquidacion_${dispatch.dispatch_code}_${timestamp}.${ext}`
      } else if (documentType === 'calidad_destino') {
        sanitizedName = `Calidad_Destino_${dispatch.dispatch_code}_${timestamp}.${ext}`
      }

      // Colisión y correlativo
      const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
      const { data: existingDocs } = await supabaseAdmin
        .from('dispatch_documents')
        .select('original_file_name')
        .eq('dispatch_id', entityId)
        .eq('document_type', documentType)
        .like('original_file_name', `${nameWithoutExt}%`)

      if (existingDocs && existingDocs.length > 0) {
        const exactMatch = existingDocs.some(d => d.original_file_name === sanitizedName)
        if (exactMatch) {
          let maxCorrelative = 0
          const regex = new RegExp(`^${nameWithoutExt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}-(\\d+)\\.${ext}$`)
          for (const doc of existingDocs) {
            const match = doc.original_file_name.match(regex)
            if (match) {
              const num = parseInt(match[1])
              if (num > maxCorrelative) maxCorrelative = num
            }
          }
          sanitizedName = `${nameWithoutExt}-${maxCorrelative + 1}.${ext}`
        }
      }

      // Versión
      const { data: lastVer } = await supabaseAdmin
        .from('dispatch_documents')
        .select('version_number')
        .eq('dispatch_id', entityId)
        .eq('document_type', documentType)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      versionNumber = (lastVer?.version_number || 0) + 1
      storagePath = `despachos/${dispatch.internal_code}/${documentType}/v${versionNumber}_${timestamp}_${sanitizedName}`

    } else if (entity === 'lotes') {
      const { data: lot, error: lotErr } = await supabaseAdmin
        .from('lots')
        .select('id, internal_code')
        .eq('id', entityId)
        .single()

      if (lotErr || !lot) {
        return NextResponse.json({ error: 'Lote no encontrado.' }, { status: 404 })
      }

      if (documentType === 'reception') sanitizedName = `Informe Recepcion ${lot.internal_code}.${ext}`
      else if (documentType === 'quality') sanitizedName = `Informe Calidad ${lot.internal_code}.${ext}`

      const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
      const { data: existingDocs } = await supabaseAdmin
        .from('lot_documents')
        .select('original_file_name')
        .eq('lot_id', entityId)
        .eq('document_type', documentType)
        .like('original_file_name', `${nameWithoutExt}%`)
        .is('deleted_at', null)

      if (existingDocs && existingDocs.length > 0) {
        const exactMatch = existingDocs.some(d => d.original_file_name === sanitizedName)
        if (exactMatch) {
          let maxCorrelative = 0
          const regex = new RegExp(`^${nameWithoutExt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}-(\\d+)\\.${ext}$`)
          for (const doc of existingDocs) {
            const match = doc.original_file_name.match(regex)
            if (match) {
              const num = parseInt(match[1])
              if (num > maxCorrelative) maxCorrelative = num
            }
          }
          sanitizedName = `${nameWithoutExt}-${maxCorrelative + 1}.${ext}`
        }
      }

      let versionQuery = supabaseAdmin
        .from('lot_documents')
        .select('version_number')
        .eq('lot_id', entityId)
        .eq('document_type', documentType)
        .is('deleted_at', null)

      if (documentType === 'process') {
        versionQuery = versionQuery.eq('original_file_name', sanitizedName)
      }

      const { data: lastVer } = await versionQuery
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      versionNumber = (lastVer?.version_number || 0) + 1
      storagePath = `lotes/${lot.internal_code}/${documentType}/v${versionNumber}_${timestamp}_${sanitizedName}`

    } else if (entity === 'temperaturas') {
      if (userRole === 'gerencia' || userRole === 'agronomo') {
        return NextResponse.json({ error: 'No tienes permisos para subir archivos a este reporte.' }, { status: 403 })
      }

      const { data: report, error: reportErr } = await supabaseAdmin
        .from('temperature_reports')
        .select('id, internal_code')
        .eq('id', entityId)
        .single()

      if (reportErr || !report) {
        return NextResponse.json({ error: 'Reporte de temperatura no encontrado.' }, { status: 404 })
      }

      const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
      const { data: existingDocs } = await supabaseAdmin
        .from('temperature_documents')
        .select('original_file_name')
        .eq('temperature_report_id', entityId)
        .eq('document_type', documentType)
        .like('original_file_name', `${nameWithoutExt}%`)

      if (existingDocs && existingDocs.length > 0) {
        const exactMatch = existingDocs.some(d => d.original_file_name === sanitizedName)
        if (exactMatch) {
          let maxCorrelative = 0
          const regex = new RegExp(`^${nameWithoutExt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}-(\\d+)\\.${ext}$`)
          for (const doc of existingDocs) {
            const match = doc.original_file_name.match(regex)
            if (match) {
              const num = parseInt(match[1])
              if (num > maxCorrelative) maxCorrelative = num
            }
          }
          sanitizedName = `${nameWithoutExt}-${maxCorrelative + 1}.${ext}`
        }
      }

      const rawPath = `temperaturas/${report.internal_code}/${documentType}/${timestamp}_${sanitizedName}`
      storagePath = rawPath.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\/_#-]/g, '_')
    } else {
      return NextResponse.json({ error: 'Entidad no soportada.' }, { status: 400 })
    }

    // Generar Signed Upload URL directo hacia Supabase Storage (omite límites de Vercel)
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from('documentos')
      .createSignedUploadUrl(storagePath)

    if (signedErr || !signedData) {
      console.error('Error al crear signed upload url:', signedErr)
      return NextResponse.json({ error: `Error al preparar almacenamiento: ${signedErr?.message || 'Error desconocido'}` }, { status: 500 })
    }

    const mimeType = resolveMimeType(sanitizedName, body.fileType)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
      storagePath,
      sanitizedName,
      versionNumber,
      mimeType
    })

  } catch (err: any) {
    console.error('POST /api/upload/presign error:', err)
    return NextResponse.json({ error: err.message || 'Error interno al preparar subida' }, { status: 500 })
  }
}
