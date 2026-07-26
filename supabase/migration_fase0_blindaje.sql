-- ═════════════════════════════════════════════════════════════════════════════
-- FASE 0 — BLINDAJE DE DOCUMENTOS
-- Ejecutar UNA VEZ en el editor SQL de Supabase.
--
-- REGLA DE ORO: ningún documento ya subido se pierde.
-- Esta migración NO borra nada, NO renombra nada y NO mueve archivos.
-- Solo AGREGA columnas y funciones de apoyo.
-- Es segura de ejecutar varias veces (todo usa IF NOT EXISTS / OR REPLACE).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PAPELERA DE 30 DÍAS
--
-- Eliminar un documento deja de borrarlo: lo marca con deleted_at y lo esconde
-- de los listados. El archivo físico sigue intacto en Supabase Storage y en
-- Google Drive hasta que un administrador lo purgue a conciencia desde la
-- papelera, o pasen 30 días.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE lot_documents         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE lot_documents         ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE dispatch_documents    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE dispatch_documents    ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE temperature_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE temperature_documents ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- client_documents puede no existir en instalaciones antiguas: se protege.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'client_documents') THEN
    ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS deleted_by UUID;
  END IF;
END $$;

-- Índices parciales: los listados normales solo miran documentos vivos.
CREATE INDEX IF NOT EXISTS idx_lot_docs_vivos
  ON lot_documents (lot_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dispatch_docs_vivos
  ON dispatch_documents (dispatch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_temp_docs_vivos
  ON temperature_documents (temperature_report_id) WHERE deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INVENTARIO REAL DEL BUCKET
--
-- Devuelve todos los objetos del bucket 'documentos' con su tamaño exacto.
-- Lo usan dos cosas:
--   a) La limpieza de almacenamiento, para descontar el tamaño REAL de cada
--      archivo que borra (antes no lo hacía y por eso podía purgarlo todo).
--   b) El rescate de huérfanos, para detectar archivos que están guardados
--      pero no tienen registro en la base de datos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_storage_objects()
RETURNS TABLE (path text, size_bytes bigint, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = storage, public
AS $$
  SELECT
    o.name::text                                   AS path,
    COALESCE((o.metadata->>'size')::bigint, 0)     AS size_bytes,
    o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'documentos'
  ORDER BY o.created_at ASC;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TAMAÑO DE ARCHIVOS CONCRETOS
--
-- Igual que la anterior pero acotada a una lista de rutas: la limpieza la usa
-- para saber cuánto espacio libera realmente cada borrado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_object_sizes(paths text[])
RETURNS TABLE (path text, size_bytes bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = storage, public
AS $$
  SELECT
    o.name::text                                AS path,
    COALESCE((o.metadata->>'size')::bigint, 0)  AS size_bytes
  FROM storage.objects o
  WHERE o.bucket_id = 'documentos'
    AND o.name = ANY(paths);
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────────

-- Debe devolver 6 filas (deleted_at / deleted_by en las 3 tablas principales):
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE column_name IN ('deleted_at','deleted_by')
--    AND table_name LIKE '%_documents' ORDER BY table_name;

-- Debe devolver el inventario del bucket:
-- SELECT count(*), pg_size_pretty(SUM(size_bytes)) FROM public.list_storage_objects();
