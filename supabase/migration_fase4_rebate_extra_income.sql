-- ============================================================================
-- MIGRACIÓN: REBATE NAVIERA E INGRESO EXTRAORDINARIO / COMPENSACIÓN COMERCIAL
-- ============================================================================

ALTER TABLE dispatch_liquidations 
ADD COLUMN IF NOT EXISTS naviera_rebate_amount NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS naviera_rebate_currency VARCHAR(10) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS naviera_rebate_clp NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_income_amount NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_income_currency VARCHAR(10) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS extra_income_clp NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_income_notes TEXT DEFAULT NULL;
