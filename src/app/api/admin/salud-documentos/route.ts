import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { TABLAS_DOCUMENTOS } from '@/lib/papelera'

export const maxDuration = 60

// GET /api/admin/salud-documentos
//
// Radiografía del estado de los documentos. Responde de un vistazo:
//   · ¿Cuántos documentos hay y cuántos ya tienen copia permanente en Drive?
//   · ¿Cuántos están esperando subir a Drive? (si este número no baja, algo falla)
//   · ¿Hay archivos guardados en Supabase que NADIE registró? (subidas fantasma)
//   · ¿Cuánto espacio se está usando?
//
// Hasta ahora nada de esto era visible: un documento podía quedarse sin llegar
// a Drive, o un archivo podía quedar huérfano, y no había forma de enterarse.
export async function GET() {
  try {
    const headersList = await headers()
    if (headersList.get('x-user-role') !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    // 1. Conteos por tabla
    const porTabla: Record<string, any> = {}
    let totalVivos = 0
    let totalSinDrive = 0
    let totalEnPapelera = 0
    let totalArchivados = 0 // sin copia en Supabase, viven solo en Drive
    const rutasRegistradas = new Set<string>()

    for (const table of TABLAS_DOCUMENTOS) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('id, storage_path, drive_file_id, deleted_at')
        .limit(20000)

      if (error) continue // client_documents puede no existir

      const filas = data || []
      const vivos = filas.filter(d => !d.deleted_at)
      const sinDrive = vivos.filter(d => !d.drive_file_id)
      const archivados = vivos.filter(d => !d.storage_path && d.drive_file_id)

      for (const d of filas) {
        if (d.storage_path) rutasRegistradas.add(d.storage_path)
      }

      porTabla[table] = {
        vivos: vivos.length,
        sin_drive: sinDrive.length,
        archivados_solo_drive: archivados.length,
        en_papelera: filas.length - vivos.length,
      }

      totalVivos += vivos.length
      totalSinDrive += sinDrive.length
      totalEnPapelera += filas.length - vivos.length
      totalArchivados += archivados.length
    }

    // 2. Inventario real del bucket vs. lo registrado en la base
    let huerfanos: { path: string; size_bytes: number; created_at: string }[] = []
    let totalObjetos = 0
    let bytesTotales = 0
    let inventarioDisponible = true

    const { data: objetos, error: rpcError } = await supabaseAdmin.rpc('list_storage_objects')

    if (rpcError || !objetos) {
      inventarioDisponible = false
    } else {
      const lista = objetos as { path: string; size_bytes: number; created_at: string }[]
      totalObjetos = lista.length
      for (const o of lista) {
        bytesTotales += Number(o.size_bytes) || 0
        if (!rutasRegistradas.has(o.path)) huerfanos.push(o)
      }
      huerfanos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return NextResponse.json({
      data: {
        resumen: {
          documentos_vivos: totalVivos,
          respaldados_en_drive: totalVivos - totalSinDrive,
          esperando_drive: totalSinDrive,
          archivados_solo_drive: totalArchivados,
          en_papelera: totalEnPapelera,
          archivos_huerfanos: huerfanos.length,
        },
        almacenamiento: {
          objetos: totalObjetos,
          mb_usados: Number((bytesTotales / (1024 * 1024)).toFixed(1)),
          inventario_disponible: inventarioDisponible,
        },
        por_tabla: porTabla,
        huerfanos: huerfanos.slice(0, 100),
        aviso: inventarioDisponible
          ? null
          : 'Falta ejecutar migration_fase0_blindaje.sql en Supabase: sin la función list_storage_objects no se pueden detectar archivos huérfanos.',
      },
    })
  } catch (err: any) {
    console.error('GET /api/admin/salud-documentos error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
