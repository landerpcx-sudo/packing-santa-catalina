import { NextRequest, NextResponse } from 'next/server'

// Función auxiliar para consultar mindicador.cl con retroceso automático si es fin de semana o festivo
async function getMindicadorRateWithFallback(indicator: 'dolar' | 'euro', targetDateStr: string) {
  const today = new Date()
  let target = new Date(targetDateStr + 'T12:00:00Z')
  
  // Si la fecha solicitada es futura, fijar target a la fecha de hoy
  if (target.getTime() > today.getTime()) {
    target = new Date(today.toISOString().split('T')[0] + 'T12:00:00Z')
  }

  // Buscar hasta 7 días hacia atrás buscando el último día hábil con publicación oficial
  for (let i = 0; i < 7; i++) {
    const y = target.getUTCFullYear()
    const m = String(target.getUTCMonth() + 1).padStart(2, '0')
    const d = String(target.getUTCDate()).padStart(2, '0')
    const formattedDate = `${d}-${m}-${y}`
    const appliedIso = `${y}-${m}-${d}`

    try {
      const res = await fetch(`https://mindicador.cl/api/${indicator}/${formattedDate}`, {
        next: { revalidate: 1800 }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.serie && data.serie.length > 0 && typeof data.serie[0].valor === 'number') {
          return {
            valor: Number(data.serie[0].valor),
            appliedDate: appliedIso,
            daysBack: i
          }
        }
      }
    } catch (err) {
      console.warn(`Error consultando mindicador.cl para ${indicator} en ${formattedDate}:`, err)
    }

    target.setUTCDate(target.getUTCDate() - 1)
  }

  // Si falló por fecha puntual, intentar la serie general de los últimos 30 días
  try {
    const resGeneral = await fetch(`https://mindicador.cl/api/${indicator}`, {
      next: { revalidate: 1800 }
    })
    if (resGeneral.ok) {
      const genData = await resGeneral.json()
      if (genData.serie && genData.serie.length > 0 && typeof genData.serie[0].valor === 'number') {
        const item = genData.serie[0]
        const appDate = item.fecha ? String(item.fecha).split('T')[0] : targetDateStr
        return {
          valor: Number(item.valor),
          appliedDate: appDate,
          daysBack: 0
        }
      }
    }
  } catch (err) {
    console.warn(`Error consultando mindicador.cl serie general para ${indicator}:`, err)
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = (searchParams.get('from') || 'EUR').toUpperCase()
    const rawDate = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const date = rawDate.split('T')[0]

    let usdClpRate: number | null = null
    let destClpRate: number | null = null
    let appliedDate = date
    let provider = ''

    // 1. Caso base: La moneda solicitada es CLP
    if (from === 'CLP') {
      const usdRes = await getMindicadorRateWithFallback('dolar', date)
      usdClpRate = usdRes?.valor || 950
      return NextResponse.json({
        success: true,
        currency: 'CLP',
        dest_clp_rate: 1,
        usd_clp_rate: Math.round(usdClpRate * 100) / 100,
        dest_usd_rate: Math.round((1 / usdClpRate) * 10000) / 10000,
        rate: 1,
        requested_date: date,
        applied_date: usdRes?.appliedDate || date,
        provider: 'Banco Central de Chile'
      })
    }

    // 2. Obtener Dólar Observado (USD -> CLP) siempre como referencia obligatoria
    const usdRes = await getMindicadorRateWithFallback('dolar', date)
    if (usdRes) {
      usdClpRate = usdRes.valor
      appliedDate = usdRes.appliedDate
      provider = `Banco Central de Chile (mindicador.cl ${appliedDate})`
    }

    // 3. Obtener Tasa de Destino -> CLP
    if (from === 'USD') {
      destClpRate = usdClpRate
    } else if (from === 'EUR') {
      const euroRes = await getMindicadorRateWithFallback('euro', date)
      if (euroRes) {
        destClpRate = euroRes.valor
        appliedDate = euroRes.appliedDate
        provider = `Banco Central de Chile (mindicador.cl ${appliedDate})`
      }
    }

    // 4. Fallback secundario mediante Open Exchange Rates si mindicador no respondió
    if (!usdClpRate || !destClpRate) {
      try {
        const erRes = await fetch(`https://open.er-api.com/v6/latest/USD`, { next: { revalidate: 3600 } })
        if (erRes.ok) {
          const erData = await erRes.json()
          const clpPerUsd = erData.rates?.CLP
          if (clpPerUsd) {
            if (!usdClpRate) usdClpRate = Number(clpPerUsd)
            if (from === 'USD') {
              destClpRate = usdClpRate
            } else if (erData.rates && erData.rates[from]) {
              // 1 USD = X Destino => 1 Destino = (CLP per USD) / (Destino per USD)
              const destPerUsd = Number(erData.rates[from])
              if (destPerUsd > 0) {
                destClpRate = Number(clpPerUsd) / destPerUsd
              }
            }
            provider = 'Open Exchange Rates (Mercado Internacional)'
          }
        }
      } catch (err) {
        console.warn('Fallback Open ER falló:', err)
      }
    }

    // 5. Fallback terciario mediante Frankfurter (Banco Central Europeo) para EUR/USD
    if ((!usdClpRate || !destClpRate) && from === 'EUR') {
      try {
        const fRes = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=USD`)
        if (fRes.ok) {
          const fData = await fRes.json()
          if (fData.rates?.USD && usdClpRate) {
            destClpRate = usdClpRate * Number(fData.rates.USD)
            provider = `Frankfurter ECB + Dólar Observado`
          }
        }
      } catch (err) {
        console.warn('Fallback Frankfurter falló:', err)
      }
    }

    if (!usdClpRate || !destClpRate) {
      return NextResponse.json(
        {
          error: `No se pudo obtener el tipo de cambio oficial para ${from} al ${date}. Puedes ingresar la tasa manualmente.`,
          success: false
        },
        { status: 404 }
      )
    }

    const roundedDestClp = Math.round(destClpRate * 100) / 100
    const roundedUsdClp = Math.round(usdClpRate * 100) / 100
    const destUsdRate = Math.round((roundedDestClp / roundedUsdClp) * 10000) / 10000

    return NextResponse.json({
      success: true,
      currency: from,
      dest_clp_rate: roundedDestClp,
      usd_clp_rate: roundedUsdClp,
      dest_usd_rate: destUsdRate,
      rate: roundedDestClp, // Compatibilidad con componentes que lean .rate
      requested_date: date,
      applied_date: appliedDate,
      provider
    })
  } catch (err: any) {
    console.error('Error en GET /api/tipo-cambio:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al obtener el tipo de cambio.' },
      { status: 500 }
    )
  }
}
