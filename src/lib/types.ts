// Tipos de datos del sistema

export interface User {
  id: string
  username: string
  display_name: string
  role: string
  area: string | null
  active: boolean
  can_validate: boolean
  can_view_all: boolean
  can_download_all: boolean
  can_manage_users: boolean
  can_sync_drive: boolean
  can_create_lot: boolean
  can_view_drive: boolean
  created_at: string
  updated_at: string
}

export interface Lot {
  id: string
  internal_code: string   // LOT-2026-0226
  lot_number: string      // 226
  display_name: string    // Lote 226
  client: string | null
  producer: string | null
  species: string | null  // Manzana, Pera
  variety: string | null
  created_by: string
  drive_folder_id: string | null
  drive_folder_url: string | null
  reception_status: string
  quality_status: string
  process_status: string
  overall_status: string
  created_at: string
  updated_at: string
  closed_at: string | null
  // joins
  creator?: User
}

export interface LotDocument {
  id: string
  lot_id: string
  document_type: string  // reception/quality/process/photo/other
  original_file_name: string
  drive_file_id: string
  drive_file_url: string | null
  drive_view_url: string | null
  uploaded_by: string
  version_number: number
  is_correction: boolean
  status: string
  validation_status: string
  validated_by: string | null
  validated_at: string | null
  observation: string | null
  created_at: string
  // joins
  uploader?: User
  validator?: User
}

export interface TemperatureReport {
  id: string
  internal_code: string   // TEMP-2026-05-15
  report_date: string
  client: string | null
  variety: string | null
  chamber: string | null
  temperature_value: number | null
  responsible_id: string | null
  drive_folder_id: string | null
  drive_folder_url: string | null
  status: string
  observation: string | null
  created_at: string
  updated_at: string
  // joins
  responsible?: User
}

export interface TemperatureDocument {
  id: string
  temperature_report_id: string
  document_type: string  // daily_report/photo/backup/other
  original_file_name: string
  drive_file_id: string
  drive_file_url: string | null
  uploaded_by: string
  status: string
  created_at: string
  // joins
  uploader?: User
}

export interface Dispatch {
  id: string
  internal_code: string   // DES-2026-0089
  dispatch_code: string   // DES-089
  client: string | null
  dispatch_date: string | null
  destination: string | null
  expected_pallets: number | null
  drive_folder_id: string | null
  drive_folder_url: string | null
  pack_list_status: string
  pata_pata_photos_count: number
  thermograph_photos_count: number
  total_photos_count: number
  thermograph_temperature: number | null
  photos_status: string
  overall_status: string
  observation: string | null
  created_by: string
  created_at: string
  updated_at: string
  closed_at: string | null
  // joins
  creator?: User
}

export interface DispatchDocument {
  id: string
  dispatch_id: string
  document_type: string  // pack_list/pata_pata_photo/thermograph_photo/thermograph_temp/other
  original_file_name: string
  drive_file_id: string
  drive_file_url: string | null
  uploaded_by: string
  version_number: number
  is_correction: boolean
  status: string
  validation_status: string
  validated_by: string | null
  validated_at: string | null
  observation: string | null
  created_at: string
  // joins
  uploader?: User
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  // joins
  user?: User
}

export interface KeywordRule {
  id: string
  module: string        // lots/temperatures/dispatches
  document_type: string
  keywords: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface AppSession {
  userId: string
  username: string
  displayName: string
  role: string
  area: string | null
  canValidate: boolean
  canViewAll: boolean
  canDownloadAll: boolean
  canManageUsers: boolean
  canSyncDrive: boolean
  canCreateLot: boolean
  canViewDrive: boolean
}

export interface DashboardStats {
  lots: {
    total: number
    complete: number
    incomplete: number
    receptionPending: number
    qualityPending: number
    processPending: number
    observed: number
    late: number
  }
  temperatures: {
    todayDone: boolean
    todayTemp: number | null
    monthTotal: number
    pending: number
    late: number
    lastReport: string | null
  }
  dispatches: {
    total: number
    complete: number
    incomplete: number
    packListPending: number
    pataPataMissing: number
    thermographMissing: number
    observed: number
    late: number
  }
}
