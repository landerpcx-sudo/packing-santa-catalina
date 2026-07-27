import { describe, it, expect } from 'vitest'

describe('Packlist Parser & Recálculo Financiero Multi-moneda', () => {
  it('debe calcular correctamente los márgenes dinámicos en moneda de venta', () => {
    const grossSales = 31660.00
    const totalExpenses = 4265.05
    const netAmount = grossSales - totalExpenses // 27394.95 EUR
    const advanceAmountCLP = 21484000 // CLP
    const tasaCLP = 1075.0248

    const fobEnMonedaVenta = advanceAmountCLP / tasaCLP // ~19984.65 EUR
    const finalBalance = netAmount - fobEnMonedaVenta // ~7410.30 EUR

    expect(netAmount).toBeCloseTo(27394.95, 2)
    expect(fobEnMonedaVenta).toBeCloseTo(19984.66, 1)
    expect(finalBalance).toBeCloseTo(7410.30, 1)
  })

  it('debe sanitizar correctamente códigos de despacho con prefijo', () => {
    const sanitizeCode = (raw: string) => {
      const clean = raw.replace(/\D/g, '') || raw.trim()
      return `DES-2026-${clean.padStart(3, '0')}`
    }

    expect(sanitizeCode('89')).toBe('DES-2026-089')
    expect(sanitizeCode('DES-89')).toBe('DES-2026-089')
    expect(sanitizeCode('DES-089')).toBe('DES-2026-089')
    expect(sanitizeCode(' 120 ')).toBe('DES-2026-120')
  })
})
