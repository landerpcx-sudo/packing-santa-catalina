-- Migración para soportar múltiples abonos/adelantos por despacho
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS advance_payments JSONB DEFAULT '[]'::jsonb;

-- Inicializar advance_payments para despachos existentes que ya tengan advance_amount > 0
UPDATE dispatches 
SET advance_payments = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'amount', advance_amount,
    'date', COALESCE(dispatch_date::text, created_at::date::text),
    'note', 'Abono inicial'
  )
)
WHERE (advance_payments IS NULL OR advance_payments = '[]'::jsonb) 
  AND advance_amount > 0;
