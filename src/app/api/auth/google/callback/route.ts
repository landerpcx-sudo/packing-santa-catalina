import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { invalidateDriveClientCache } from '@/lib/drive'

export async function GET(request: Request) {
  console.log('--- GOOGLE CALLBACK INICIADO ---')
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')

  console.log('Parámetros recibidos:', { code: code ? 'SÍ' : 'NO', error: errorParam })

  if (errorParam) {
    return NextResponse.redirect(new URL(`/dashboard?google_error=${encodeURIComponent(errorParam)}`, request.url))
  }

  if (!code) {
    return NextResponse.json({ error: 'No se recibió el código de autorización' }, { status: 400 })
  }

  try {
    console.log('Intercambiando código por tokens...')
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await response.json()
    console.log('Respuesta de Google Tokens:', tokens.error ? `Error: ${tokens.error}` : 'Tokens recibidos correctamente')

    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error)
    }

    // Google devuelve expires_in (segundos), pero google-auth-library refresca
    // proactivamente usando expiry_date (timestamp absoluto en ms). Lo calculamos
    // aquí para que el token se renueve ANTES de expirar y no se "descuelgue"
    // la sincronización con errores 401 esporádicos.
    if (tokens.expires_in && !tokens.expiry_date) {
      tokens.expiry_date = Date.now() + tokens.expires_in * 1000
    }

    // Guardar los tokens en Supabase
    // El refresh_token solo viene la primera vez que autorizas, por eso usamos prompt=consent
    const { error } = await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'google_drive_tokens',
        value: tokens,
        updated_at: new Date().toISOString()
      })

    if (error) throw error

    invalidateDriveClientCache()

    // Redirigir al dashboard con éxito
    return NextResponse.redirect(new URL('/dashboard?google_connected=true', request.url))

  } catch (err: any) {
    console.error('Error en Google Callback:', err)
    return NextResponse.redirect(new URL(`/dashboard?google_error=${encodeURIComponent(err.message)}`, request.url))
  }
}
