import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = (searchParams.get('from') || 'EUR').toUpperCase()
    const to = (searchParams.get('to') || 'USD').toUpperCase()
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    if (from === to) {
      return NextResponse.json({
        success: true,
        rate: 1,
        from,
        to,
        date,
        provider: 'Misma Moneda'
      })
    }

    let rate: number | null = null
    let provider = ''

    // 1. Intentar consultar Frankfurter (ideal para tasas históricas oficiales)
    try {
      const frankfurterUrl = `https://api.frankfurter.app/${date}?from=${from}&to=${to}`
      const res = await fetch(frankfurterUrl, { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json()
        if (data.rates && data.rates[to]) {
          rate = data.rates[to]
          provider = `Frankfurter API (${data.date || date})`
        }
      }
    } catch (e) {
      console.warn('Frankfurter API fetch failed, trying fallback:', e)
    }

    // 2. Si falló Frankfurter o si la moneda involucra CLP u otras secundarias, probar open.er-api.com
    if (!rate) {
      try {
        const erUrl = `https://open.er-api.com/v6/latest/${from}`
        const res = await fetch(erUrl, { next: { revalidate: 3600 } })
        if (res.ok) {
          const data = await res.json()
          if (data.rates && data.rates[to]) {
            rate = data.rates[to]
            provider = 'Open Exchange Rates'
          }
        }
      } catch (e) {
        console.warn('Open ER API fetch failed:', e)
      }
    }

    // 3. Soporte especial para CLP (Peso Chileno) si se solicita USD->CLP o EUR->CLP mediante mindicador.cl
    if (!rate && (to === 'CLP' || from === 'CLP')) {
      try {
        // mindicador fecha formato DD-MM-YYYY
        const [y, m, d] = date.split('-')
        const formattedDate = `${d}-${m}-${y}`
        const indicator = from === 'EUR' || to === 'EUR' ? 'euro' : 'dolar'
        const clpRes = await fetch(`https://mindicador.cl/api/${indicator}/${formattedDate}`)
        if (clpRes.ok) {
          const clpData = await clpRes.json()
          if (clpData.serie && clpData.serie.length > 0) {
            const val = clpData.serie[0].valor
            rate = from === 'CLP' ? 1 / val : val
            provider = `Banco Central de Chile (mindicador.cl ${formattedDate})`
          }
        }
      } catch (e) {
        console.warn('Mindicador fetch failed:', e)
      }
    }

    if (!rate) {
      return NextResponse.json(
        { error: `No se pudo obtener el tipo de cambio entre ${from} y ${to} para la fecha ${date}.` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      rate: Math.round(rate * 10000) / 10000,
      from,
      to,
      date,
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
