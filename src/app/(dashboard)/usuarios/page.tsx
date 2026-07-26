'use client'

import { useState, useEffect } from 'react'
import { 
  UserPlus, 
  Search, 
  Shield, 
  UserCheck, 
  UserX, 
  Edit2, 
  Key, 
  Trash2, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  MoreVertical,
  Mail,
  Briefcase,
  Eye,
  EyeOff,
  Copy as CopyIcon,
  Check as CheckIcon
} from 'lucide-react'
import { ROLE_DISPLAY_NAMES } from '@/lib/constants'
import { useToast } from '@/components/layout/Toast'
import { useConfirm } from '@/components/layout/ConfirmDialog'

interface UserApp {
  id: string
  username: string
  display_name: string
  role: string
  area: string | null
  active: boolean
  can_validate: boolean
  can_view_all: boolean
  can_download_all: boolean
  can_manage_users: boolean
  can_sync_drive: boolean
  can_create_lot: boolean
  can_view_drive: boolean
  created_at: string
}

const getPermissionsByRole = (role: string) => {
  const isOperative = ['jefe_frio', 'calidad', 'cuadratura', 'sag', 'despacho'].includes(role)
  const isAdmin = role === 'admin'
  const isReader = ['gerencia', 'agronomo'].includes(role)

  return {
    can_validate: isAdmin,
    can_view_all: isAdmin || isOperative || isReader,
    can_download_all: isAdmin || isOperative || isReader,
    can_manage_users: isAdmin,
    can_sync_drive: isAdmin,
    can_create_lot: isAdmin || isOperative,
    can_view_drive: isAdmin
  }
}

