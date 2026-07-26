-- ═════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: ROL CLIENTE Y VÍNCULO A EMPRESA CLIENTE
-- Ejecutar en el Editor SQL de Supabase
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Agregar columna client_name a la tabla users_app
ALTER TABLE users_app ADD COLUMN IF NOT EXISTS client_name TEXT;

-- 2. Eliminar el constraint de rol anterior si existe y agregar el nuevo que incluye 'cliente'
DO $$
BEGIN
  -- Intentar borrar el constraint existente
  ALTER TABLE users_app DROP CONSTRAINT IF EXISTS users_app_role_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 3. Crear el nuevo constraint con todos los roles actualizados
ALTER TABLE users_app 
  ADD CONSTRAINT users_app_role_check 
  CHECK (role IN ('admin','jefe_frio','calidad','cuadratura','sag','despacho','gerencia','agronomo','cliente'));
