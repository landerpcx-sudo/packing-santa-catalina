-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones de apoyo para la limpieza de almacenamiento (src/lib/storage-cleanup.ts)
--
-- IMPORTANTE: ejecuta este archivo UNA VEZ en el editor SQL de Supabase.
-- Sin estas funciones, cleanupStorage() sale sin borrar nada (devuelve el aviso
-- "RPC get_storage_usage_mb no encontrado").
--
-- Modelo: Google Drive es la base PERMANENTE. Supabase Storage es respaldo/staging.
-- La limpieza solo purga archivos YA confirmados en Drive y solo al acercarse al
-- límite del plan (umbral configurado en storage-cleanup.ts: 50 GB → 40 GB).
-- ─────────────────────────────────────────────────────────────────────────────

-- Devuelve el tamaño total (en MB) ocupado por el bucket 'documentos'.
-- Suma el campo 'size' (bytes) de los metadatos de cada objeto en storage.objects.
CREATE OR REPLACE FUNCTION public.get_storage_usage_mb()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = storage, public
AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)::numeric / (1024 * 1024)
  FROM storage.objects
  WHERE bucket_id = 'documentos';
$$;

-- Conserva los 'max_logs' registros más recientes de audit_log y borra el resto.
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(max_logs integer DEFAULT 999)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH to_keep AS (
    SELECT id
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT max_logs
  )
  DELETE FROM audit_log
  WHERE id NOT IN (SELECT id FROM to_keep);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
