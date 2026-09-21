-- ============================================================
-- FASE 3: TASAS DE CAMBIO REALES Y MODELO MULTI-MONEDA (USD + CLP + DESTINO)
-- ============================================================

ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS usd_exchange_rate NUMERIC(14,4);

-- Comentario descriptivo:
-- exchange_rate: Tasa oficial de la Moneda Destino a CLP (ej: 1 EUR = 1099.86 CLP)
-- usd_exchange_rate: Tasa oficial del Dólar Observado a CLP (ej: 1 USD = 958.42 CLP)
-- rate_date: Fecha oficial de fijación de la tasa de cambio
-- rate_provider_info: Proveedor de la tasa (ej: Banco Central de Chile / mindicador)
