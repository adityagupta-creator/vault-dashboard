import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { Plus, Search, X } from 'lucide-react'
import type { VaultLogistics } from '../types'

export default function VaultPage() {
  const [vaults, setVaults] = useState<VaultLogistics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({ vault_name: '', available_gold: '', reserved_gold: '0', delivered_gold: '0' })

  useEffect(() => { fetchVaults() }, [])

  const toNumber = (value: unknown) => {
    const num = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(num) ? num : 0
  }

  const fetchVaults = async () => {
    try {
      setError(null)
      const { data, error: fetchError } = await withTimeout(supabase.from('vault_logistics').select('*').order('vault_name'))
      if (fetchError) throw fetchError
      setVaults(data || [])
    } catch (error) {
      console.error(error)
      setError((error as Error)?.message || 'Failed to load vaults')
    }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await supabase.from('vault_logistics').insert({
        vault_name: formData.vault_name,
        available_gold: parseFloat(formData.available_gold) || 0,
        reserved_gold: parseFloat(formData.reserved_gold) || 0,
        delivered_gold: parseFloat(formData.delivered_gold) || 0,
      })
      setShowModal(false)
      setFormData({ vault_name: '', available_gold: '', reserved_gold: '0', delivered_gold: '0' })
      fetchVaults()
    } catch (error) { console.error(error); alert('Failed to create vault') }
    finally { setSaving(false) }
  }

  const filteredVaults = vaults.filter(v => v.vault_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  const totalAvailable = vaults.reduce((sum, v) => sum + toNumber(v.available_gold), 0)
  const totalReserved = vaults.reduce((sum, v) => sum + toNumber(v.reserved_gold), 0)
  const totalDelivered = vaults.reduce((sum, v) => sum + toNumber(v.delivered_gold), 0)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Vault Inventory</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
          <Plus className="w-4 h-4 mr-1" />Add Vault
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 flex-shrink-0">
        <div className="bg-amber-500 rounded p-2 text-white text-center">
          <p className="text-[10px] text-amber-100">Available</p>
          <p className="text-lg font-bold">{totalAvailable.toLocaleString()}g</p>
        </div>
        <div className="bg-blue-500 rounded p-2 text-white text-center">
          <p className="text-[10px] text-blue-100">Reserved</p>
          <p className="text-lg font-bold">{totalReserved.toLocaleString()}g</p>
        </div>
        <div className="bg-green-500 rounded p-2 text-white text-center">
          <p className="text-[10px] text-green-100">Delivered</p>
          <p className="text-lg font-bold">{totalDelivered.toLocaleString()}g</p>
        </div>
      </div>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-xs flex-shrink-0">{error}</div>
      )}
      <div className="bg-white rounded border border-slate-200 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="table-excel">
            <thead className="sticky top-0 z-10">
              <tr>{['Vault', 'Available', 'Reserved', 'Delivered', 'Total'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredVaults.map((vault) => (
                <tr key={vault.id}>
                  <td className="font-medium text-slate-900">{vault.vault_name}</td>
                  <td className="text-green-600">{toNumber(vault.available_gold).toLocaleString()}</td>
                  <td className="text-amber-600">{toNumber(vault.reserved_gold).toLocaleString()}</td>
                  <td className="text-blue-600">{toNumber(vault.delivered_gold).toLocaleString()}</td>
                  <td className="text-slate-900 font-medium">{(toNumber(vault.available_gold) + toNumber(vault.reserved_gold) + toNumber(vault.delivered_gold)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredVaults.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No vaults found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Add Vault</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vault Name *</label>
                <input type="text" required value={formData.vault_name} onChange={(e) => setFormData({ ...formData, vault_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Available Gold (g) *</label>
                <input type="number" required step="0.01" value={formData.available_gold} onChange={(e) => setFormData({ ...formData, available_gold: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reserved (g)</label>
                  <input type="number" step="0.01" value={formData.reserved_gold} onChange={(e) => setFormData({ ...formData, reserved_gold: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivered (g)</label>
                  <input type="number" step="0.01" value={formData.delivered_gold} onChange={(e) => setFormData({ ...formData, delivered_gold: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
