import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Plus, Search, Check, X, FileSpreadsheet } from 'lucide-react'
import type { ClientOrder, SupplierPurchase } from '../types'

export default function SupplierPurchasePage() {
  const { user } = useAuthStore()
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [ordersMap, setOrdersMap] = useState<Record<string, ClientOrder>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ client_order_id: '', supplier_name: '', supplier_grams: '', supplier_rate: '', supplier_making_charges: '0', supplier_status: 'booked' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [purchasesRes, ordersRes] = await Promise.all([
        withTimeout(supabase.from('supplier_purchases').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('client_orders').select('*').eq('trade_status', 'pending_supplier_booking'))
      ])
      const ps = purchasesRes.data || []
      setPurchases(ps)
      setOrders(ordersRes.data || [])

      const orderIds = [...new Set(ps.map((p) => p.client_order_id))]
      if (orderIds.length > 0) {
        const { data } = await withTimeout(supabase.from('client_orders').select('*').in('id', orderIds))
        const map: Record<string, ClientOrder> = {}
        ;(data || []).forEach((o) => { map[o.id] = o })
        setOrdersMap(map)
      } else {
        setOrdersMap({})
      }
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const supplier_grams = parseFloat(formData.supplier_grams) || 0
      const supplier_rate = parseFloat(formData.supplier_rate) || 0
      const supplier_making_charges = parseFloat(formData.supplier_making_charges) || 0
      const net_purchase = (supplier_grams * supplier_rate / 10) + supplier_making_charges
      const gst_2 = net_purchase * 0.02
      const gross_purchase = net_purchase + gst_2
      await Promise.all([
        supabase.from('supplier_purchases').insert({ client_order_id: formData.client_order_id, supplier_name: formData.supplier_name, supplier_grams, supplier_rate, supplier_making_charges, net_purchase, gst_2, gross_purchase, supplier_status: formData.supplier_status, booked_by_agent_id: user?.id || null }),
        supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', formData.client_order_id)
      ])
      setShowModal(false)
      setFormData({ client_order_id: '', supplier_name: '', supplier_grams: '', supplier_rate: '', supplier_making_charges: '0', supplier_status: 'booked' })
      fetchData()
    } catch (error) { console.error(error); alert('Failed to create purchase') }
    finally { setSaving(false) }
  }

  const confirmPurchase = async (purchaseId: string) => {
    await supabase.from('supplier_purchases').update({ supplier_status: 'confirmed' }).eq('id', purchaseId)
    fetchData()
  }

  const filteredPurchases = purchases.filter(p => p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Supplier Purchase</h1>
        <div className="flex items-center gap-2">
          <Link to="/hardik-coin" className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors">
            <FileSpreadsheet className="w-4 h-4 mr-1" />Hardik Coin
          </Link>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
            <Plus className="w-4 h-4 mr-1" />Book Supplier
          </button>
        </div>
      </div>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>
      <div className="bg-white rounded border border-slate-200 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="table-excel">
            <thead className="sticky top-0 z-10">
              <tr>{['Sr.No', 'Supplier', 'Grams', 'Rate', 'Net', 'GST', 'Gross', 'Margin', 'Margin %', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredPurchases.map((purchase, idx) => {
                const order = ordersMap[purchase.client_order_id]
                const nr = order?.net_revenue ?? 0
                const np = purchase.net_purchase ?? 0
                const margin = nr && np ? nr - np : null
                const marginPct = nr && margin != null ? ((margin / nr) * 100).toFixed(2) + '%' : '-'
                return (
                <tr key={purchase.id}>
                  <td className="text-slate-600 text-center w-12">{idx + 1}</td>
                  <td className="text-slate-900">{purchase.supplier_name}</td>
                  <td className="text-slate-900">{purchase.supplier_grams}g</td>
                  <td className="text-slate-900">₹{purchase.supplier_rate?.toLocaleString() || '-'}/10g</td>
                  <td className="text-slate-900">₹{purchase.net_purchase?.toLocaleString() || '-'}</td>
                  <td className="text-slate-900">₹{purchase.gst_2?.toLocaleString() || '-'}</td>
                  <td className="text-slate-900">₹{purchase.gross_purchase?.toLocaleString() || '-'}</td>
                  <td className="text-slate-900">{margin != null ? `₹${margin.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="text-slate-600">{marginPct}</td>
                  <td>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${purchase.supplier_status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{purchase.supplier_status}</span>
                  </td>
                  <td>
                    {purchase.supplier_status === 'booked' && (
                      <button onClick={() => confirmPurchase(purchase.id)} className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-green-500 hover:bg-green-600 text-white rounded">
                        <Check className="w-3 h-3 mr-1" />Confirm
                      </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredPurchases.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No purchases found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Book Supplier</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Order *</label>
                <select required value={formData.client_order_id} onChange={(e) => setFormData({ ...formData, client_order_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select an order</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.client_name} - {o.grams}g</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Name *</label>
                <input type="text" required value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Grams *</label>
                  <input type="number" required step="0.01" value={formData.supplier_grams} onChange={(e) => setFormData({ ...formData, supplier_grams: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rate (₹/10g) *</label>
                  <input type="number" required step="0.01" value={formData.supplier_rate} onChange={(e) => setFormData({ ...formData, supplier_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Making Charges (₹)</label>
                <input type="number" step="0.01" value={formData.supplier_making_charges} onChange={(e) => setFormData({ ...formData, supplier_making_charges: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Booking...' : 'Book Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
