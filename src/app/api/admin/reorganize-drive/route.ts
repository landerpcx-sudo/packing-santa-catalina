import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createFolder, moveFolderOrFile } from '@/lib/drive'

export async function POST() {
  try {
    const headersList = await headers()
    const userRole = headersList.get('x-user-role')

    // Restringir estrictamente a administradores
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No tienes permisos para ejecutar esta acción administrativa.' }, { status: 403 })
    }

    console.log('Iniciando reorganización de Google Drive...')

    // 1. Obtener todos los clientes
    const { data: clients, error: clientsErr } = await supabaseAdmin
      .from('clients')
      .select('*')

    if (clientsErr) throw clientsErr

    const report: any[] = []

    for (const client of clients) {
      const clientReport: any = {
        clientName: client.name,
        createdSubfolders: [],
        movedLots: [],
        movedDispatches: [],
        movedDocuments: [],
        errors: []
      }

      if (!client.drive_folder_id) {
        clientReport.errors.push(`El cliente no tiene carpeta raíz en Google Drive.`)
        report.push(clientReport)
        continue
      }

      try {
        let recId = client.drive_folder_receptions_id
        let despId = client.drive_folder_dispatches_id
        let finId = client.drive_folder_financial_id

        // Crear subcarpeta Recepciones si no existe
        if (!recId) {
          const recFolder = await createFolder('Recepciones', client.drive_folder_id)
          recId = recFolder.id || null
          clientReport.createdSubfolders.push('Recepciones')
        }

        // Crear subcarpeta Despachos si no existe
        if (!despId) {
          const despFolder = await createFolder('Despachos', client.drive_folder_id)
          despId = despFolder.id || null
          clientReport.createdSubfolders.push('Despachos')
        }

        // Crear subcarpeta Financiero si no existe
        if (!finId) {
          const finFolder = await createFolder('Financiero', client.drive_folder_id)
          finId = finFolder.id || null
          clientReport.createdSubfolders.push('Financiero')
        }

        // Actualizar base de datos de cliente con los nuevos IDs
        await supabaseAdmin
          .from('clients')
          .update({
            drive_folder_receptions_id: recId,
            drive_folder_dispatches_id: despId,
            drive_folder_financial_id: finId
          })
          .eq('id', client.id)

        // --- MOVER LOTES ---
        if (recId) {
          const { data: lots, error: lotsErr } = await supabaseAdmin
            .from('lots')
            .select('id, internal_code, display_name, drive_folder_id')
            .eq('client', client.name)

          if (!lotsErr && lots) {
            for (const lot of lots) {
              if (lot.drive_folder_id) {
                try {
                  await moveFolderOrFile(lot.drive_folder_id, recId)
                  clientReport.movedLots.push(`${lot.internal_code} (${lot.display_name})`)
                } catch (e: any) {
                  clientReport.errors.push(`Error al mover lote ${lot.internal_code}: ${e.message}`)
                }
              }
            }
          }
        }

        // --- MOVER DESPACHOS ---
        if (despId) {
          const { data: dispatches, error: despErr } = await supabaseAdmin
            .from('dispatches')
            .select('id, internal_code, drive_folder_id')
            .eq('client', client.name)

          if (!despErr && dispatches) {
            for (const desp of dispatches) {
              if (desp.drive_folder_id) {
                try {
                  await moveFolderOrFile(desp.drive_folder_id, despId)
                  clientReport.movedDispatches.push(desp.internal_code)
                } catch (e: any) {
                  clientReport.errors.push(`Error al mover despacho ${desp.internal_code}: ${e.message}`)
                }
              }
            }
          }
        }

        // --- MOVER DOCUMENTOS FINANCIEROS ---
        if (finId) {
          const { data: docs, error: docsErr } = await supabaseAdmin
            .from('client_documents')
            .select('id, original_file_name, drive_file_id')
            .eq('client_id', client.id)

          if (!docsErr && docs) {
            for (const doc of docs) {
              if (doc.drive_file_id) {
                try {
                  await moveFolderOrFile(doc.drive_file_id, finId)
                  clientReport.movedDocuments.push(doc.original_file_name)
                } catch (e: any) {
                  clientReport.errors.push(`Error al mover documento ${doc.original_file_name}: ${e.message}`)
                }
              }
            }
          }
        }

      } catch (err: any) {
        clientReport.errors.push(`Error general en el cliente: ${err.message}`)
      }

      report.push(clientReport)
    }

    console.log('Reorganización de Google Drive completada.')
    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    console.error('POST /api/admin/reorganize-drive error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
