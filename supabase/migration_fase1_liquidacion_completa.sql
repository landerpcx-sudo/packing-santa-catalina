-- ═════════════════════════════════════════════════════════════════════════════
-- FASE 1 — DATOS QUE FALTABAN EN LA LIQUIDACIÓN
-- Ejecutar UNA VEZ en el editor SQL de Supabase (después de la Fase 0).
--
-- La pantalla de liquidación maneja moneda de destino, moneda de la factura FOB
-- y su equivalencia, pero ninguno de esos tres datos se estaba guardando: al
-- recargar la página volvían a sus valores por defecto, y el informe financiero
-- generado en el servidor no podía reproducir lo que se ve en pantalla.
--
-- Solo AGREGA columnas. No borra ni modifica nada existente.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS target_currency     TEXT;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS fob_currency        TEXT;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS fob_exchange_rate   NUMERIC(14,4);
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS abonos_amount       NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS rate_provider_info  TEXT;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS rate_date           DATE;

-- Valores por defecto coherentes con lo que la pantalla asumía hasta hoy,
-- solo para las liquidaciones que ya existen.
UPDATE dispatch_liquidations
   SET target_currency   = COALESCE(target_currency, 'USD'),
       fob_currency      = COALESCE(fob_currency, 'CLP'),
       fob_exchange_rate = COALESCE(fob_exchange_rate, 1000)
 WHERE target_currency IS NULL
    OR fob_currency IS NULL
    OR fob_exchange_rate IS NULL;

-- Verificación:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'dispatch_liquidations'
--    AND column_name IN ('target_currency','fob_currency','fob_exchange_rate','abonos_amount','rate_provider_info','rate_date');
