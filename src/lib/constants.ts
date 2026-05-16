// Definición de todos los roles del sistema
export const ROLES = {
  ADMIN: 'admin',
  JEFE_FRIO: 'jefe_frio',
  CALIDAD: 'calidad',
  CUADRATURA: 'cuadratura',
  SAG: 'sag',
  DESPACHO: 'despacho',
  GERENCIA: 'gerencia',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]

// Definición de todos los permisos
export const PERMISSIONS = {
  CAN_CREATE_LOT: 'can_create_lot',
  CAN_CREATE_DISPATCH: 'can_create_dispatch',
  CAN_UPLOAD_RECEPTION: 'can_upload_reception',
  CAN_UPLOAD_QUALITY: 'can_upload_quality',
  CAN_UPLOAD_PROCESS: 'can_upload_process',
  CAN_UPLOAD_TEMPERATURE: 'can_upload_temperature',
  CAN_UPLOAD_PACK_LIST: 'can_upload_pack_list',
  CAN_UPLOAD_DISPATCH_PHOTOS: 'can_upload_dispatch_photos',
  CAN_VIEW_ALL: 'can_view_all',
  CAN_DOWNLOAD_ALL: 'can_download_all',
  CAN_VALIDATE: 'can_validate',
  CAN_OBSERVE: 'can_observe',
  CAN_CLOSE: 'can_close',
  CAN_REOPEN: 'can_reopen',
  CAN_MANAGE_USERS: 'can_manage_users',
  CAN_MANAGE_KEYWORDS: 'can_manage_keywords',
  CAN_SYNC_DRIVE: 'can_sync_drive',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

// Permisos por defecto según rol
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  admin: Object.values(PERMISSIONS),
  jefe_frio: [
    PERMISSIONS.CAN_CREATE_LOT,
    PERMISSIONS.CAN_UPLOAD_RECEPTION,
    PERMISSIONS.CAN_UPLOAD_TEMPERATURE,
    PERMISSIONS.CAN_UPLOAD_DISPATCH_PHOTOS,
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
  calidad: [
    PERMISSIONS.CAN_CREATE_LOT,
    PERMISSIONS.CAN_UPLOAD_QUALITY,
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
  cuadratura: [
    PERMISSIONS.CAN_UPLOAD_PROCESS,
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
  sag: [
    PERMISSIONS.CAN_CREATE_DISPATCH,
    PERMISSIONS.CAN_UPLOAD_PACK_LIST,
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
  despacho: [
    PERMISSIONS.CAN_UPLOAD_DISPATCH_PHOTOS,
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
  gerencia: [
    PERMISSIONS.CAN_VIEW_ALL,
    PERMISSIONS.CAN_DOWNLOAD_ALL,
  ],
}

// Display names para UI
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  admin: 'Administrador',
  jefe_frio: 'Jefe de Frío',
  calidad: 'Control de Calidad',
  cuadratura: 'Cuadratura',
  sag: 'Contraparte SAG',
  despacho: 'Despacho',
  gerencia: 'Gerencia',
}

// Estados de documentos con colores semáforo
export const DOCUMENT_STATES = {
  PENDING: 'pending',
  UPLOADED: 'uploaded',
  VALIDATED: 'validated',
  OBSERVED: 'observed',
  LATE: 'late',
  COMPLETE: 'complete',
  CLOSED: 'closed',
} as const

export type DocumentState = typeof DOCUMENT_STATES[keyof typeof DOCUMENT_STATES]

export const STATE_COLORS: Record<DocumentState, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  uploaded: 'bg-blue-100 text-blue-800 border-blue-300',
  validated: 'bg-green-100 text-green-800 border-green-300',
  observed: 'bg-orange-100 text-orange-800 border-orange-300',
  late: 'bg-red-100 text-red-800 border-red-300',
  complete: 'bg-green-100 text-green-800 border-green-300',
  closed: 'bg-gray-100 text-gray-800 border-gray-300',
}

export const STATE_LABELS: Record<DocumentState, string> = {
  pending: 'Pendiente',
  uploaded: 'Subido',
  validated: 'Validado',
  observed: 'Observado',
  late: 'Atrasado',
  complete: 'Completo',
  closed: 'Cerrado',
}

// Plazos en horas para cada tipo de documento
export const DOCUMENT_DEADLINES_HOURS = {
  reception: 24,
  quality: 24,
  process: 7 * 24, // 7 días
  temperature: 24,  // mismo día
  pack_list: 24,
} as const

// Mínimos para despacho fotos
export const DISPATCH_PHOTO_MINIMUMS = {
  pata_pata: 11,
  thermograph: 2,
  total: 13,
} as const
