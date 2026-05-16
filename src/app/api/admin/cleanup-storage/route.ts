import { NextResponse } from 'next/server'
import { cleanupStorage } from '@/lib/storage-cleanup'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    // 1. Verificar rol de administrador
    const userId = req.headers.get('x-user-id')
    const userRole = req.headers.get('x-user-role')

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // 2. Ejecutar limpieza
    const result = await cleanupStorage()

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Opcional: Permitir GET para pruebas rápidas desde el navegador (solo en dev o con token)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  
  // Una simple medida de seguridad para pruebas manuales
  if (token !== 'santa-catalina-clean-2026') {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const result = await cleanupStorage()
  return NextResponse.json(result)
}
