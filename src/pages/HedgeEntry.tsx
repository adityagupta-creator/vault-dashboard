import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Plus, Search, X } from 'lucide-react'
import type { SupplierPurchase, Hedge } from '../types'

export default function HedgeEntryPage() {
  const { user } = useAuthStore()
  const [hedges, setHedges] = useState<Hedge[]>([])
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    supplier_purchase_id: '', hedge_date: new Date().toISOString().split('T')[0],
    hedge_grams: '', hedge_price: '', mcx_petal_short_price: '', mcx_ten_short_price: '',
    frozen_premium: '', contract_expiry: '', hedge_platform: 'Emkay', hedge_status: 'completed',
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [hedgesRes, purchasesRes] = await Promise.all([
        withTimeout(supabase.from('hedges').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('supplier_purchases').select('*').eq('supplier_status', 'confirmed'))
      ])
      setHedges(hedgesRes.data || [])
      setPurchases(purchasesRes.data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const purchase = purchases.find(p => p.id === formData.supplier_purchase_id)
      await Promise.all([
        supabase.from('hedges').insert({
          supplier_purchase_id: formData.supplier_purchase_id,
          hedge_date: formData.hedge_date, hedge_grams: parseFloat(formData.hedge_grams) || 0,
          hedge_price: parseFloat(formData.hedge_price) || null,
          mcx_petal_short_price: parseFloat(formData.mcx_petal_short_price) || null,
          mcx_ten_short_price: parseFloat(formData.mcx_ten_short_price) || null,
          frozen_premium: parseFloat(formData.frozen_premium) || null,
          contract_expiry: formData.contract_expiry || null,
          hedge_platform: formData.hedge_platform, hedge_status: formData.hedge_status,
          entered_by: user?.id || null,
        }),
        purchase && supabase.from('client_orders').update({ trade_status: 'pending_payment' }).eq('id', (purchase as any).client_order_id)
      ])
      setShowModal(false)
      setFormData({ supplier_purchase_id: '', hedge_date: new Date().toISOString().split('T')[0], hedge_grams: '', hedge_price: '', mcx_petal_short_price: '', mcx_ten_short_price: '', frozen_premium: '', contract_expiry: '', hedge_platform: 'Emkay', hedge_status: 'completed' })
      fetchData()
    } catch (error) { console.error(error); alert('Failed to create hedge') }
    finally { setSaving(false) }
  }

  const getPurchase = (id: string) => purchases.find(p => p.id === id)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Hedge Entry</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
          <Plus className="w-4 h-4 mr-1" />New Hedge
        </button>
      </div>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>
      <div className="bg-white rounded border border-slate-200 flex-1 min-h-0 flex flex-col">
        <div className="table-container">
          <table className="table-excel">
            <thead className="sticky top-0 z-10">
              <tr>{['Sr.No', 'Date', 'Supplier', 'Grams', 'Hedge Price', 'MCX Petal', 'Frozen Premium', 'Platform', 'Status'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {hedges.map((hedge, idx) => {
                const purchase = getPurchase(hedge.supplier_purchase_id)
                return (
                  <tr key={hedge.id}>
                    <td className="text-slate-600 text-center w-12">{idx + 1}</td>
                    <td className="text-slate-900">{hedge.hedge_date}</td>
                    <td className="text-slate-900">{purchase?.supplier_name || '-'}</td>
                    <td className="text-slate-900">{hedge.hedge_grams}g</td>
                    <td className="text-slate-900">₹{hedge.hedge_price?.toLocaleString() || '-'}</td>
                    <td className="text-slate-900">₹{hedge.mcx_petal_short_price?.toLocaleString() || '-'}</td>
                    <td className="text-slate-900">₹{hedge.frozen_premium?.toLocaleString() || '-'}</td>
                    <td className="text-slate-900">{hedge.hedge_platform}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${hedge.hedge_status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{hedge.hedge_status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hedges.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No hedges found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">New Hedge Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Purchase *</label>
                <select required value={formData.supplier_purchase_id} onChange={(e) => setFormData({ ...formData, supplier_purchase_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select a purchase</option>
                  {purchases.map(p => <option key={p.id} value={p.id}>{p.supplier_name} - {p.supplier_grams}g</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Hedge Date *', key: 'hedge_date', type: 'date', required: true },
                  { label: 'Grams *', key: 'hedge_grams', type: 'number', required: true },
                  { label: 'Hedge Price (₹)', key: 'hedge_price', type: 'number', required: false },
                  { label: 'Frozen Premium (₹)', key: 'frozen_premium', type: 'number', required: false },
                  { label: 'MCX Petal Short Price', key: 'mcx_petal_short_price', type: 'number', required: false },
                  { label: 'MCX 10g Short Price', key: 'mcx_ten_short_price', type: 'number', required: false },
                  { label: 'Contract Expiry', key: 'contract_expiry', type: 'date', required: false },
                ].map(({ label, key, type, required }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input type={type} required={required} step={type === 'number' ? '0.01' : undefined}
                      value={(formData as any)[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                  <select value={formData.hedge_platform} onChange={(e) => setFormData({ ...formData, hedge_platform: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    {['Emkay', 'Axis', 'Kotak', 'ICICI'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Hedge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
