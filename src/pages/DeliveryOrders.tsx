import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Plus, Search, FileText, Truck, X } from 'lucide-react'
import type { ClientOrder, DeliveryOrder } from '../types'

export default function DeliveryOrdersPage() {
  const { user } = useAuthStore()
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([])
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({ client_order_id: '', sku: '', vault: '', delivery_type: '', logistics_partner: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [deliveriesRes, ordersRes] = await Promise.all([
        withTimeout(supabase.from('delivery_orders').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('client_orders').select('*').eq('trade_status', 'payment_verified'))
      ])
      setDeliveries(deliveriesRes.data || [])
      setOrders(ordersRes.data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const ts = Date.now()
      await Promise.all([
        supabase.from('delivery_orders').insert({
          client_order_id: formData.client_order_id, sku: formData.sku || null,
          vault: formData.vault || null, delivery_type: formData.delivery_type || null,
          logistics_partner: formData.logistics_partner || null,
          invoice_number: `INV-${ts}`, delivery_challan_number: `DC-${ts}`,
          debit_note_number: `DN-${ts}`, e_invoice_number: `EINV-${ts}`,
          status: 'created', created_by: user?.id || null,
        }),
        supabase.from('client_orders').update({ trade_status: 'do_created' }).eq('id', formData.client_order_id)
      ])
      setShowModal(false)
      setFormData({ client_order_id: '', sku: '', vault: '', delivery_type: '', logistics_partner: '' })
      fetchData()
    } catch (error) { console.error(error); alert('Failed to create delivery order') }
    finally { setSaving(false) }
  }

  const getOrder = (id: string) => orders.find(o => o.id === id)
  const filteredDeliveries = deliveries.filter(d => getOrder(d.client_order_id)?.client_name?.toLowerCase().includes(searchTerm.toLowerCase()))

  const statusColors: Record<string, string> = {
    created: 'bg-blue-100 text-blue-800', dispatched: 'bg-purple-100 text-purple-800', delivered: 'bg-green-100 text-green-800'
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Delivery Orders</h1>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
          <Plus className="w-4 h-4 mr-1" />Create DO
        </button>
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
              <tr>{['Sr.No', 'Invoice #', 'Client', 'SKU', 'Vault', 'Logistics', 'Status', 'Docs'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredDeliveries.map((delivery, idx) => {
                const order = getOrder(delivery.client_order_id)
                return (
                  <tr key={delivery.id}>
                    <td className="text-slate-600 text-center w-12">{idx + 1}</td>
                    <td className="text-slate-900">{delivery.invoice_number}</td>
                    <td className="text-slate-900">{order?.client_name || '-'}</td>
                    <td className="text-slate-600">{delivery.sku || '-'}</td>
                    <td className="text-slate-600">{delivery.vault || '-'}</td>
                    <td className="text-slate-600">{delivery.logistics_partner || '-'}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[delivery.status] || 'bg-slate-100'}`}>{delivery.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {delivery.invoice_number && <button className="p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="Invoice"><FileText className="w-3.5 h-3.5" /></button>}
                        {delivery.delivery_challan_number && <button className="p-0.5 text-purple-600 hover:bg-purple-50 rounded" title="Challan"><Truck className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredDeliveries.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No deliveries found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Create Delivery Order</h2>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
                  <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vault</label>
                  <select value={formData.vault} onChange={(e) => setFormData({ ...formData, vault: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">Select vault</option>
                    {['Vault A', 'Vault B', 'Vault C'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery Type</label>
                  <select value={formData.delivery_type} onChange={(e) => setFormData({ ...formData, delivery_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">Select type</option>
                    <option value="home_delivery">Home Delivery</option>
                    <option value="store_pickup">Store Pickup</option>
                    <option value="courier">Courier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Logistics Partner</label>
                  <select value={formData.logistics_partner} onChange={(e) => setFormData({ ...formData, logistics_partner: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">Select partner</option>
                    {['FedEx', 'DTDC', 'Delhivery', 'BlueDart'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create DO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
