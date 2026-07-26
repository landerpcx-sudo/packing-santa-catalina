import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadFile } from '@/lib/drive'
import { recalculateLotStatus } from '@/lib/status-helper'

// POST /api/documentos/[table]/[id]/validar
export async function POST(
  request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const { table, id } = await params
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    // Solo admin o usuarios con permiso pueden validar
    // Por ahora permitimos a admin
    if (userRole !== 'admin') {
      // Verificar can_validate en DB si no es admin (opcional)
      const { data: userRecord } = await supabaseAdmin
        .from('users_app')
        .select('can_validate')
        .eq('id', userId)
        .single()
        
      if (!userRecord?.can_validate) {
        return NextResponse.json({ error: 'No tienes permisos para validar documentos.' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { action, observation } = body

    if (!['validate', 'observe'].includes(action)) {
      return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
    }

    const validation_status = action === 'validate' ? 'validated' : 'observed'
    const status = action === 'validate' ? 'validated' : 'observed'

    // Asegurarnos de que la tabla sea segura (evitar SQL injection via URL)
    if (!['lot_documents', 'dispatch_documents'].includes(table)) {
      return NextResponse.json({ error: 'Tabla no válida.' }, { status: 400 })
    }

    const { data: doc, error } = await supabaseAdmin
      .from(table)
      .update({
        status,
        validation_status,
        observation: action === 'observe' ? observation : null,
        validated_by: userId || null,
        validated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Si es un documento de lote, actualizamos de forma inteligente el estado general y de etapas del lote
    if (table === 'lot_documents') {
      await recalculateLotStatus(doc.lot_id)
    }

    if (table === 'dispatch_documents') {
      const { data: dispatch } = await supabaseAdmin
        .from('dispatches')
        .select('pack_list_status, pata_pata_photos_count, thermograph_photos_count, expected_pallets')
        .eq('id', doc.dispatch_id)
        .single()
      
      if (dispatch) {
        const { data: allDocs } = await supabaseAdmin
          .from('dispatch_documents')
          .select('status')
          .eq('dispatch_id', doc.dispatch_id)
          .is('deleted_at', null)

        const minPata = Math.ceil((dispatch.expected_pallets || 0) / 2)

        // Usar el status NUEVO del documento recién validado para el pack_list
        const newPackListStatus = doc.document_type === 'pack_list' ? doc.status : dispatch.pack_list_status

        // Re-evaluar con el valor actualizado
        const anyObserved = allDocs?.some(d => d.status === 'observed') || (doc.document_type !== 'pack_list' && doc.status === 'observed')
        const meetsRequirements =
          newPackListStatus === 'validated' &&
          dispatch.pata_pata_photos_count >= minPata &&
          dispatch.thermograph_photos_count >= 2

        let overall = 'uploaded'
        if (anyObserved) {
          overall = 'observed'
        } else if (meetsRequirements) {
          overall = 'complete'
        }

        const updates: any = { overall_status: overall }
        if (doc.document_type === 'pack_list') {
          updates.pack_list_status = doc.status
        }

        await supabaseAdmin
          .from('dispatches')
          .update(updates)
          .eq('id', doc.dispatch_id)
      }
    }

    // 3. Sincronización con Google Drive al validar (Opción de Rescate)
    // Si la acción es 'validate' y no tiene drive_file_id, intentamos sincronizar ahora
    if (action === 'validate' && !doc.drive_file_id) {
      try {
        console.log(`Iniciando rescate de sincronización para documento ${doc.id} (${table})...`)
        
        // 1. Obtener el archivo de Supabase Storage
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from('documentos')
          .download(doc.storage_path)

        if (!downloadError && fileData) {
          const arrayBuffer = await fileData.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          
          // 2. Determinar carpeta destino
          let targetFolderId = null
          if (table === 'lot_documents') {
            const { data: lot } = await supabaseAdmin
              .from('lots')
              .select('drive_folder_id, drive_folder_reception_id, drive_folder_quality_id, drive_folder_process_id, drive_folder_backup_id')
              .eq('id', doc.lot_id)
              .single()
            
            if (lot) {
              const folderMap: any = {
                reception: lot.drive_folder_reception_id,
                quality: lot.drive_folder_quality_id,
                process: lot.drive_folder_process_id,
                photo_process: lot.drive_folder_process_id,
                backup: lot.drive_folder_backup_id,
              }
              targetFolderId = folderMap[doc.document_type] || lot.drive_folder_id
            }
          } else {
            const { data: dispatch } = await supabaseAdmin
              .from('dispatches')
              .select('drive_folder_id')
              .eq('id', doc.dispatch_id)
              .single()
            if (dispatch) targetFolderId = dispatch.drive_folder_id
          }

          // 3. Subir a Drive
          if (targetFolderId) {
            const driveFile = await uploadFile(
              buffer, 
              `v${doc.version_number}_${doc.original_file_name}`, 
              fileData.type, 
              targetFolderId
            )
            
            if (driveFile.id) {
              // 4. Actualizar el registro con los nuevos datos de Drive
              await supabaseAdmin
                .from(table)
                .update({
                  drive_file_id: driveFile.id,
                  drive_file_url: driveFile.url
                })
                .eq('id', id)
              
              console.log(`Rescate exitoso: Documento ${doc.id} sincronizado con Drive.`)
            }
          }
        }
      } catch (syncErr: any) {
        console.error("Error en rescate de sincronización Drive al validar:", syncErr.message)
      }
    }

    // Auditoría
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      action: action === 'validate' ? 'VALIDATE_DOCUMENT' : 'OBSERVE_DOCUMENT',
      entity_type: table,
      entity_id: id,
      details: { observation },
    })

    return NextResponse.json({ data: doc })
  } catch (err: any) {
    console.error(`POST /api/documentos/[table]/[id]/validar error:`, err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
