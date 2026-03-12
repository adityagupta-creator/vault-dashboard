import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { Plus, Search, X } from 'lucide-react'
import type { VaultLogistics } from '../types'

export default function VaultPage() {
  const [vaults, setVaults] = useState<VaultLogistics[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({ vault_name: '', available_gold: '', reserved_gold: '0', delivered_gold: '0' })

  useEffect(() => { fetchVaults() }, [])

  const fetchVaults = async () => {
    try {
      const { data } = await supabase.from('vault_logistics').select('*').order('vault_name')
      setVaults(data || [])
    } catch (error) { console.error(error) }
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
  const totalAvailable = vaults.reduce((sum, v) => sum + v.available_gold, 0)
  const totalReserved = vaults.reduce((sum, v) => sum + v.reserved_gold, 0)
  const totalDelivered = vaults.reduce((sum, v) => sum + v.delivered_gold, 0)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Vault Inventory</h1><p className="text-slate-500">Track gold across vaults</p></div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors">
          <Plus className="w-5 h-5 mr-2" />Add Vault
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl p-6 text-white">
          <p className="text-amber-100">Available Gold</p>
          <p className="text-3xl font-bold mt-1">{totalAvailable.toLocaleString()}g</p>
        </div>
        <div className="bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl p-6 text-white">
          <p className="text-blue-100">Reserved Gold</p>
          <p className="text-3xl font-bold mt-1">{totalReserved.toLocaleString()}g</p>
        </div>
        <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-xl p-6 text-white">
          <p className="text-green-100">Delivered Gold</p>
          <p className="text-3xl font-bold mt-1">{totalDelivered.toLocaleString()}g</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" placeholder="Search vaults..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>{['Vault Name', 'Available (g)', 'Reserved (g)', 'Delivered (g)', 'Total (g)'].map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredVaults.map((vault) => (
                <tr key={vault.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{vault.vault_name}</td>
                  <td className="px-6 py-4 text-sm text-green-600">{vault.available_gold.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-amber-600">{vault.reserved_gold.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-blue-600">{vault.delivered_gold.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{(vault.available_gold + vault.reserved_gold + vault.delivered_gold).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredVaults.length === 0 && <div className="p-12 text-center text-slate-500">No vaults found</div>}
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
