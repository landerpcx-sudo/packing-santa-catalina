// ─────────────────────────────────────────────────────────────────────────────
// "MIS TAREAS PENDIENTES" POR ROL
//
// Antes, la pantalla que responde "¿qué me falta hacer hoy?" (/pendientes)
// solo la veía el administrador — porque en realidad esa pantalla es la cola
// de VALIDACIÓN (documentos ya subidos, esperando que el admin los revise).
// El jefe de frío, calidad, cuadratura, SAG y despacho no tenían ningún lugar
// donde ver qué les toca subir a ELLOS.
//
// Esta función reutiliza la misma lógica de responsabilidades y plazos que ya
// existía (antes solo vivía dentro del generador del mensaje de WhatsApp) y
// la expone como una lista filtrable por rol, para mostrarla en el Dashboard
// de cada persona.
// ─────────────────────────────────────────────────────────────────────────────

export interface TareaPendiente {
  entidad: 'lote' | 'despacho' | 'temperatura'
  id?: string
  codigo: string
  cliente?: string | null
  descripcion: string
  atrasado: boolean
}

function estaVencido(fechaStr: string | null | undefined, tipo: '24h_next_day_12pm' | '7days'): boolean {
  if (!fechaStr) return true
  const creada = new Date(fechaStr)
  const ahora = new Date()
  if (tipo === '24h_next_day_12pm') {
    const limite = new Date(creada)
    limite.setDate(limite.getDate() + 1)
    limite.setHours(12, 0, 0, 0)
    return ahora.getTime() >= limite.getTime()
  }
  const limite = new Date(creada)
  limite.setDate(limite.getDate() + 7)
  return ahora.getTime() >= limite.getTime()
}

interface DatosPendientes {
  lots: any[]
  dispatches: any[]
  missing_temperatures: string[]
}

// Roles que tienen tareas de subida propias. Gerencia y agrónomo son de solo
// consulta; admin tiene su propia cola de validación en /pendientes.
export function calcularMisTareas(data: DatosPendientes, role: string): TareaPendiente[] {
  const tareas: TareaPendiente[] = []

  if (role === 'jefe_frio') {
    for (const l of data.lots || []) {
      if ((l.reception_status === 'pending' || l.reception_status === 'late' || l.reception_status === 'observed') && estaVencido(l.created_at, '24h_next_day_12pm')) {
        tareas.push({
          entidad: 'lote', id: l.id, codigo: l.internal_code, cliente: l.client,
          descripcion: l.reception_status === 'observed' ? 'Corregir Informe de Recepción (observado)' : 'Subir Informe de Recepción',
          atrasado: true,
        })
      }
    }
    for (const d of data.dispatches || []) {
      const minPata = Math.ceil((d.expected_pallets || 0) / 2)
      const pataOk = (d.pata_pata_photos_count || 0) >= minPata
      const thermoOk = (d.thermograph_photos_count || 0) >= 2
      if ((!pataOk || !thermoOk) && estaVencido(d.dispatch_date || d.created_at, '24h_next_day_12pm')) {
        tareas.push({
          entidad: 'despacho', id: d.id, codigo: d.internal_code, cliente: d.client,
          descripcion: !pataOk && !thermoOk ? 'Subir fotos pata a pata y termógrafos' : !pataOk ? 'Faltan fotos pata a pata' : 'Faltan fotos de termógrafos',
          atrasado: true,
        })
      }
    }
    if ((data.missing_temperatures || []).length > 0) {
      tareas.push({
        entidad: 'temperatura', codigo: '—', descripcion: `Registrar temperatura de ${data.missing_temperatures.length} día(s) sin control`,
        atrasado: true,
      })
    }
  }

  if (role === 'calidad') {
    for (const l of data.lots || []) {
      if ((l.quality_status === 'pending' || l.quality_status === 'late' || l.quality_status === 'observed') && estaVencido(l.created_at, '24h_next_day_12pm')) {
        tareas.push({
          entidad: 'lote', id: l.id, codigo: l.internal_code, cliente: l.client,
          descripcion: l.quality_status === 'observed' ? 'Corregir Informe de Calidad (observado)' : 'Subir Informe de Calidad',
          atrasado: true,
        })
      }
    }
  }

  if (role === 'cuadratura') {
    for (const l of data.lots || []) {
      if ((l.process_status === 'pending' || l.process_status === 'late' || l.process_status === 'observed') && estaVencido(l.created_at, '7days')) {
        tareas.push({
          entidad: 'lote', id: l.id, codigo: l.internal_code, cliente: l.client,
          descripcion: l.process_status === 'observed' ? 'Corregir Informe de Proceso (observado)' : 'Subir Informe de Proceso',
          atrasado: true,
        })
      }
    }
  }

  if (role === 'sag' || role === 'despacho') {
    for (const d of data.dispatches || []) {
      if ((d.pack_list_status === 'pending' || d.pack_list_status === 'late' || d.pack_list_status === 'observed') && estaVencido(d.dispatch_date || d.created_at, '24h_next_day_12pm')) {
        tareas.push({
          entidad: 'despacho', id: d.id, codigo: d.internal_code, cliente: d.client,
          descripcion: d.pack_list_status === 'observed' ? 'Corregir Packing List (observado)' : 'Subir Packing List',
          atrasado: true,
        })
      }
    }
  }

  return tareas
}
