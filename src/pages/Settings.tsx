import { useState } from 'react'
import { Mail, Plus, Trash2 } from 'lucide-react'
import { useNotificationEmails } from '../hooks/useAppSettings'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsPage() {
  const [emails, { addEmail, removeEmail }, loading] = useNotificationEmails()
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
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
      </div>
    </div>
  )
}
