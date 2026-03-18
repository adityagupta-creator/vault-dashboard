import { useState } from 'react'
import { Mail, Plus, Trash2, KeyRound, Eye, EyeOff, Check } from 'lucide-react'
import { useNotificationEmails } from '../hooks/useAppSettings'
import { useAuthStore } from '../store/auth'
import { supabase } from '../api/supabase'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [emails, { addEmail, removeEmail }, loading] = useNotificationEmails()
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)
  const [passSuccess, setPassSuccess] = useState(false)
  const [passLoading, setPassLoading] = useState(false)

  const handleChangePassword = async () => {
    setPassError(null)
    setPassSuccess(false)
    if (!newPass) { setPassError('Please enter a new password.'); return }
    if (newPass.length < 6) { setPassError('Password must be at least 6 characters.'); return }
    if (newPass !== confirmPass) { setPassError('Passwords do not match.'); return }
    setPassLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPass })
      if (err) throw err
      setNewPass('')
      setConfirmPass('')
      setPassSuccess(true)
      setTimeout(() => setPassSuccess(false), 4000)
    } catch (err) {
      setPassError((err as Error).message)
    } finally {
      setPassLoading(false)
    }
  }

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed) return
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    if (emails.includes(trimmed)) {
      setError('This email is already in the list.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await addEmail(trimmed)
      setNewEmail('')
    } catch {
      setError('Failed to add email. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (email: string) => {
    try {
      await removeEmail(email)
    } catch {
      alert('Failed to remove email.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      {isAdmin && <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">Email Notifications</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            These email addresses will receive a notification whenever new orders are imported.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter email address"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setError(null) }}
              onKeyDown={handleKeyDown}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newEmail.trim()}
              className="inline-flex items-center px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>

          {error && (
            <p className="text-sm text-rose-600">{error}</p>
          )}

          {emails.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              No email recipients configured. Add an email above to start receiving import notifications.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {emails.map((email) => (
                <li key={email} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="text-sm text-slate-800">{email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(email)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Update your password. We recommend changing it after your first login.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => { setNewPass(e.target.value); setPassError(null); setPassSuccess(false) }}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button type="button" onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setPassError(null); setPassSuccess(false) }}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
              />
              <button type="button" onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {passError && <p className="text-sm text-rose-600">{passError}</p>}
          {passSuccess && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="w-4 h-4" />
              Password updated successfully.
            </div>
          )}

          <button
            type="button"
            onClick={handleChangePassword}
            disabled={passLoading || !newPass || !confirmPass}
            className="inline-flex items-center px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {passLoading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}
