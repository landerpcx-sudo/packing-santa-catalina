'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/layout/Toast'

export default function AdminNotificationListener() {
  const { user } = useAuth()
  const toast = useToast()
  
  // Referencias para evitar consultar registros viejos o duplicados
  const lastCheckedRef = useRef<string | null>(null)
  
  // Mapa de cooldowns por llave única (usuario, acción y contexto) para evitar spam
  const lastNotificationTimesRef = useRef<Record<string, number>>({})

  useEffect(() => {
    // Solo activar si el usuario actual es Administrador
    if (!user || user.role !== 'admin') return

    // Inicializar la hora de partida con la hora actual en formato ISO para no disparar alertas viejas
    if (!lastCheckedRef.current) {
      lastCheckedRef.current = new Date().toISOString()
    }

    const checkAuditorias = async () => {
      try {
        const res = await fetch('/api/auditoria?limit=15')
        if (!res.ok) return
        
        const json = await res.json()
        const logs = json.data || []
        
        if (logs.length === 0) return

        let newLastChecked = lastCheckedRef.current
        const activeCooldowns = lastNotificationTimesRef.current
        const now = Date.now()

        // Los logs vienen en orden descendente (el más nuevo primero)
        // Procesamos de los más antiguos a los más nuevos
        const pendingLogs = logs
          .filter((log: any) => {
            // Solo logs posteriores a la última verificación
            const isNew = log.created_at > (lastCheckedRef.current || '')
            // Solo acciones de subida de archivos
            const isUploadAction = [
              'UPLOAD_DOCUMENT',
              'UPLOAD_DISPATCH_DOCUMENT',
              'UPLOAD_TEMPERATURE_DOCUMENT',
              'UPLOAD_CLIENT_DOCUMENT'
            ].includes(log.action)
            // Solo acciones realizadas por OTROS usuarios (no Lander)
            const isOtherUser = log.user_id !== user.userId && log.user?.username !== user.username

            return isNew && isUploadAction && isOtherUser
          })
          .reverse() // Procesar en orden cronológico real

        pendingLogs.forEach((log: any) => {
          const details = log.details || {}
          const docType = details.document_type || ''
          const userName = log.user?.display_name || log.user?.username || 'Un colaborador'
          const action = log.action

          // 1. Determinar etiqueta de informe amigable
          let docLabel = 'un archivo'
          if (docType === 'pata_pata_photo') docLabel = 'fotos Pata a Pata'
          else if (docType === 'thermograph_photo') docLabel = 'fotos de Termógrafos'
          else if (docType === 'pack_list') docLabel = 'el Packing List'
          else if (docType === 'reception') docLabel = 'el informe de Recepción'
          else if (docType === 'quality') docLabel = 'el informe de Calidad'
          else if (docType === 'process') docLabel = 'el informe de Proceso'
          else if (docType === 'daily_report') docLabel = 'el reporte de Temperaturas'

          // 2. Generar el mensaje de alerta
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

          // 3. Aplicar Cooldown Inteligente (3 minutos = 180,000 ms)
          // La llave agrupa por usuario, tipo de acción, y el ID específico del despacho o lote
          const contextId = details.dispatch_id || details.lot_id || details.temperature_report_id || 'general'
          const cooldownKey = `cooldown::${log.user?.username || 'user'}::${action}::${contextId}`
          
          const lastNotifyTime = activeCooldowns[cooldownKey] || 0
          if (now - lastNotifyTime < 180000) {
            // El usuario ya está subiendo archivos en este lote/despacho, omitimos notificaciones sucesivas (spam)
            return
          }

          // Registrar tiempo de esta notificación para activar el cooldown
          activeCooldowns[cooldownKey] = now

          // 4. Disparar el Toast
          toast.info(message, 6000)
          
          // Actualizar el puntero del log más reciente
          if (log.created_at > (newLastChecked || '')) {
            newLastChecked = log.created_at
          }
        })

        // Guardar la fecha del último log procesado
        if (newLastChecked) {
          lastCheckedRef.current = newLastChecked
        }
      } catch (err) {
        console.error('Error en listener de notificaciones de administrador:', err)
      }
    }

    // Ejecutar chequeo inicial a los 2 segundos
    const initialTimer = setTimeout(checkAuditorias, 2000)

    // Configurar intervalo recurrente cada 15 segundos
    const interval = setInterval(checkAuditorias, 15000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [user, toast])

  return null
}
