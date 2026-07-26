'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { addJob, getAllJobs, updateJob, deleteJob, UploadJob } from '@/lib/offlineQueue'
import { useAuth } from './AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// COLA GLOBAL DE SUBIDAS
//
// Vive en el layout del panel, así que sobrevive mientras se navega entre
// pantallas. Procesa un archivo a la vez (igual que ya se hacía antes en
// Clientes, "para no sobrecargar y asegurar sincronización en Drive") y se
// reintenta sola en cuanto detecta conexión.
// ─────────────────────────────────────────────────────────────────────────────

interface EnqueueParams {
  entity: 'lotes' | 'despachos' | 'temperaturas'
  entityId: string
  documentType: string
  file: File
  fileHash: string
  folios?: string
}

interface UploadQueueContextValue {
  jobs: UploadJob[]
  enqueue: (params: EnqueueParams, onSettled?: (success: boolean, data?: any, error?: string) => void) => Promise<void>
  retry: (id: string) => void
  dismiss: (id: string) => void
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null)

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext)
  if (!ctx) throw new Error('useUploadQueue debe usarse dentro de UploadQueueProvider')
  return ctx
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const listenersRef = useRef<Map<string, (success: boolean, data?: any, error?: string) => void>>(new Map())
  const processingRef = useRef(false)

  const refreshJobs = useCallback(async () => {
    try {
      const all = await getAllJobs()
      setJobs(all.sort((a, b) => a.createdAt - b.createdAt))
    } catch {
      // IndexedDB no disponible (navegación privada muy restrictiva, etc.):
      // la app sigue funcionando, simplemente sin cola persistente.
    }
  }, [])

  const processOne = useCallback(async (job: UploadJob) => {
    await updateJob(job.id, { status: 'uploading' })
    await refreshJobs()
    try {
      const headersInit: HeadersInit = { 'Content-Type': 'application/json' }
      if (job.userId) headersInit['x-user-id'] = job.userId
      if (job.userRole) headersInit['x-user-role'] = job.userRole

      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: headersInit,
        body: JSON.stringify({
          entity: job.entity,
          entityId: job.entityId,
          documentType: job.documentType,
          fileName: job.fileName,
          fileType: job.fileType,
          fileHash: job.fileHash,
          folios: job.folios,
        }),
      })
      const presignJson = await presignRes.json().catch(() => ({}))
      if (!presignRes.ok) throw new Error(presignJson.error || `Error ${presignRes.status} al preparar la subida`)

      const { signedUrl, storagePath, sanitizedName, versionNumber, mimeType } = presignJson

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType || job.fileType || 'application/octet-stream' },
        body: job.fileBlob,
      })
      if (!uploadRes.ok) throw new Error(`Error ${uploadRes.status} al guardar el archivo`)

      const confirmRes = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: headersInit,
        body: JSON.stringify({
          entity: job.entity,
          entityId: job.entityId,
          documentType: job.documentType,
          storagePath,
          sanitizedName,
          versionNumber,
          fileHash: job.fileHash,
        }),
      })
      const confirmJson = await confirmRes.json().catch(() => ({}))
      if (!confirmRes.ok) throw new Error(confirmJson.error || `Error ${confirmRes.status} al confirmar la subida`)

      await deleteJob(job.id)
      const listener = listenersRef.current.get(job.id)
      if (listener) {
        listener(true, confirmJson.data)
        listenersRef.current.delete(job.id)
      }
    } catch (e: any) {
      const message = e?.message || 'Error al subir el archivo'
      await updateJob(job.id, {
        status: 'error',
        errorMessage: message,
        attempts: (job.attempts || 0) + 1,
      })
      const listener = listenersRef.current.get(job.id)
      if (listener) {
        listener(false, undefined, message)
        listenersRef.current.delete(job.id)
      }
    }
    await refreshJobs()
  }, [refreshJobs])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    processingRef.current = true
    try {
      let all = await getAllJobs()
      let pending = all.filter(j => j.status === 'pending')
      while (pending.length > 0) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break
        await processOne(pending[0])
        all = await getAllJobs()
        pending = all.filter(j => j.status === 'pending')
      }
    } finally {
      processingRef.current = false
    }
  }, [processOne])

  useEffect(() => {
    refreshJobs()
    // Al montar, reintenta lo que haya quedado pendiente de una sesión anterior
    // (por ejemplo, si el usuario cerró la app con archivos sin subir).
    processQueue()

    const handleOnline = () => processQueue()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [refreshJobs, processQueue])

  const enqueue = useCallback(async (
    params: EnqueueParams,
    onSettled?: (success: boolean, data?: any, error?: string) => void
  ) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const job: UploadJob = {
      id,
      entity: params.entity,
      entityId: params.entityId,
      documentType: params.documentType,
      fileName: params.file.name,
      fileType: params.file.type,
      fileBlob: params.file,
      fileHash: params.fileHash,
      folios: params.folios,
      userId: user?.userId,
      userRole: user?.role,
      createdAt: Date.now(),
      status: 'pending',
      attempts: 0,
    }
    if (onSettled) listenersRef.current.set(id, onSettled)
    await addJob(job)
    await refreshJobs()
    processQueue()
  }, [user, refreshJobs, processQueue])

  const retry = useCallback((id: string) => {
    updateJob(id, { status: 'pending', errorMessage: undefined }).then(() => {
      refreshJobs()
      processQueue()
    })
  }, [refreshJobs, processQueue])

  const dismiss = useCallback((id: string) => {
    listenersRef.current.delete(id)
    deleteJob(id).then(refreshJobs)
  }, [refreshJobs])

  return (
    <UploadQueueContext.Provider value={{ jobs, enqueue, retry, dismiss }}>
      {children}
    </UploadQueueContext.Provider>
  )
}
