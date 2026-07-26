// ─────────────────────────────────────────────────────────────────────────────
// Vista previa del informe financiero del contenedor, con cifras inventadas.
//
// Para qué sirve: ver el PDF de verdad tras tocar el diseño, sin necesidad de
// base de datos, sesión iniciada ni un despacho real con liquidación cargada.
// Un cambio de diseño de este documento no debería darse por bueno sin abrir
// el archivo que sale de aquí.
//
// Cómo se usa (desde la carpeta `app/`):
//
//   npx tsc src/lib/informe-financiero-pdf.ts --outDir scratch/build \
//     --module esnext --target es2022 --moduleResolution bundler \
//     --skipLibCheck --esModuleInterop
//   node scripts/previsualizar-informe-financiero.mjs
//
// Genera `scratch/informe-prueba.pdf` (caso normal) y un archivo por cada caso
// límite: contenedor en pérdida, liquidación vacía y muchos calibres. Conviene
// mirarlos todos: los tres han roto el diseño alguna vez.
// ─────────────────────────────────────────────────────────────────────────────
import { construirInformeFinancieroPDF } from '../scratch/build/informe-financiero-pdf.js'
import fs from 'fs'

const despacho = {
  id: '00000000-0000-0000-0000-000000000001',
  dispatch_code: 'DES-089',
  internal_code: 'INT-089',
  client: 'THE GROWERS CLUB',
  destination: 'Rotterdam, Países Bajos',
  container_number: 'MSCU-774512-3',
  dispatch_date: '2026-05-14',
}

const calibres = [
  ['LEMONS BLANCA (LE16) 15 KG', '95', 1120, 14.9],
  ['LEMONS BLANCA (LE16) 15 KG', '113', 980, 13.4],
  ['LEMONS BLANCA (LE16) 15 KG', '138', 860, 12.1],
  ['LEMONS VERDE (LE18) 15 KG', '162', 640, 10.2],
  ['LEMONS VERDE (LE18) 15 KG', '189', 410, 8.6],
  ['LEMONS VERDE (LE18) 15 KG', '216', 250, 6.9],
]

const item = (envase, calibre, cajas, precio, i) => ({
  id: `it-${i}`, envase, calibre, cajas, price_per_box: precio,
  subtotal: Math.round(cajas * precio * 100) / 100,
})

const liquidacion = (items, extra = {}) => {
  const gross = items.reduce((a, r) => a + r.subtotal, 0)
  const comision = Math.round(gross * 0.1 * 100) / 100
  const gastos = { flete: 8200, handling: 1450, frio: 980, surveyor: 340, transporte: 1260, otros: 520 }
  const totalGastos = Math.round((comision + Object.values(gastos).reduce((a, b) => a + b, 0)) * 100) / 100
  const neto = Math.round((gross - totalGastos) * 100) / 100
  return {
    id: 'liq-prueba', dispatch_id: despacho.id, status: 'finalized',
    currency: 'EUR', target_currency: 'USD', fob_currency: 'CLP',
    gross_sales: gross, commission_percentage: 10, commission_amount: comision,
    freight_amount: gastos.flete, handling_amount: gastos.handling,
    cold_storage_amount: gastos.frio, surveyor_amount: gastos.surveyor,
    transport_amount: gastos.transporte, other_expenses: gastos.otros,
    total_expenses: totalGastos, net_amount: neto,
    exchange_rate: 1.08, fob_exchange_rate: 1050,
    rate_provider_info: 'Fuente: BCE (2026-05-20)', rate_date: '2026-05-20',
    items, ...extra,
  }
}

const itemsNormales = calibres.map(([e, c, n, p], i) => item(e, c, n, p, i))
const netoNormal = liquidacion(itemsNormales).net_amount

const casos = {
  'informe-prueba': liquidacion(itemsNormales, {
    advance_amount: 18500000, abonos_amount: 12000000,
    final_balance: Math.round((netoNormal - 18500000 / 1050) * 100) / 100,
  }),
  // El contenedor pierde plata: la cascada debe bajar por debajo de la línea
  // del cero y las tarjetas ponerse en rojo.
  'limite-perdida': liquidacion([item('CAJA 15 KG', '120', 500, 5, 0)], {
    status: 'draft', advance_amount: 9000000, abonos_amount: 0, final_balance: -7375,
  }),
  // Liquidación recién creada, sin packlist cargado: ninguna división por cero.
  'limite-sin-items': liquidacion([], { status: 'draft', advance_amount: 0, abonos_amount: 0, final_balance: 0 }),
  // Muchos calibres: comprueba el salto de página de la tabla del ranking y
  // que la matriz 2x2 no se desborde.
  'limite-muchos-calibres': liquidacion(
    Array.from({ length: 34 }, (_, i) =>
      item(`EMBALAJE MUY LARGO DE PRUEBA (LE${i}) 15 KG`, `${80 + i * 4}`, 400 - i * 8, 14 - i * 0.3, i)),
    { advance_amount: 4000000, abonos_amount: 1000000, final_balance: 1500 }
  ),
}

fs.mkdirSync('scratch', { recursive: true })
for (const [nombre, liq] of Object.entries(casos)) {
  const pdf = await construirInformeFinancieroPDF(despacho, liq)
  const salida = `scratch/${nombre}.pdf`
  fs.writeFileSync(salida, pdf)
  console.log(`${salida.padEnd(38)} ${(pdf.length / 1024).toFixed(0)} KB`)
}
console.log('\nAbre los PDF y revísalos antes de dar por bueno un cambio de diseño.')
