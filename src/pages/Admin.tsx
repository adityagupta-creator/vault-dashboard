import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../api/supabase'
import { useAuthStore } from '../store/auth'
import { Shield, UserPlus, Trash2, Save, Check, X, Loader2 } from 'lucide-react'
import type { Profile, AppPage } from '../types'

interface UserWithPerms extends Profile {
  pageIds: Set<string>
}

export default function AdminPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<UserWithPerms[]>([])
  const [pages, setPages] = useState<AppPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pagesRes, usersRes, permsRes] = await Promise.all([
      supabase.from('app_pages').select('*').order('display_order'),
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('user_page_permissions').select('*'),
    ])

    const allPages = (pagesRes.data ?? []) as AppPage[]
    const allUsers = (usersRes.data ?? []) as Profile[]
    const allPerms = (permsRes.data ?? []) as { user_id: string; page_id: string }[]

    const permsByUser = new Map<string, Set<string>>()
    for (const perm of allPerms) {
      if (!permsByUser.has(perm.user_id)) permsByUser.set(perm.user_id, new Set())
      permsByUser.get(perm.user_id)!.add(perm.page_id)
    }

    setPages(allPages)
    setUsers(
      allUsers.map((u) => ({
        ...u,
        pageIds: u.role === 'admin'
          ? new Set(allPages.map((p) => p.id))
          : (permsByUser.get(u.id) ?? new Set()),
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const togglePermission = (userId: string, pageId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId || u.role === 'admin') return u
        const next = new Set(u.pageIds)
        if (next.has(pageId)) next.delete(pageId)
        else next.add(pageId)
        return { ...u, pageIds: next }
      })
    )
  }

  const savePermissions = async (user: UserWithPerms) => {
    if (user.role === 'admin') return
    setSaving(user.id)
    try {
      await supabase.from('user_page_permissions').delete().eq('user_id', user.id)

      const rows = Array.from(user.pageIds).map((page_id) => ({
        user_id: user.id,
        page_id,
        granted_by: currentUser?.id ?? null,
      }))

      if (rows.length > 0) {
        const { error } = await supabase.from('user_page_permissions').insert(rows)
        if (error) throw error
      }
    } catch (err) {
      console.error(err)
      alert('Failed to save permissions')
    } finally {
      setSaving(null)
    }
  }

  const toggleRole = async (user: UserWithPerms) => {
    if (user.id === currentUser?.id) return
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', user.id)
    if (error) { alert('Failed to update role'); return }

    if (newRole === 'admin') {
      const rows = pages.map((p) => ({
        user_id: user.id,
        page_id: p.id,
        granted_by: currentUser?.id ?? null,
      }))
      await supabase.from('user_page_permissions').delete().eq('user_id', user.id)
      if (rows.length) await supabase.from('user_page_permissions').insert(rows)
    }

    await fetchData()
  }

  const toggleActive = async (user: UserWithPerms) => {
    if (user.id === currentUser?.id) return
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) alert('Failed to update')
    else await fetchData()
  }

  const handleAddUser = async () => {
    setAddError('')
    if (!newEmail || !newPassword) { setAddError('Email and password required'); return }
    if (newPassword.length < 6) { setAddError('Password must be at least 6 characters'); return }
    setAddLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          data: { full_name: newName || newEmail.split('@')[0] },
        },
      })
      if (error) throw error
      if (!data.user) throw new Error('User creation failed')

      const userId = data.user.id

      const needsConfirmation = data.user.identities?.length === 0
      if (needsConfirmation) {
        throw new Error(
          'User already exists or email confirmation is enabled. ' +
          'Go to Supabase → Authentication → Providers → Email → disable "Confirm email" to allow admin user creation.'
        )
      }

      let retries = 3
      let profileCreated = false
      while (retries > 0 && !profileCreated) {
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: userId,
          email: newEmail,
          full_name: newName || newEmail.split('@')[0],
          role: newRole,
          is_active: true,
        })
        if (!profileErr) {
          profileCreated = true
        } else {
          retries--
          if (retries > 0) await new Promise((r) => setTimeout(r, 1000))
          else console.warn('Profile upsert failed:', profileErr.message)
        }
      }

      if (newRole === 'admin') {
        const { data: allPages } = await supabase.from('app_pages').select('id')
        if (allPages?.length) {
          await supabase.from('user_page_permissions').insert(
            allPages.map((p: { id: string }) => ({
              user_id: userId,
              page_id: p.id,
              granted_by: currentUser?.id ?? null,
            }))
          )
        }
      }

      setShowAddUser(false)
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      setNewRole('user')
      await fetchData()
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAddLoading(false)
    }
  }

  const deleteUser = async (user: UserWithPerms) => {
    if (user.id === currentUser?.id) return
    if (!confirm(`Remove ${user.email}? This will delete their permissions.`)) return
    await supabase.from('user_page_permissions').delete().eq('user_id', user.id)
    await supabase.from('profiles').update({ is_active: false }).eq('id', user.id)
    await fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  const nonAdminPages = pages.filter((p) => p.slug !== 'admin')

  return (
    <div className="page-excel space-y-3">
      <div className="page-excel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-500" />
          <h1 className="page-excel-title">Admin Panel</h1>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4 mr-1.5" />
          Add User
        </button>
      </div>

      {showAddUser && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Add New User</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email *</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-300"
                placeholder="user@example.com" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Password *</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-300"
                placeholder="Min 6 characters" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Full Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-300"
                placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-300">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAddUser} disabled={addLoading}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors disabled:opacity-50">
              {addLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Create
            </button>
            <button onClick={() => { setShowAddUser(false); setAddError('') }}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors">
              <X className="w-3.5 h-3.5 mr-1" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-center font-medium">Active</th>
                {nonAdminPages.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">{p.page_name}</th>
                ))}
                <th className="px-3 py-2 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id
                const isAdmin = user.role === 'admin'
                return (
                  <tr key={user.id} className={`${!user.is_active ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2">
                      <div>
                        <p className="font-medium text-slate-800">{user.full_name || '-'}</p>
                        <p className="text-slate-400">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleRole(user)}
                        disabled={isSelf}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isAdmin
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        } ${isSelf ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                      >
                        {user.role}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleActive(user)}
                        disabled={isSelf}
                        className={`w-4 h-4 rounded border-2 inline-flex items-center justify-center transition-colors ${
                          user.is_active
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-300 text-transparent'
                        } ${isSelf ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {user.is_active && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                    {nonAdminPages.map((page) => (
                      <td key={page.id} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={user.pageIds.has(page.id)}
                          onChange={() => togglePermission(user.id, page.id)}
                          disabled={isAdmin}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-300 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!isAdmin && (
                          <button
                            onClick={() => savePermissions(user)}
                            disabled={saving === user.id}
                            className="p-1 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Save permissions"
                          >
                            {saving === user.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Save className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {!isSelf && (
                          <button
                            onClick={() => deleteUser(user)}
                            className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors"
                            title="Remove user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
