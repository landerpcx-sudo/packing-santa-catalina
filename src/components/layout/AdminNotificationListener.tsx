'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/layout/Toast'
import { supabase } from '@/lib/supabase'

export default function AdminNotificationListener() {
  const { user } = useAuth()
  const toast = useToast()
  
  // Referencias para evitar procesar registros duplicados
  const lastCheckedRef = useRef<string | null>(null)
  
  // Mapa de cooldowns para evitar spam (pata a pata)
  const lastNotificationTimesRef = useRef<Record<string, number>>({})

  useEffect(() => {
    // Solo activar si el usuario actual es Administrador
    if (!user || user.role !== 'admin') {
      console.log('ℹ️ [AdminNotificationListener] Omitido: El usuario actual no es Administrador o la sesión no ha cargado.')
      return
    }

    const adminUserId = user.userId || (user as any).id // UUID del administrador Lander
    console.log(`🛠️ [AdminNotificationListener] Inicializado para Administrador: ${user.displayName} | ID: ${adminUserId}`)

    // Inicializar la hora de partida con la hora actual menos 10 segundos de gracia
    if (!lastCheckedRef.current) {
      const tenSecsAgo = new Date(Date.now() - 10000)
      lastCheckedRef.current = tenSecsAgo.toISOString()
      console.log(`⏱️ [AdminNotificationListener] Hora de referencia inicial establecida a: ${lastCheckedRef.current}`)
    }

    // --- FUNCIÓN CENTRAL: PROCESAR UN LOG DE AUDITORÍA ---
    const procesarLog = async (log: any) => {
      try {
        const details = log.details || {}
        const docType = details.document_type || ''
        const action = log.action

        // 1. Validar que sea una acción de subida de archivos
        const isUploadAction = [
          'UPLOAD_DOCUMENT',
          'UPLOAD_DISPATCH_DOCUMENT',
          'UPLOAD_TEMPERATURE_DOCUMENT',
          'UPLOAD_CLIENT_DOCUMENT'
        ].includes(action)

        if (!isUploadAction) return

        // 2. Validar que la acción no la haya realizado el propio Administrador
        const logUserId = log.user_id
        if (logUserId === adminUserId) {
          console.log(`👤 [AdminNotificationListener] Log ${log.id} omitido (acción realizada por ti mismo).`)
          return
        }

        // 3. Obtener dinámicamente el nombre del usuario si no viene pre-cargado (caso de Supabase Realtime)
        let userName = log.user?.display_name || log.user?.username || 'Un colaborador'
        if (logUserId && (!log.user || !log.user.display_name)) {
          const { data: uData } = await supabase
            .from('users_app')
            .select('display_name, username')
            .eq('id', logUserId)
            .single()
          if (uData) {
            userName = uData.display_name || uData.username
          }
        }

        // 4. Determinar etiqueta de informe amigable
        let docLabel = 'un archivo'
        if (docType === 'pata_pata_photo') docLabel = 'fotos Pata a Pata'
        else if (docType === 'thermograph_photo') docLabel = 'fotos de Termógrafos'
        else if (docType === 'pack_list') docLabel = 'el Packing List'
        else if (docType === 'reception') docLabel = 'el informe de Recepción'
        else if (docType === 'quality') docLabel = 'el informe de Calidad'
        else if (docType === 'process') docLabel = 'el informe de Proceso'
        else if (docType === 'daily_report') docLabel = 'el reporte de Temperaturas'
        else if (docType === 'backup') docLabel = 'un documento de Respaldo'

        // 5. Generar el mensaje de alerta
        let message = ''
        if (action === 'UPLOAD_DISPATCH_DOCUMENT') {
          message = `📢 ${userName} está subiendo ${docLabel} en el Despacho.`
        } else if (action === 'UPLOAD_DOCUMENT') {
          message = `📢 ${userName} está subiendo ${docLabel} en el Lote.`
        } else if (action === 'UPLOAD_TEMPERATURE_DOCUMENT') {
          message = `📢 ${userName} está subiendo ${docLabel}.`
        } else if (action === 'UPLOAD_CLIENT_DOCUMENT') {
          message = `📢 ${userName} está subiendo un documento de Cliente.`
        }

        if (!message) return

        // 6. Cooldown Inteligente (3 minutos = 180,000 ms) para evitar spam
        const contextId = details.dispatch_id || details.lot_id || details.temperature_report_id || 'general'
        const cooldownKey = `cooldown::${logUserId || 'user'}::${action}::${contextId}`
        
        const now = Date.now()
        const lastNotifyTime = lastNotificationTimesRef.current[cooldownKey] || 0
        
        if (now - lastNotifyTime < 180000) {
          console.log(`⏳ [AdminNotificationListener] Notificación omitida por Cooldown activo (${Math.round((180000 - (now - lastNotifyTime)) / 1000)}s restantes) para: ${cooldownKey}`)
          return
        }

        // Activar el Cooldown
        lastNotificationTimesRef.current[cooldownKey] = now
        console.log(`🔔 [AdminNotificationListener] Disparando alerta en pantalla: "${message}"`)

        // Mostrar alerta Toast en pantalla
        toast.info(message, 6000)

        // Actualizar referencia de fecha
        const logTime = new Date(log.created_at).getTime()
        const currentNewestTime = lastCheckedRef.current ? new Date(lastCheckedRef.current).getTime() : 0
        if (logTime > currentNewestTime) {
          lastCheckedRef.current = log.created_at
        }
      } catch (err) {
        console.error('Error al procesar log de auditoría:', err)
      }
    }

    // --- CONEXIÓN A: SUPABASE REALTIME (WebSockets) - Consumo Cero Vercel ---
    console.log('🔌 [AdminNotificationListener] Conectando al canal WebSocket de Supabase Realtime...')
    
    const channel = supabase
      .channel('public:audit_log')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_log',
        },
        (payload) => {
          console.log('📡 [AdminNotificationListener] Evento Realtime recibido desde Supabase:', payload.new)
          procesarLog(payload.new)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ [AdminNotificationListener] Conectado exitosamente y escuchando a Supabase Realtime.')
        } else {
          console.log(`⚠️ [AdminNotificationListener] Estatus del canal Realtime: ${status}`)
        }
      })

    // --- CONEXIÓN B: FALLBACK DE POLLING DE BAJA FRECUENCIA (60 segundos) ---
    // Funciona como redundancia a prueba de fallas si el WebSocket se desconecta o no tiene replicación
    const checkAuditoriasFallback = async () => {
      // Evitar consultar si la pestaña del navegador está en segundo plano (ahorro masivo de cuotas)
      if (document.hidden) {
        console.log('💤 [AdminNotificationListener] Polling omitido (pestaña en segundo plano).')
        return
      }

      console.log('⏱️ [AdminNotificationListener] Ejecutando polling de seguridad (60s)...')
      try {
        const res = await fetch('/api/auditoria?limit=10')
        if (!res.ok) return
        
        const json = await res.json()
        const logs = json.data || []
        
        if (logs.length === 0) return

        // Procesar en orden cronológico real
        const pendingLogs = logs
          .filter((log: any) => {
            const logTime = new Date(log.created_at).getTime()
            const lastTime = lastCheckedRef.current ? new Date(lastCheckedRef.current).getTime() : 0
            return logTime > lastTime
          })
          .reverse()

        for (const log of pendingLogs) {
          await procesarLog(log)
        }
      } catch (err) {
        console.error('Error en polling de fallback de auditoría:', err)
      }
    }

    // Configurar intervalo de fallback cada 60 segundos
    const fallbackInterval = setInterval(checkAuditoriasFallback, 60000)

    // Escuchar el evento de visibilidad para disparar un chequeo al poner la pestaña en primer plano
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('☀️ [AdminNotificationListener] Pestaña visible de nuevo. Sincronizando logs...')
        checkAuditoriasFallback()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      console.log('🔌 [AdminNotificationListener] Desconectando listeners e intervalos...')
      supabase.removeChannel(channel)
      clearInterval(fallbackInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, toast])

  return null
}
