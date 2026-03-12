import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { useAuthStore } from '../store/auth'
import { Plus, Search, Send, X } from 'lucide-react'
import type { ClientOrder } from '../types'

export default function ClientOrdersPage() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    client_name: '', company_name: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '', product_symbol: '', purity: '',
    grams: '', quantity: '', quoted_rate: '', making_charges: '0',
    order_source: 'offline' as 'online' | 'offline', city: '', remarks: '',
  })

  useEffect(() => { fetchOrders() }, [])

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase.from('client_orders').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setOrders(data || [])
    } catch (error) { console.error('Error fetching orders:', error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const grams = parseFloat(formData.grams) || 0
      const quoted_rate = parseFloat(formData.quoted_rate) || 0
      const making_charges = parseFloat(formData.making_charges) || 0
      const net_revenue = (grams * quoted_rate) + making_charges
      const gst_amount = net_revenue * 0.03
      const tcs_amount = net_revenue * 0.001
      const gross_revenue = net_revenue + gst_amount + tcs_amount

      const { error } = await supabase.from('client_orders').insert({
        client_name: formData.client_name, company_name: formData.company_name || null,
        order_date: formData.order_date, delivery_date: formData.delivery_date || null,
        product_symbol: formData.product_symbol || null, purity: formData.purity || null,
        grams, quantity: parseInt(formData.quantity) || 1, quoted_rate, making_charges,
        net_revenue, gst_amount, tcs_amount, gross_revenue,
        order_source: formData.order_source, city: formData.city || null,
        trade_status: 'pending_supplier_booking', remarks: formData.remarks || null,
        created_by: user?.id || null,
      })
      if (error) throw error
      setShowModal(false)
      setFormData({ client_name: '', company_name: '', order_date: new Date().toISOString().split('T')[0], delivery_date: '', product_symbol: '', purity: '', grams: '', quantity: '', quoted_rate: '', making_charges: '0', order_source: 'offline', city: '', remarks: '' })
      fetchOrders()
    } catch (error) { console.error('Error creating order:', error); alert('Failed to create order') }
    finally { setSaving(false) }
  }

  const sendToSupplier = async (orderId: string) => {
    try {
      await supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', orderId)
      fetchOrders()
    } catch (error) { console.error('Error updating status:', error) }
  }

  const filteredOrders = orders.filter(order =>
    order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const statusColors: Record<string, string> = {
    pending_supplier_booking: 'bg-yellow-100 text-yellow-800',
    pending_hedge: 'bg-blue-100 text-blue-800',
    pending_payment: 'bg-amber-100 text-amber-800',
    payment_verified: 'bg-green-100 text-green-800',
    do_created: 'bg-purple-100 text-purple-800',
    in_delivery: 'bg-indigo-100 text-indigo-800',
    reconciliation_pending: 'bg-orange-100 text-orange-800',
    closed: 'bg-slate-100 text-slate-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Orders</h1>
          <p className="text-slate-500">Manage and track client orders</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors">
          <Plus className="w-5 h-5 mr-2" />New Order
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" placeholder="Search by client name or order number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                {['Order #', 'Client', 'Product', 'Grams', 'Rate', 'Revenue', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">{order.order_number || '-'}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-900">{order.client_name}</p>
                    {order.company_name && <p className="text-xs text-slate-500">{order.company_name}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{order.product_symbol || '-'} {order.purity ? `(${order.purity})` : ''}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{order.grams}g</td>
                  <td className="px-6 py-4 text-sm text-slate-900">₹{order.quoted_rate?.toLocaleString() || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">₹{order.gross_revenue?.toLocaleString() || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.trade_status] || 'bg-slate-100'}`}>
                      {order.trade_status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {order.trade_status === 'pending_supplier_booking' && (
                      <button onClick={() => sendToSupplier(order.id)} className="inline-flex items-center px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
                        <Send className="w-3 h-3 mr-1" />Send to Supplier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && <div className="p-12 text-center text-slate-500">No orders found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">New Client Order</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Client Name *', key: 'client_name', required: true, type: 'text', placeholder: '' },
                  { label: 'Company Name', key: 'company_name', required: false, type: 'text', placeholder: '' },
                  { label: 'Order Date *', key: 'order_date', required: true, type: 'date', placeholder: '' },
                  { label: 'Delivery Date', key: 'delivery_date', required: false, type: 'date', placeholder: '' },
                  { label: 'Product Symbol', key: 'product_symbol', required: false, type: 'text', placeholder: 'e.g., GOLDGUINEA24K' },
                  { label: 'Purity', key: 'purity', required: false, type: 'text', placeholder: 'e.g., 24K, 22K' },
                  { label: 'Grams *', key: 'grams', required: true, type: 'number', placeholder: '' },
                  { label: 'Quantity', key: 'quantity', required: false, type: 'number', placeholder: '' },
                  { label: 'Quoted Rate (₹/10g) *', key: 'quoted_rate', required: true, type: 'number', placeholder: '' },
                  { label: 'Making Charges (₹)', key: 'making_charges', required: false, type: 'number', placeholder: '' },
                  { label: 'City', key: 'city', required: false, type: 'text', placeholder: '' },
                ].map(({ label, key, required, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input type={type} required={required} placeholder={placeholder}
                      value={(formData as any)[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Order Source</label>
                  <select value={formData.order_source} onChange={(e) => setFormData({ ...formData, order_source: e.target.value as 'online' | 'offline' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
