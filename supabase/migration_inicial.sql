-- ============================================================
-- MIGRACIÓN INICIAL - Sistema Control Documental
-- Packing Santa Catalina
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USUARIOS DE LA APP (sin Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS users_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','jefe_frio','calidad','cuadratura','sag','despacho','gerencia')),
  area TEXT,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  can_validate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. PERMISOS POR USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users_app(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, permission_key)
);

-- ============================================================
-- 3. LOTES / RECEPCIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code TEXT UNIQUE NOT NULL,     -- LOT-2026-0226
  lot_number TEXT NOT NULL,               -- 226
  display_name TEXT NOT NULL,             -- Lote 226
  client TEXT,
  producer TEXT,
  species TEXT,                           -- Manzana, Pera
  variety TEXT,
  created_by UUID REFERENCES users_app(id),
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  reception_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reception_status IN ('pending','uploaded','validated','observed','late')),
  quality_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (quality_status IN ('pending','uploaded','validated','observed','late')),
  process_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (process_status IN ('pending','uploaded','validated','observed','late')),
  overall_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (overall_status IN ('pending','complete','late','closed')),
  reception_deadline TIMESTAMPTZ,
  quality_deadline TIMESTAMPTZ,
  process_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ============================================================
-- 4. DOCUMENTOS DE LOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS lot_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('reception','quality','process','photo_process','backup','other')),
  original_file_name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT,
  drive_view_url TEXT,
  uploaded_by UUID REFERENCES users_app(id),
  version_number INT NOT NULL DEFAULT 1,
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','validated','observed')),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending','validated','observed')),
  validated_by UUID REFERENCES users_app(id),
  validated_at TIMESTAMPTZ,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. REPORTES DE TEMPERATURA
-- ============================================================
CREATE TABLE IF NOT EXISTS temperature_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code TEXT UNIQUE NOT NULL,     -- TEMP-2026-05-15
  report_date DATE NOT NULL,
  client TEXT,
  chamber TEXT,
  temperature_value NUMERIC(5,2),
  responsible_id UUID REFERENCES users_app(id),
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploaded','validated','observed','late')),
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_ambient BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT temperature_reports_date_client_variety_key UNIQUE NULLS NOT DISTINCT (report_date, client, variety, chamber)
);

-- ============================================================
-- 6. DOCUMENTOS DE TEMPERATURA
-- ============================================================
CREATE TABLE IF NOT EXISTS temperature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temperature_report_id UUID NOT NULL REFERENCES temperature_reports(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('daily_report','photo','backup','other')),
  original_file_name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT,
  uploaded_by UUID REFERENCES users_app(id),
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. DESPACHOS
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code TEXT UNIQUE NOT NULL,     -- DES-2026-0089
  dispatch_code TEXT NOT NULL,            -- DES-089
  client TEXT,
  dispatch_date DATE,
  destination TEXT,
  expected_pallets INT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  pack_list_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (pack_list_status IN ('pending','uploaded','validated','observed')),
  pata_pata_photos_count INT NOT NULL DEFAULT 0,
  thermograph_photos_count INT NOT NULL DEFAULT 0,
  total_photos_count INT NOT NULL DEFAULT 0,
  thermograph_temperature NUMERIC(5,2),
  photos_status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (photos_status IN ('incomplete','complete')),
  overall_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (overall_status IN ('pending','complete','observed','late','closed')),
  observation TEXT,
  created_by UUID REFERENCES users_app(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ============================================================
-- 8. DOCUMENTOS DE DESPACHO
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatch_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES dispatches(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('pack_list','pata_pata_photo','thermograph_photo','thermograph_temp','backup','other','guia_despacho','proforma','factura','abonos_adelantos','pagos_liquidaciones','calidad_destino')),
  original_file_name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT,
  uploaded_by UUID REFERENCES users_app(id),
  version_number INT NOT NULL DEFAULT 1,
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','validated','observed')),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending','validated','observed')),
  validated_by UUID REFERENCES users_app(id),
  validated_at TIMESTAMPTZ,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. REGLAS DE PALABRAS CLAVE (configurables por Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS keyword_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL CHECK (module IN ('lots','temperatures','dispatches')),
  document_type TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. AUDITORÍA
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users_app(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. CONFIGURACIÓN DE LA APP
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(overall_status);
CREATE INDEX IF NOT EXISTS idx_lots_created_at ON lots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lot_documents_lot_id ON lot_documents(lot_id);
CREATE INDEX IF NOT EXISTS idx_temperature_reports_date ON temperature_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(overall_status);
CREATE INDEX IF NOT EXISTS idx_dispatch_documents_dispatch_id ON dispatch_documents(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_app_updated_at
  BEFORE UPDATE ON users_app
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lots_updated_at
  BEFORE UPDATE ON lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_temperature_reports_updated_at
  BEFORE UPDATE ON temperature_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispatches_updated_at
  BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_keyword_rules_updated_at
  BEFORE UPDATE ON keyword_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DATOS INICIALES: Palabras clave por defecto
-- ============================================================
INSERT INTO keyword_rules (module, document_type, keywords) VALUES
  ('lots', 'reception', '["recepcion","recepción","ingreso","informe recepcion","informe recepción"]'),
  ('lots', 'quality', '["calidad","control calidad","informe calidad","cc"]'),
  ('lots', 'process', '["proceso","informe proceso","cuadratura","reporte proceso"]'),
  ('temperatures', 'daily_report', '["temperatura","temp","control temperatura","reporte temperatura"]'),
  ('dispatches', 'pack_list', '["pack list","packlist","lista de empaque","pl"]'),
  ('dispatches', 'pata_pata_photo', '["pata a pata","pata-pata","foto pallet","pallet"]'),
  ('dispatches', 'thermograph_photo', '["termografo","termógrafo","thermograph","foto termo"]')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DATOS INICIALES: Configuración de la app
-- ============================================================
INSERT INTO app_settings (key, value) VALUES
  ('season', '2026'),
  ('reception_deadline_hours', '24'),
  ('quality_deadline_hours', '24'),
  ('process_deadline_days', '7'),
  ('min_pata_pata_photos', '11'),
  ('min_thermograph_photos', '2'),
  ('max_file_size_mb', '50'),
  ('image_compress_threshold_mb', '3')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- USUARIO ADMIN INICIAL
-- IMPORTANTE: Cambia la contraseña después del primer login
-- Hash generado con bcrypt rounds=12 para password: "admin2026"
-- Genera uno nuevo en: https://bcrypt-generator.com/
-- ============================================================
-- INSERT INTO users_app (username, display_name, role, password_hash, active, can_validate)
-- VALUES (
--   'admin',
--   'Administrador',
--   'admin',
--   '$2b$12$REEMPLAZA_ESTE_HASH_POR_UNO_REAL',
--   true,
--   true
-- );

-- ============================================================
-- NOTA FINAL:
-- Para crear el hash bcrypt del admin, ejecuta en Node.js:
-- const bcrypt = require('bcryptjs')
-- console.log(bcrypt.hashSync('tu_contraseña_aqui', 12))
-- Luego descomenta y ejecuta el INSERT de arriba.
-- ============================================================
