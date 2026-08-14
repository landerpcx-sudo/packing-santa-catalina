-- ============================================================
-- FASE 2: ESTADO BILATERAL DE CUENTAS & NOTAS DE CRÉDITO EN DESTINO
-- ============================================================

ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS credit_notes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS destination_payments JSONB DEFAULT '[]'::jsonb;