export default function UsuariosPage() {
  const toast = useToast()
  const confirmar = useConfirm()
  const [users, setUsers] = useState<UserApp[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserApp | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    role: 'calidad',
    area: '',
    password: '',
    can_validate: false,
    can_view_all: false,
    can_download_all: false,
    can_manage_users: false,
    can_sync_drive: false,
    can_create_lot: false,
    can_view_drive: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showCredentialsSummary, setShowCredentialsSummary] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState({ username: '', password: '', display_name: '' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/usuarios')
      if (res.ok) {
        const d = await res.json()
        setUsers(d.data)
      }
    } catch (err) {
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (user: UserApp | null = null) => {
    setModalError('')
    if (user) {
      setEditingUser(user)
      const perms = getPermissionsByRole(user.role)
      setFormData({
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        area: user.area || '',
        password: '', // No mostrar password
        ...perms
      })
    } else {
      setEditingUser(null)
      const defaultRole = 'calidad'
      const perms = getPermissionsByRole(defaultRole)
      setFormData({
        username: '',
        display_name: '',
        role: defaultRole,
        area: '',
        password: '',
        ...perms
      })
    }
    setIsModalOpen(true)
    setShowPassword(false)
    setShowCredentialsSummary(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setModalError('')

    try {
      const url = editingUser ? `/api/usuarios/${editingUser.id}` : '/api/usuarios'
      const method = editingUser ? 'PATCH' : 'POST'
      
      const payload = { ...formData }
      if (editingUser && !payload.password) delete (payload as any).password // No enviar password vacío en edición

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Error al procesar la solicitud')
      }

      if (!editingUser) {
        setCreatedCredentials({
          username: formData.username,
          password: formData.password,
          display_name: formData.display_name
        })
        setShowCredentialsSummary(true)
      } else {
        setIsModalOpen(false)
      }
      await fetchUsers()
    } catch (err: any) {
      setModalError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleUserStatus = async (user: UserApp) => {
    const activar = !user.active
    const ok = await confirmar({
      title: activar ? 'Activar usuario' : 'Desactivar usuario',
      message: `¿${activar ? 'Activar' : 'Desactivar'} a ${user.display_name}?`,
      confirmText: activar ? 'Activar' : 'Desactivar',
      danger: !activar,
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/usuarios/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: activar })
      })
      if (res.ok) { fetchUsers(); toast.success(`Usuario ${activar ? 'activado' : 'desactivado'}.`) }
      else toast.error('Error al actualizar el usuario.')
    } catch (err) {
      console.error('Error toggling user status:', err)
      toast.error('Error de conexión.')
    }
  }

  const filteredUsers = users.filter(u => 
    u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Gestión de Usuarios</h1>
          <p className="text-gray-400 mt-1">Administra los accesos y permisos del personal de la planta.</p>
        </div>
        
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
        >
          <UserPlus size={18} />
          Nuevo Usuario
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Buscar por nombre, usuario o rol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/10">
          <UserCheck size={14} className="text-emerald-500" />
          {users.filter(u => u.active).length} Activos
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-gray-400 font-medium">Cargando directorio de usuarios...</p>
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Usuario</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Rol / Área</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Permisos</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap text-center">Estado</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={`group hover:bg-white/[0.02] transition-colors ${!user.active ? 'opacity-60 grayscale' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner shrink-0 ${user.active ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400' : 'bg-gray-500/10 text-gray-500'}`}>
                          {user.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm leading-tight whitespace-nowrap">{user.display_name}</p>
                          <p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5 whitespace-nowrap">
                            <Mail size={10} /> @{user.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-white/5 rounded-lg text-indigo-400 shrink-0"><Shield size={12} /></div>
                        <div>
                          <p className="text-sm font-bold text-white truncate max-w-[150px]">{ROLE_DISPLAY_NAMES[user.role as keyof typeof ROLE_DISPLAY_NAMES] || user.role}</p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate max-w-[150px]">{user.area || 'Sin Área'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
                        {user.can_validate && <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1 shrink-0"><Lock size={8}/> Firma</div>}
                        {user.can_create_lot && <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 shrink-0"><Edit2 size={8}/> Escribe</div>}
                        {!user.can_validate && !user.can_create_lot && <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-500/10 px-1.5 py-0.5 rounded border border-gray-500/20 flex items-center gap-1 shrink-0"><Eye size={8}/> Lee</div>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${user.active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{user.active ? 'Activo' : 'Revocado'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(user)}
                          className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => toggleUserStatus(user)}
                          className={`p-2 rounded-lg transition-all ${user.active ? 'text-gray-400 hover:text-red-400 hover:bg-red-400/10' : 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-400/10'}`}
                          title={user.active ? "Desactivar" : "Activar"}
                        >
                          {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                      No se encontraron usuarios con ese filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panel Lateral (Drawer) para Crear/Editar */}
      {isModalOpen && (
        <>
          {/* Overlay Oscuro */}
          <div 
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsModalOpen(false)}
          />
          
          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 z-[110] w-full max-w-[450px] bg-[#0f172a] shadow-2xl border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-300">
            
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                  {editingUser ? <Edit2 size={20} /> : <UserPlus size={20} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                  </h3>
                  <p className="text-xs text-gray-400">Configuración de acceso y permisos.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition-all hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            {showCredentialsSummary ? (
              <div className="p-8 space-y-6 text-center animate-in fade-in zoom-in duration-300 flex-1 overflow-y-auto">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={40} />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">¡Usuario Preparado!</h4>
                  <p className="text-gray-400 text-sm mt-1">Copia estas credenciales para enviárselas a {createdCredentials.display_name}.</p>
                </div>
                
                <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-left space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                     <Shield size={60} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-1">Usuario / ID</label>
                    <p className="text-white font-mono font-bold text-lg">{createdCredentials.username}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-1">Contraseña Temporal</label>
                    <p className="text-indigo-400 font-mono font-bold text-lg">{createdCredentials.password}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const text = `Hola ${createdCredentials.display_name},\n\nTus credenciales para el sistema Santa Catalina son:\nUsuario: ${createdCredentials.username}\nContraseña: ${createdCredentials.password}\n\nAcceso: http://localhost:8080`
                    navigator.clipboard.writeText(text)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  {copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
                  {copied ? '¡Copiado al Portapapeles!' : 'Copiar Datos de Acceso'}
                </button>

                <div className="pt-2">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-500 hover:text-white text-sm font-bold uppercase tracking-widest transition-all"
                  >
                    Finalizar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                {modalError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 items-center text-red-400 text-sm">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    <p className="font-medium">{modalError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Usuario (ID)</label>
                    <input 
                      type="text" 
                      required
                      disabled={!!editingUser}
                      placeholder="ej. juan.perez"
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Nombre Completo</label>
                    <input 
                      type="text" 
                      required
                      placeholder="ej. Juan Pérez"
                      value={formData.display_name}
                      onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Rol en Sistema</label>
                    <select 
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value
                        const perms = getPermissionsByRole(newRole)
                        setFormData({
                          ...formData,
                          role: newRole,
                          ...perms
                        })
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 appearance-none"
                    >
                      {Object.entries(ROLE_DISPLAY_NAMES).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Área / Sección</label>
                    <input 
                      type="text" 
                      placeholder="ej. Frío, Despacho"
                      value={formData.area}
                      onChange={(e) => setFormData({...formData, area: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">
                    {editingUser ? 'Nueva Contraseña (opcional)' : 'Contraseña de Acceso'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      required={!editingUser}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-12 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-all"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-widest">Matriz de Permisos</h4>
                  </div>
                  
                  <div className="space-y-2">
                    {[
                      { id: 'can_view_all', label: 'Visualizar todo', desc: 'Ver todos los lotes y reportes' },
                      { id: 'can_download_all', label: 'Descargar todo', desc: 'Permitir descarga de archivos' },
                      { id: 'can_validate', label: 'Firma Digital', desc: 'Validar y aprobar informes' },
                      { id: 'can_create_lot', label: 'Modificar Registros', desc: 'Crear lotes y subir documentos' },
                      { id: 'can_sync_drive', label: 'Sincronizar Drive', desc: 'Forzar sincronización manual' },
                      { id: 'can_manage_users', label: 'Admin Usuarios', desc: 'Crear y editar personal' },
                      { id: 'can_view_drive', label: 'Ver Drive Original', desc: 'Enlace directo a Google Drive' },
                    ].map((perm) => (
                      <label key={perm.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 transition-all opacity-80 group">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{perm.label}</span>
                          <span className="text-[10px] text-gray-400 leading-tight mt-0.5">{perm.desc}</span>
                        </div>
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            id={perm.id}
                            checked={(formData as any)[perm.id]}
                            disabled
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-black/50 rounded-full border border-white/10 peer-checked:bg-indigo-500/30 peer-checked:border-indigo-500/20 transition-colors"></div>
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-400 rounded-full transition-transform peer-checked:translate-x-5 peer-checked:bg-indigo-400 shadow-sm"></div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

              </form>
            )}
            {!showCredentialsSummary && (
               <div className="p-4 border-t border-white/10 bg-[#0f172a] shrink-0">
                 <div className="flex gap-3">
                   <button
                     type="button"
                     onClick={() => setIsModalOpen(false)}
                     className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/5 transition-all"
                   >
                     Cancelar
                   </button>
                   <button
                     type="button"
                     onClick={handleSubmit}
                     disabled={isSubmitting}
                     className="flex-[2] px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                     {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                     {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                   </button>
                 </div>
               </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
