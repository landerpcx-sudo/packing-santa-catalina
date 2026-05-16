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

export default function UsuariosPage() {
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
      setFormData({
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        area: user.area || '',
        password: '', // No mostrar password
        can_validate: !!user.can_validate,
        can_view_all: !!user.can_view_all,
        can_download_all: !!user.can_download_all,
        can_manage_users: !!user.can_manage_users,
        can_sync_drive: !!user.can_sync_drive,
        can_create_lot: !!user.can_create_lot,
        can_view_drive: !!user.can_view_drive
      })
    } else {
      setEditingUser(null)
      setFormData({
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
    if (!confirm(`¿Estás seguro de que deseas ${user.active ? 'desactivar' : 'activar'} al usuario ${user.display_name}?`)) return
    
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active })
      })
      if (res.ok) fetchUsers()
    } catch (err) {
      console.error('Error toggling user status:', err)
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

      {/* Users Grid/List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-gray-400 font-medium">Cargando directorio de usuarios...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map((user) => (
            <div 
              key={user.id} 
              className={`group bg-[#0f172a] border border-white/10 rounded-3xl p-6 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 ${!user.active ? 'opacity-60 grayscale' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-inner ${user.active ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400' : 'bg-gray-500/10 text-gray-500'}`}>
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg leading-tight">{user.display_name}</h3>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <Mail size={12} /> @{user.username}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(user)}
                    className="p-2 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-xl transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => toggleUserStatus(user)}
                    className={`p-2 rounded-xl transition-all ${user.active ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                  >
                    {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1 flex items-center gap-1">
                    <Shield size={10} /> Rol
                  </p>
                  <p className="text-xs font-bold text-white truncate">
                    {ROLE_DISPLAY_NAMES[user.role as keyof typeof ROLE_DISPLAY_NAMES] || user.role}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1 flex items-center gap-1">
                    <Briefcase size={10} /> Área
                  </p>
                  <p className="text-xs font-bold text-white truncate">
                    {user.area || 'No definida'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
                   <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                     {user.active ? 'Usuario Activo' : 'Acceso Revocado'}
                   </span>
                </div>
                {user.can_validate && (
                   <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                     <Lock size={10} /> Validador
                   </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto backdrop-blur-md bg-black/80">
          <div className="flex min-h-full items-start justify-center p-4 sm:p-6 lg:p-10">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 relative">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                  {editingUser ? <Edit2 size={20} /> : <UserPlus size={20} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                  </h3>
                  <p className="text-xs text-gray-400">Completa los datos de acceso para el personal.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition-all">
                <X size={20} />
              </button>
            </div>
            
            {showCredentialsSummary ? (
              <div className="p-8 space-y-6 text-center animate-in fade-in zoom-in duration-300">
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
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-3 items-center text-red-400 text-sm">
                  <AlertCircle size={18} className="flex-shrink-0" />
                  <p className="font-medium">{modalError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Usuario (ID)</label>
                  <input 
                    type="text" 
                    required
                    disabled={!!editingUser}
                    placeholder="ej. juan.perez"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
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
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">Rol en Sistema</label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 appearance-none"
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
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest font-bold text-gray-500 ml-1">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para mantener)' : 'Contraseña de Acceso'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-12 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 font-mono"
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

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={16} className="text-indigo-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-widest">Permisos de Usuario</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { id: 'can_view_all', label: 'Visualizar todo', desc: 'Ver todos los lotes y reportes' },
                    { id: 'can_download_all', label: 'Descargar todo', desc: 'Permitir descarga de archivos' },
                    { id: 'can_validate', label: 'Firma Digital', desc: 'Validar y aprobar informes' },
                    { id: 'can_manage_users', label: 'Administrar Usuarios', desc: 'Crear y editar personal' },
                    { id: 'can_sync_drive', label: 'Sincronizar Drive', desc: 'Forzar sincronización manual' },
                    { id: 'can_create_lot', label: 'Crear Lotes', desc: 'Registrar recepciones nuevas' },
                    { id: 'can_view_drive', label: 'Ver en Drive', desc: 'Enlace directo a carpetas Drive' },
                  ].map((perm) => (
                    <div key={perm.id} className="flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all">
                      <input 
                        type="checkbox" 
                        id={perm.id}
                        checked={(formData as any)[perm.id]}
                        onChange={(e) => setFormData({...formData, [perm.id]: e.target.checked})}
                        className="w-5 h-5 mt-0.5 rounded-lg accent-indigo-500 bg-black/40 border-white/10"
                      />
                      <label htmlFor={perm.id} className="flex flex-col cursor-pointer select-none">
                        <span className="text-sm font-bold text-white">{perm.label}</span>
                        <span className="text-[10px] text-gray-400 leading-tight">{perm.desc}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-2xl border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-4 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
    )}
    </div>
  )
}
