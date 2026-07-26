import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncDocsToDrive } from '@/lib/drive-sync'
import { resolveMimeType } from '@/lib/mime-helper'
import { recalcularDespacho } from '@/lib/papelera'

// Margen para que la sincronización a Drive en segundo plano (after()) complete.
export const maxDuration = 60

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    const { data: dispatchRecord, error: dispatchError } = await supabaseAdmin
      .from('dispatches')
      .select('id, internal_code, dispatch_code, drive_folder_id, expected_pallets, pack_list_status, pata_pata_photos_count, thermograph_photos_count')
      .eq('id', id)
      .single()

    if (dispatchError || !dispatchRecord) {
      return NextResponse.json({ error: 'Despacho no encontrado.' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const document_type = formData.get('document_type') as string
    const folios = formData.get('folios') as string // "4402 - 4403" for pallets
    const file_hash = formData.get('file_hash') as string || null

    if (!file || !document_type) {
      return NextResponse.json({ error: 'Archivo y tipo de documento son requeridos.' }, { status: 400 })
    }

    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo supera el límite de 50MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    let sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    
    // 1. Renombrado inteligente
    if (document_type === 'pack_list') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Packlist ${dispatchRecord.dispatch_code}.${ext}`
    } else if (document_type === 'thermograph_photo') {
      const ext = file.name.split('.').pop() || 'jpg'
      sanitizedName = `Foto_Termografo_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'pata_pata_photo' && folios) {
      const ext = file.name.split('.').pop() || 'jpg'
      sanitizedName = `Pallet_${folios.replace(/[^a-zA-Z0-9- ]/g, '_')}.${ext}`
    } else if (document_type === 'guia_despacho') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Guia_Despacho_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'proforma') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Proforma_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'factura') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Factura_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'abonos_adelantos') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Abono_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'pagos_liquidaciones') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Pago_Liquidacion_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    } else if (document_type === 'calidad_destino') {
      const ext = file.name.split('.').pop() || 'pdf'
      sanitizedName = `Calidad_Destino_${dispatchRecord.dispatch_code}_${timestamp}.${ext}`
    }

    // Verificar colisión de nombres para aplicar correlativo en dispatch_documents
    const ext = file.name.split('.').pop() || 'pdf'
    const nameWithoutExt = sanitizedName.substring(0, sanitizedName.lastIndexOf('.')) || sanitizedName
    
    const { data: existingDocs } = await supabaseAdmin
      .from('dispatch_documents')
      .select('original_file_name')
      .eq('dispatch_id', id)
      .eq('document_type', document_type)
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

    // 2. Cálculo de Versión
    const { data: lastVersion } = await supabaseAdmin
      .from('dispatch_documents')
      .select('version_number')
      .eq('dispatch_id', id)
      .eq('document_type', document_type)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    
    const version_number = (lastVersion?.version_number || 0) + 1

    const storagePath = `despachos/${dispatchRecord.internal_code}/${document_type}/v${version_number}_${timestamp}_${sanitizedName}`

    const mimeType = resolveMimeType(sanitizedName, file.type)

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json({ error: `Error al guardar en storage: ${storageError.message}` }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('documentos').getPublicUrl(storagePath)
    const fileUrl = publicUrlData.publicUrl

    // Insertar el documento de despacho. drive_file_id queda null: el archivo ya
    // está a salvo en Supabase Storage y la subida a Drive ocurre en segundo plano.
    const { data: docRecord, error: dbError } = await supabaseAdmin
      .from('dispatch_documents')
      .insert({
        dispatch_id: id,
        document_type,
        original_file_name: sanitizedName,
        drive_file_id: null,
        drive_file_url: null,
        storage_path: storagePath,
        storage_url: fileUrl,
        uploaded_by: userId || null,
        version_number,
        is_correction: version_number > 1,
        status: 'uploaded',
        file_hash,
      })
      .select()
      .single()

    if (dbError) {
      await supabaseAdmin.storage.from('documentos').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // 4. Auto-parseo del Packlist
    if (document_type === 'pack_list') {
      // Auto-parsear automáticamente el Packlist en la subida
      try {
        const { parsePacklistPdf } = await import('@/lib/packlist-parser')
        const parseRes = await parsePacklistPdf(buffer)
        if (parseRes.success && parseRes.items.length > 0) {
          await supabaseAdmin.from('dispatch_packlist_items').delete().eq('dispatch_id', id)
          const rowsToInsert = parseRes.items.map(item => ({
            dispatch_id: id,
            especie: item.especie,
            variedad: item.variedad,
            envase: item.envase,
            calibre: item.calibre,
            cajas: item.cajas,
            peso_neto_unitario: item.peso_neto_unitario,
            peso_neto_total: item.peso_neto_total
          }))
          await supabaseAdmin.from('dispatch_packlist_items').insert(rowsToInsert)
        }
      } catch (e: any) {
        console.error('Error auto-parseando Packlist en subida:', e?.message)
      }
    }

    // 5. Contadores y estado general: se recuentan los documentos vivos.
    // El despacho queda 'complete' solo si el Pack List está VALIDADO.
    await recalcularDespacho(id)

    // Tras responder: sincronizar a Drive en segundo plano (con reintentos) y
    // registrar auditoría. Si Drive fallara, el cron automático lo recupera.
    after(async () => {
      try {
        await syncDocsToDrive({ table: 'dispatch_documents', docId: docRecord.id })
      } catch (e: any) {
        console.error('[UPLOAD-DESPACHO] Drive en segundo plano falló (lo recuperará el cron):', e.message)
      }
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId || null,
        action: 'UPLOAD_DISPATCH_DOCUMENT',
        entity_type: 'dispatch_documents',
        entity_id: docRecord.id,
        details: { dispatch_id: id, document_type, file_name: sanitizedName },
      })
    })

    return NextResponse.json({ data: docRecord }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/despachos/[id]/upload error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
