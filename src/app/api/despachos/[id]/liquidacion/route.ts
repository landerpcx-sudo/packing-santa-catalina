import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dispatchId } = await params

    // 1. Cargar la liquidación existente si la hay
    const { data: liquidation, error: liqErr } = await supabaseAdmin
      .from('dispatch_liquidations')
      .select('*, items:dispatch_liquidation_items(*)')
      .eq('dispatch_id', dispatchId)
      .maybeSingle()

    if (liqErr) {
      console.error('Error al obtener liquidación:', liqErr)
    }

    // 2. Cargar los ítems del packlist extraídos
    const { data: packlistItems, error: packErr } = await supabaseAdmin
      .from('dispatch_packlist_items')
      .select('*')
      .eq('dispatch_id', dispatchId)
      .order('envase', { ascending: true })
      .order('calibre', { ascending: true })

    // 3. Cargar metadatos del despacho
    const { data: dispatchData } = await supabaseAdmin
      .from('dispatches')
      .select('id, dispatch_code, client, destination, container_number, dispatch_date, invoice_amount, advance_amount')
      .eq('id', dispatchId)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      liquidation: liquidation || null,
      packlistItems: packlistItems || [],
      dispatch: dispatchData || null
    })
  } catch (err: any) {
    console.error('Error en GET /api/despachos/[id]/liquidacion:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al cargar la liquidación.' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dispatchId } = await params
    const body = await req.json()

    const {
      currency = 'USD',
      gross_sales = 0,
      commission_percentage = 10,
      commission_amount = 0,
      freight_amount = 0,
      handling_amount = 0,
      cold_storage_amount = 0,
      surveyor_amount = 0,
      transport_amount = 0,
      other_expenses = 0,
      total_expenses = 0,
      net_amount = 0,
      advance_amount = 0,
      exchange_rate = 1,
      final_balance = 0,
      status = 'draft',
      items = [],
      user_id = null,
      // Datos que la pantalla manejaba pero no se guardaban: sin ellos, al
      // recargar se perdían y el informe del servidor no podía reproducirlos.
      target_currency = 'USD',
      fob_currency = 'CLP',
      fob_exchange_rate = 1000,
      abonos_amount = 0,
      rate_provider_info = null,
      rate_date = null
    } = body

    // 1. Crear o actualizar el encabezado de la liquidación
    const liquidationPayload = {
      dispatch_id: dispatchId,
      currency,
      gross_sales,
      commission_percentage,
      commission_amount,
      freight_amount,
      handling_amount,
      cold_storage_amount,
      surveyor_amount,
      transport_amount,
      other_expenses,
      total_expenses,
      net_amount,
      advance_amount,
      exchange_rate,
      final_balance,
      status,
      target_currency,
      fob_currency,
      fob_exchange_rate,
      abonos_amount,
      rate_provider_info,
      rate_date: rate_date || null,
      created_by: user_id,
      updated_at: new Date().toISOString()
    }

    const { data: savedLiquidation, error: saveErr } = await supabaseAdmin
      .from('dispatch_liquidations')
      .upsert(liquidationPayload, { onConflict: 'dispatch_id' })
      .select('*')
      .single()

    if (saveErr || !savedLiquidation) {
      console.error('Error guardando dispatch_liquidations:', saveErr)
      return NextResponse.json(
        { error: 'Error al guardar el encabezado de la liquidación.' },
        { status: 500 }
      )
    }

    // 2. Guardar los ítems de liquidación (Precios por caja)
    if (Array.isArray(items)) {
      // Eliminar detalles previos de esta liquidación
      await supabaseAdmin
        .from('dispatch_liquidation_items')
        .delete()
        .eq('liquidation_id', savedLiquidation.id)

      if (items.length > 0) {
        const itemRows = items.map((it: any) => ({
          liquidation_id: savedLiquidation.id,
          packlist_item_id: it.packlist_item_id || null,
          envase: it.envase,
          calibre: it.calibre,
          cajas: Number(it.cajas) || 0,
          price_per_box: Number(it.price_per_box) || 0,
          subtotal: Number(it.subtotal) || (Number(it.cajas) * Number(it.price_per_box)) || 0
        }))

        const { error: itemsErr } = await supabaseAdmin
          .from('dispatch_liquidation_items')
          .insert(itemRows)

        if (itemsErr) {
          console.error('Error insertando dispatch_liquidation_items:', itemsErr)
        }
      }
    }

    // 3. Si la liquidación es finalizada, actualizar los montos financieros en el despacho
    if (status === 'finalized') {
      await supabaseAdmin
        .from('dispatches')
        .update({
          invoice_amount: gross_sales,
          advance_amount: advance_amount,
          payment_status: final_balance <= 0 ? 'paid' : 'pending'
        })
        .eq('id', dispatchId)
    }

    // 4. Auditoría — la tabla es 'audit_log' (singular). Estaba escrita como
    // 'audit_logs' y, al no comprobarse el error, ninguna liquidación quedaba
    // registrada en el historial.
    await supabaseAdmin.from('audit_log').insert({
      user_id: user_id || null,
      action: status === 'finalized' ? 'FINALIZE_LIQUIDATION' : 'SAVE_LIQUIDATION',
      entity_type: 'dispatch',
      entity_id: dispatchId,
      details: { gross_sales, net_amount, final_balance, currency }
    })

    return NextResponse.json({
      success: true,
      message: 'Liquidación guardada correctamente.',
      liquidation: savedLiquidation
    })
  } catch (err: any) {
    console.error('Error en POST /api/despachos/[id]/liquidacion:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al guardar la liquidación.' },
      { status: 500 }
    )
  }
}
