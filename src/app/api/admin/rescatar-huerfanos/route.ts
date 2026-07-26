import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncDocsToDrive } from '@/lib/drive-sync'
import { recalcularDespacho } from '@/lib/papelera'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/rescatar-huerfanos
//
// Recupera "subidas fantasma": archivos que SÍ se guardaron en Supabase Storage
// pero cuyo registro en la base nunca llegó a crearse (se cortó internet, se
// cerró la pestaña, se apagó el teléfono justo entre un paso y el siguiente).
// Esos archivos existen, ocupan espacio y son invisibles para todo el mundo.
//
// La ruta de almacenamiento guarda toda la información necesaria para
// reconstruir el registro:
//     despachos/{codigo_interno}/{tipo_documento}/v{n}_{fecha}_{nombre}
//     lotes/{codigo_interno}/{tipo_documento}/v{n}_{fecha}_{nombre}
//     temperaturas/{codigo_interno}/{tipo_documento}/{fecha}_{nombre}
//
// Por defecto SIMULA. Para reincorporar de verdad: { confirm: "RESCATAR" }.
// Nunca borra ni sobrescribe nada: solo crea los registros que faltaban.
// ─────────────────────────────────────────────────────────────────────────────

interface RutaAnalizada {
  entidad: 'despachos' | 'lotes' | 'temperaturas'
  codigoInterno: string
  documentType: string
  versionNumber: number
  nombreArchivo: string
}

function analizarRuta(path: string): RutaAnalizada | null {
  const partes = path.split('/')
  if (partes.length < 4) return null

  const [raiz, codigoInterno, documentType, archivo] = partes
  if (!['despachos', 'lotes', 'temperaturas'].includes(raiz)) return null
  if (!codigoInterno || !documentType || !archivo) return null

  // v3_2026-07-26T10-15-00_Packlist DSP-072.pdf  →  versión 3, nombre limpio
  const conVersion = archivo.match(/^v(\d+)_[^_]+_(.+)$/)
  if (conVersion) {
    return {
      entidad: raiz as any,
      codigoInterno,
      documentType,
      versionNumber: parseInt(conVersion[1], 10) || 1,
      nombreArchivo: conVersion[2],
    }
  }

  // 2026-07-26T10-15-00_informe.pdf  →  sin versión (temperaturas)
  const sinVersion = archivo.match(/^[\d T:.-]+_(.+)$/)
  return {
    entidad: raiz as any,
    codigoInterno,
    documentType,
    versionNumber: 1,
    nombreArchivo: sinVersion ? sinVersion[1] : archivo,
  }
}

