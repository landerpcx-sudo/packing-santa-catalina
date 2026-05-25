'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useDropzone } from 'react-dropzone'
import { 
  Users, 
  Search, 
  Plus, 
  FolderOpen, 
  ExternalLink, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Calendar,
  X,
  FileDown,
  Trash2
} from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'

interface Client {
  id: string
  name: string
  drive_folder_id: string | null
  drive_folder_url: string | null
  created_at: string
}

interface ClientDocument {
  id: string
  client_id: string
  original_file_name: string
  drive_file_id: string | null
  drive_file_url: string | null
  storage_url: string | null
  created_at: string
  uploader?: {
    display_name: string
    username: string
  }
}

export default function ClientesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal de nuevo cliente
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [modalError, setModalError] = useState('')

  // Estado de subida de archivos
  const [uploadFiles, setUploadFiles] = useState<{ file: File; state: 'idle' | 'uploading' | 'success' | 'error'; message: string }[]>([])
  const [overallUploading, setOverallUploading] = useState(false)

  // Verificar autorización
  useEffect(() => {
    if (!authLoading) {
      if (!user || !['admin', 'gerencia', 'agronomo'].includes(user.role)) {
        router.push('/dashboard')
      }
    }
  }, [user, authLoading, router])

  // Cargar clientes
  const fetchClients = useCallback(async (selectIdAfterFetch?: string) => {
    setLoadingClients(true)
    try {
      const res = await fetch('/api/clientes')
      if (res.ok) {
        const data = await res.json()
        const clientList = data.data || []
        setClients(clientList)
        
        if (clientList.length > 0) {
          if (selectIdAfterFetch) {
            const matched = clientList.find((c: Client) => c.id === selectIdAfterFetch)
            if (matched) setSelectedClient(matched)
          } else if (!selectedClient) {
            setSelectedClient(clientList[0])
          }
        }
      }
    } catch (err) {
      console.error('Error fetching clients:', err)
    } finally {
      setLoadingClients(false)
    }
  }, [selectedClient])

  useEffect(() => {
    if (user && ['admin', 'gerencia', 'agronomo'].includes(user.role)) {
      fetchClients()
    }
  }, [user])

  // Cargar documentos del cliente seleccionado
  const fetchDocuments = useCallback(async (clientId: string) => {
    setLoadingDocs(true)
    try {
      const res = await fetch(`/api/clientes/${clientId}/documentos`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching documents:', err)
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClient) {
      fetchDocuments(selectedClient.id)
      setUploadFiles([])
    } else {
      setDocuments([])
    }
  }, [selectedClient, fetchDocuments])

  // Crear nuevo cliente
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientName.trim()) return

    setCreatingClient(true)
    setModalError('')

    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName }),
      })

      const json = await res.json()

      if (!res.ok) {
        setModalError(json.error || 'Error al crear el cliente')
        return
      }

      const created = json.data
      setNewClientName('')
      setIsModalOpen(false)
      // Recargar clientes y seleccionar el nuevo
      await fetchClients(created.id)
    } catch {
      setModalError('Error de conexión. Intente nuevamente.')
    } finally {
      setCreatingClient(false)
    }
  }

  // Eliminar un archivo
  const handleDeleteDoc = async (docId: string, fileName: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el archivo "${fileName}" tanto de la plataforma como de Google Drive?`)) return

    try {
      const res = await fetch(`/api/documentos/client_documents/${docId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al eliminar el archivo')
      } else {
        // Recargar documentos
        if (selectedClient) {
          fetchDocuments(selectedClient.id)
        }
      }
    } catch {
      alert('Error de conexión al intentar eliminar el archivo')
    }
  }

  // Manejar el dropzone de subida de archivos
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedClient || acceptedFiles.length === 0) return

    // Inicializar estados de los archivos a subir
    const newUploads = acceptedFiles.map(file => ({
      file,
      state: 'idle' as const,
      message: 'Listo para subir'
    }))

    setUploadFiles(prev => [...prev, ...newUploads])
    setOverallUploading(true)

    // Subir cada archivo secuencialmente para no sobrecargar y asegurar sincronización en Drive
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i]
      
      setUploadFiles(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(u => u.file === file)
        if (idx !== -1) {
          updated[idx].state = 'uploading'
          updated[idx].message = 'Subiendo a Drive y Storage...'
        }
        return updated
      })

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch(`/api/clientes/${selectedClient.id}/documentos`, {
          method: 'POST',
          body: formData,
        })

        const json = await res.json()

        if (!res.ok) {
          setUploadFiles(prev => {
            const updated = [...prev]
            const idx = updated.findIndex(u => u.file === file)
            if (idx !== -1) {
              updated[idx].state = 'error'
              updated[idx].message = json.error || 'Error al subir el archivo'
            }
            return updated
          })
        } else {
          setUploadFiles(prev => {
            const updated = [...prev]
            const idx = updated.findIndex(u => u.file === file)
            if (idx !== -1) {
              updated[idx].state = 'success'
              updated[idx].message = '¡Subido con éxito!'
            }
            return updated
          })
        }
      } catch {
        setUploadFiles(prev => {
          const updated = [...prev]
          const idx = updated.findIndex(u => u.file === file)
          if (idx !== -1) {
            updated[idx].state = 'error'
            updated[idx].message = 'Error de conexión'
          }
          return updated
        })
      }
    }

    setOverallUploading(false)
    // Recargar documentos
    fetchDocuments(selectedClient.id)
  }, [selectedClient, fetchDocuments])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: overallUploading || !selectedClient,
  })

  // Filtrar clientes
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (authLoading || !user || !['admin', 'gerencia', 'agronomo'].includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#0B0F19]">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-gray-400 font-medium">Verificando credenciales...</p>
      </div>
    )
  }

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-indigo-500/30 text-indigo-400">
                <Users size={28} />
              </div>
              Carpeta de Clientes
            </h1>
            <p className="text-gray-400 mt-1.5 text-sm">Facturas de pagos, proformas y respaldos organizados en Google Drive.</p>
          </div>
          
          <button 
            onClick={() => {
              setModalError('')
              setNewClientName('')
              setIsModalOpen(true)
            }}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm rounded-2xl hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-600/25 hover:scale-[1.02] active:scale-95"
          >
            <Plus size={18} />
            Nuevo Cliente
          </button>
        </div>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Columna Izquierda: Directorio de Clientes */}
          <div className="lg:col-span-4 bg-[#0f172a] border border-white/10 rounded-3xl p-5 flex flex-col h-[650px] shadow-xl">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              📂 Directorio
            </h3>
            
            {/* Buscador */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4.5 h-4.5" />
              <input 
                type="text" 
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
              />
            </div>

            {/* Listado de Clientes */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
              {loadingClients ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-gray-500 text-xs font-medium">Cargando directorio...</p>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-20 text-gray-500 text-sm">
                  {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                </div>
              ) : (
                filteredClients.map((client) => {
                  const isSelected = selectedClient?.id === client.id
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className={`w-full text-left px-4 py-3.5 rounded-2xl transition-all flex items-center justify-between border ${
                        isSelected 
                          ? 'bg-gradient-to-r from-indigo-500/10 to-indigo-600/5 border-indigo-500/40 text-indigo-400' 
                          : 'bg-white/[0.01] hover:bg-white/[0.04] border-white/5 text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate uppercase tracking-wide leading-tight">
                          {client.name}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 font-medium flex items-center gap-1">
                          <Calendar size={10} />
                          Creado: {new Date(client.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <FolderOpen 
                        size={18} 
                        className={`shrink-0 ml-3 transition-transform ${isSelected ? 'text-indigo-400 scale-110' : 'text-gray-600 group-hover:text-gray-400'}`} 
                      />
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Columna Derecha: Detalle de Cliente y Documentos */}
          <div className="lg:col-span-8 space-y-6">
            
            {selectedClient ? (
              <>
                {/* Panel Info Cliente */}
                <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5 text-white pointer-events-none">
                    <Users size={120} />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-500/15 border border-indigo-500/25 px-2 py-0.5 rounded text-indigo-400">
                          Cliente Activo
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-white uppercase mt-2 tracking-wide leading-tight">
                        {selectedClient.name}
                      </h2>
                    </div>

                    {selectedClient.drive_folder_url && (
                      <a 
                        href={selectedClient.drive_folder_url}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 transition-all font-bold text-xs uppercase tracking-widest rounded-2xl"
                      >
                        Carpeta Drive
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Zona de Subida de Documentos (Solo Drag & Drop) */}
                <div 
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-3xl p-8 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center gap-3 relative ${
                    isDragActive 
                      ? 'border-indigo-500 bg-indigo-500/5' 
                      : 'border-white/10 bg-white/2 hover:bg-white/[0.04] hover:border-white/20'
                  } ${overallUploading ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <input {...getInputProps()} />
                  
                  <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
                    <Upload size={22} className={overallUploading ? 'animate-bounce' : ''} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">
                      {isDragActive ? 'Suelta los archivos aquí...' : 'Subir Facturas, Proformas y Respaldos'}
                    </h4>
                    <p className="text-gray-500 text-xs mt-1.5">
                      Arrastra múltiples archivos o <span className="text-indigo-400 font-semibold">haz clic para buscar</span> en tu dispositivo
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                      PDF, IMÁGENES, EXCEL, ZIP
                    </span>
                  </div>
                </div>

                {/* Progreso de Subida Local */}
                {uploadFiles.length > 0 && (
                  <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <h4 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        📥 Subidas en Curso ({uploadFiles.filter(u => u.state === 'success').length}/{uploadFiles.length})
                      </h4>
                      {uploadFiles.every(u => u.state === 'success' || u.state === 'error') && (
                        <button 
                          onClick={() => setUploadFiles([])}
                          className="text-gray-500 hover:text-white text-xs font-semibold uppercase tracking-wider"
                        >
                          Limpiar lista
                        </button>
                      )}
                    </div>
                    
                    <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1">
                      {uploadFiles.map((up, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 text-xs text-gray-300"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <FileText size={16} className="text-gray-400 flex-shrink-0" />
                            <span className="font-medium truncate pr-4">{up.file.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {up.state === 'uploading' && <Loader2 size={14} className="text-indigo-400 animate-spin" />}
                            {up.state === 'success' && <CheckCircle2 size={14} className="text-emerald-500" />}
                            {up.state === 'error' && <AlertCircle size={14} className="text-red-500" />}
                            <span className={`font-semibold text-[10px] uppercase tracking-wider ${
                              up.state === 'success' ? 'text-emerald-400' : up.state === 'error' ? 'text-red-400' : 'text-indigo-400'
                            }`}>
                              {up.message}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Listado de Documentos del Cliente */}
                <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-5 shadow-xl">
                  <h3 className="text-white font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2 pb-3 border-b border-white/10">
                    📄 Documentos Guardados
                  </h3>

                  {loadingDocs ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                      <p className="text-gray-500 text-xs font-medium">Buscando documentos...</p>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 text-sm">
                      No hay ningún documento guardado para este cliente
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-white/5">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            <th className="p-4 whitespace-nowrap">Nombre de Archivo</th>
                            <th className="p-4 whitespace-nowrap">Fecha de Subida</th>
                            <th className="p-4 whitespace-nowrap">Subido por</th>
                            <th className="p-4 whitespace-nowrap text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {documents.map((doc) => (
                            <tr key={doc.id} className="hover:bg-white/[0.01] transition-colors group">
                              <td className="p-4 min-w-[200px]">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-indigo-400 shrink-0">
                                    <FileText size={16} />
                                  </div>
                                  <span className="font-bold text-white text-sm break-all leading-tight">
                                    {doc.original_file_name}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 whitespace-nowrap text-xs text-gray-400 font-medium">
                                {new Date(doc.created_at).toLocaleString()}
                              </td>
                              <td className="p-4 whitespace-nowrap text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {doc.uploader?.display_name || 'Desconocido'}
                              </td>
                              <td className="p-4 whitespace-nowrap text-right">
                                <div className="flex justify-end gap-1.5">
                                  {doc.storage_url && (
                                    <a
                                      href={doc.storage_url}
                                      download={doc.original_file_name}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Descargar archivo"
                                      className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all"
                                    >
                                      <FileDown size={15} />
                                    </a>
                                  )}
                                  {doc.drive_file_url && (
                                    <a
                                      href={doc.drive_file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Ver en Drive"
                                      className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                    >
                                      <ExternalLink size={15} />
                                    </a>
                                  )}
                                  {user?.role === 'admin' && (
                                    <button
                                      onClick={() => handleDeleteDoc(doc.id, doc.original_file_name)}
                                      title="Eliminar permanentemente"
                                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-20 flex flex-col items-center justify-center text-center gap-4 text-gray-500 shadow-xl">
                <FolderOpen size={48} className="text-gray-600" />
                <div>
                  <h3 className="text-white font-bold text-lg">Ningún Cliente Seleccionado</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    Selecciona un cliente del directorio de la izquierda o crea uno nuevo para empezar a gestionar sus documentos.
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Drawer / Modal de Nuevo Cliente */}
      {isModalOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsModalOpen(false)}
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Nuevo Cliente</h3>
                    <p className="text-xs text-gray-400">Creará automáticamente su carpeta en Drive.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 transition-all hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleCreateClient} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 items-center text-red-400 text-sm">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <p className="font-medium">{modalError}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">
                    Nombre del Cliente
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="ej. THE GROWERS CLUB"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value.toUpperCase())}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/10 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creatingClient || !newClientName.trim()}
                    className="flex-[2] px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creatingClient ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creando Carpeta...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Crear Cliente
                      </>
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </>
      )}

    </PageWrapper>
  )
}
