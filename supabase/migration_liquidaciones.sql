-- ============================================================
-- MIGRACIÓN DE LIQUIDACIÓN DE CONTENEDOR (DESPACHOS)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de Ítems de Packlist (Extraídos del PDF y agrupados por Envase + Calibre)
CREATE TABLE IF NOT EXISTS dispatch_packlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  especie TEXT,
  variedad TEXT,
  envase TEXT NOT NULL,
  calibre TEXT NOT NULL,
  cajas INTEGER NOT NULL DEFAULT 0,
  peso_neto_unitario NUMERIC(10,2) DEFAULT 0,
  peso_neto_total NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dispatch_envase_calibre UNIQUE (dispatch_id, envase, calibre)
);

-- 2. Tabla Encabezado de Liquidaciones de Despacho
CREATE TABLE IF NOT EXISTS dispatch_liquidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  handling_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  cold_storage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  surveyor_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  transport_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
  final_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_by UUID REFERENCES users_app(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dispatch_liquidation UNIQUE (dispatch_id)
);

-- 3. Tabla Detalle de Liquidaciones (Precios por Caja por Calibre/Envase)
CREATE TABLE IF NOT EXISTS dispatch_liquidation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidation_id UUID NOT NULL REFERENCES dispatch_liquidations(id) ON DELETE CASCADE,
  packlist_item_id UUID REFERENCES dispatch_packlist_items(id) ON DELETE SET NULL,
  envase TEXT NOT NULL,
  calibre TEXT NOT NULL,
  cajas INTEGER NOT NULL DEFAULT 0,
  price_per_box NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_dispatch_packlist_items_dispatch_id ON dispatch_packlist_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_liquidations_dispatch_id ON dispatch_liquidations(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_liquidation_items_liquidation_id ON dispatch_liquidation_items(liquidation_id);

-- Nuevas columnas de Costos de Planta a Puerto (Gastos de Origen)
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS inland_freight NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS customs_brokerage NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS phytosanitary_sag NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS port_expenses_origin NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS inland_insurance NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS other_origin_expenses NUMERIC(14,2) DEFAULT 0;
ALTER TABLE dispatch_liquidations ADD COLUMN IF NOT EXISTS origin_expenses_total NUMERIC(14,2) DEFAULT 0;