const CONFIG = {
  despachos: { tabla: 'dispatch_documents', padre: 'dispatches', fk: 'dispatch_id' },
  lotes: { tabla: 'lot_documents', padre: 'lots', fk: 'lot_id' },
  temperaturas: { tabla: 'temperature_documents', padre: 'temperature_reports', fk: 'temperature_report_id' },
} as const

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    if (headersList.get('x-user-role') !== 'admin') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const rescatarDeVerdad = body?.confirm === 'RESCATAR'

    // 1. Inventario del bucket
    const { data: objetos, error: rpcError } = await supabaseAdmin.rpc('list_storage_objects')
    if (rpcError || !objetos) {
      return NextResponse.json(
        { error: 'Falta ejecutar migration_fase0_blindaje.sql en Supabase (función list_storage_objects).' },
        { status: 503 }
      )
    }

    // 2. Rutas ya registradas
    const registradas = new Set<string>()
    for (const tabla of ['lot_documents', 'dispatch_documents', 'temperature_documents', 'client_documents']) {
      const { data, error } = await supabaseAdmin
        .from(tabla)
        .select('storage_path')
        .not('storage_path', 'is', null)
        .limit(20000)
      if (error) continue
      for (const d of data || []) registradas.add(d.storage_path)
    }

    const lista = objetos as { path: string; size_bytes: number; created_at: string }[]
    const huerfanos = lista.filter(o => !registradas.has(o.path))

    // 3. Reconstruir
    const rescatados: { path: string; nombre: string; entidad: string; codigo: string }[] = []
    const noIdentificados: { path: string; motivo: string }[] = []
    const nuevosIds: { tabla: string; id: string }[] = []
    const despachosTocados = new Set<string>()

    for (const obj of huerfanos) {
      const info = analizarRuta(obj.path)
      if (!info) {
        noIdentificados.push({ path: obj.path, motivo: 'La ruta no sigue el formato conocido.' })
        continue
      }

      const cfg = CONFIG[info.entidad]

      const { data: padre } = await supabaseAdmin
        .from(cfg.padre)
        .select('id')
        .eq('internal_code', info.codigoInterno)
        .maybeSingle()

      if (!padre) {
        noIdentificados.push({
          path: obj.path,
          motivo: `No existe ${info.entidad.slice(0, -1)} con código ${info.codigoInterno} (puede haberse eliminado).`,
        })
        continue
      }

      if (!rescatarDeVerdad) {
        rescatados.push({ path: obj.path, nombre: info.nombreArchivo, entidad: info.entidad, codigo: info.codigoInterno })
        continue
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from('documentos').getPublicUrl(obj.path)

      const registro: any = {
        [cfg.fk]: padre.id,
        document_type: info.documentType,
        original_file_name: info.nombreArchivo,
        drive_file_id: null,
        drive_file_url: null,
        storage_path: obj.path,
        storage_url: publicUrlData.publicUrl,
        uploaded_by: null,
        status: 'uploaded',
        created_at: obj.created_at,
      }
      if (info.entidad !== 'temperaturas') {
        registro.version_number = info.versionNumber
        registro.is_correction = info.versionNumber > 1
      }

      const { data: insertado, error: insError } = await supabaseAdmin
        .from(cfg.tabla)
        .insert(registro)
        .select('id')
        .single()

      if (insError || !insertado) {
        noIdentificados.push({ path: obj.path, motivo: `No se pudo registrar: ${insError?.message}` })
        continue
      }

      nuevosIds.push({ tabla: cfg.tabla, id: insertado.id })
      rescatados.push({ path: obj.path, nombre: info.nombreArchivo, entidad: info.entidad, codigo: info.codigoInterno })
      if (info.entidad === 'despachos') despachosTocados.add(padre.id)
    }

    // 4. Poner al día contadores y mandar a Drive lo rescatado
    if (rescatarDeVerdad && rescatados.length > 0) {
      for (const dispatchId of despachosTocados) {
        await recalcularDespacho(dispatchId)
      }

      for (const nuevo of nuevosIds) {
        try {
          await syncDocsToDrive({ table: nuevo.tabla as any, docId: nuevo.id })
        } catch (e: any) {
          console.error('[RESCATE] Drive falló, el cron lo reintentará:', e.message)
        }
      }

      await supabaseAdmin.from('audit_log').insert({
        user_id: userId || null,
        action: 'RESCUE_ORPHAN_FILES',
        entity_type: 'storage',
        entity_id: null,
        details: { rescatados: rescatados.length, no_identificados: noIdentificados.length },
      })
    }

    return NextResponse.json({
      simulacion: !rescatarDeVerdad,
      total_huerfanos: huerfanos.length,
      rescatados: rescatados.length,
      no_identificados: noIdentificados.length,
      detalle_rescatados: rescatados.slice(0, 100),
      detalle_no_identificados: noIdentificados.slice(0, 100),
      message: rescatarDeVerdad
        ? `Se reincorporaron ${rescatados.length} archivos que estaban guardados pero sin registro. Ya aparecen en sus fichas y se están subiendo a Drive.`
        : `Se encontraron ${huerfanos.length} archivos sin registro, de los cuales ${rescatados.length} se pueden reincorporar automáticamente. Nada se ha modificado todavía.`,
    })
  } catch (err: any) {
    console.error('POST /api/admin/rescatar-huerfanos error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
