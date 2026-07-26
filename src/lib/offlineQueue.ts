'use client'

// ─────────────────────────────────────────────────────────────────────────────
// COLA DE SUBIDA PERSISTENTE (IndexedDB)
//
// Antes, si se cortaba la señal a mitad de una subida, el usuario perdía el
// trabajo: tenía que volver a seleccionar el archivo y empezar de nuevo. Esta
// cola guarda el archivo (el Blob completo, no solo su referencia) en el
// propio navegador, así que sobrevive a que se cierre la pestaña, se apague
// la pantalla o se pierda la señal en medio del packing. En cuanto vuelve la
// conexión, se reintenta sola.
//
// No sustituye al respaldo del servidor (Fase 0): es la primera línea de
// defensa, antes de que el archivo siquiera llegue a Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadJob {
  id: string
  entity: 'lotes' | 'despachos' | 'temperaturas'
  entityId: string
  documentType: string
  fileName: string
  fileType: string
  fileBlob: Blob
  fileHash: string
  folios?: string
  userId?: string
  userRole?: string
  createdAt: number
  status: 'pending' | 'uploading' | 'error'
  errorMessage?: string
  attempts: number
}

const DB_NAME = 'packing_upload_queue'
const STORE = 'jobs'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no soporta almacenamiento local de subidas.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function addJob(job: UploadJob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(job)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllJobs(): Promise<UploadJob[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as UploadJob[]) || [])
    req.onerror = () => reject(req.error)
  })
}

export async function updateJob(id: string, patch: Partial<UploadJob>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result
      if (existing) store.put({ ...existing, ...patch })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteJob(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
