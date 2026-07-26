// ─────────────────────────────────────────────────────────────────────────────
// PERMISOS CENTRALIZADOS
//
// Antes, listas como ['admin', 'jefe_frio', 'sag', 'despacho'] estaban
// copiadas y pegadas en varios lugares del código (la navegación, la subida
// de documentos, los botones de acción...). Cuando alguien cambiaba quién
// podía hacer qué, había que acordarse de tocar cada copia — y si se
// olvidaba una, quedaba una inconsistencia silenciosa.
//
// Este archivo es el único lugar donde se define "quién puede qué".
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES_OPERATIVOS_DESPACHO = ['admin', 'jefe_frio', 'sag', 'despacho'] as const
export const ROLES_OPERATIVOS_LOTE = ['admin', 'jefe_frio', 'calidad', 'cuadratura'] as const
export const ROLES_SOLO_LECTURA = ['gerencia', 'agronomo'] as const
export const ROLES_CON_ACCESO_TEMPERATURAS = ['admin', 'jefe_frio', 'gerencia', 'agronomo'] as const
export const ROLES_CON_ACCESO_DESPACHOS = ['admin', 'jefe_frio', 'sag', 'despacho', 'gerencia', 'agronomo'] as const
export const ROLES_CON_ACCESO_LOTES = ['admin', 'jefe_frio', 'calidad', 'cuadratura', 'gerencia', 'agronomo'] as const

type RolUsuario = string | null | undefined

export function esAdmin(role: RolUsuario): boolean {
  return role === 'admin'
}

export function esSoloLectura(role: RolUsuario): boolean {
  return ROLES_SOLO_LECTURA.includes((role || '') as any)
}

// ¿Puede este rol subir/gestionar documentos de despacho (fotos, packlist)?
export function puedeGestionarDespacho(role: RolUsuario): boolean {
  return ROLES_OPERATIVOS_DESPACHO.includes((role || '') as any)
}

// ¿Puede este rol subir informes de lote (recepción/calidad/proceso)?
export function puedeGestionarLote(role: RolUsuario): boolean {
  return ROLES_OPERATIVOS_LOTE.includes((role || '') as any)
}

// Solo el administrador valida, elimina (envía a la papelera) y cierra/reabre
// registros. Se centraliza aquí por si en el futuro se abre a otro rol.
export function puedeValidar(role: RolUsuario): boolean {
  return esAdmin(role)
}

export function puedeEliminarDocumentos(role: RolUsuario): boolean {
  return esAdmin(role)
}

export function puedeAdministrarSistema(role: RolUsuario): boolean {
  return esAdmin(role)
}
