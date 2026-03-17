import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { formatDate, formatRupeeWithSymbol, formatNumberIndian } from '../lib/hardikUtils'
import { Download, Plus, Search, X } from 'lucide-react'
import type { ClientOrder } from '../types'
import * as XLSX from 'xlsx'

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

  const sendOrderNotification = async (count: number, fileName: string, source: string = 'sheet') => {
    const recipient = import.meta.env.VITE_MEGHNA_EMAIL || 'aditya.gupta@safegold.in'
    if (!recipient) return
    const functionName = import.meta.env.VITE_ORDER_NOTIFY_FUNCTION || 'notify-new-orders'
    try {
      await supabase.functions.invoke(functionName, {
        body: { recipient, count, fileName, source },
      })
    } catch (error) {
      console.error('Error sending order notification:', error)
    }
  }

  const fetchOrders = async () => {
    try {
      const { data, error } = await withTimeout(supabase.from('client_orders').select('*').order('created_at', { ascending: false }))
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
      sendOrderNotification(1, `Client: ${formData.client_name}, Product: ${formData.product_symbol || '-'} (${grams}g)`, 'manual entry')
    } catch (error) { console.error('Error creating order:', error); alert('Failed to create order') }
    finally { setSaving(false) }
  }

  const filteredOrders = orders.filter(order =>
    order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.product_symbol?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exportToExcel = () => {
    const rows = filteredOrders.map((order, idx) => ({
      'Sr.No': idx + 1,
      'Date': formatDate(order.order_date) || '',
      'Time': order.order_time || '',
      'Delivery Date': formatDate(order.delivery_date) || '',
      'Purity': order.purity ?? '',
      'Party Name': order.client_name ?? '',
      'Symbol': order.product_symbol ?? '',
      'Quantity Sold': order.quantity ?? 1,
      'Grams': order.grams ?? 0,
      'Quoted Rate': order.quoted_rate != null ? formatRupeeWithSymbol(order.quoted_rate, 2) : '',
      'Net Revenue_1': order.net_revenue != null ? formatRupeeWithSymbol(order.net_revenue, 2) : '',
      'GST_1': order.gst_amount != null ? formatRupeeWithSymbol(order.gst_amount, 2) : '',
      'TCS': order.tcs_amount != null ? formatRupeeWithSymbol(order.tcs_amount, 2) : '',
      'Gross Revenue': order.gross_revenue != null ? formatRupeeWithSymbol(order.gross_revenue, 2) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Meghna - Client Orders')
    const filename = `ClientOrders_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="page-excel-title">Meghna - Client Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportToExcel}
            disabled={filteredOrders.length === 0}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4 mr-1" />
            Export XLS
          </button>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
            <Plus className="w-4 h-4 mr-1" />New Order
          </button>
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>

      <div className="bg-white rounded border border-slate-200 flex-1 min-h-0 flex flex-col">
        <div className="table-container">
          <table className="table-excel">
            <colgroup>
              <col style={{ width: '2.5rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '5rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: '12rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '9rem' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {['Sr.No', 'Date', 'Time', 'Delivery Date', 'Purity', 'Party Name', 'Symbol', 'Quantity Sold', 'Grams', 'Quoted Rate', 'Net Revenue_1', 'GST_1', 'TCS', 'Gross Revenue'].map((h, i) => (
                  <th key={h} className={`${i === 0 ? 'text-center w-12' : ''} ${h === 'Gross Revenue' ? 'min-w-[9rem]' : ['Quoted Rate', 'Net Revenue_1', 'GST_1', 'TCS'].includes(h) ? 'min-w-[5.5rem]' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, idx) => {
                const nr = order.net_revenue ?? 0
                return (
                <tr key={order.id}>
                  <td className="text-slate-600 text-center w-12 whitespace-nowrap">{idx + 1}</td>
                  <td className="text-slate-900 whitespace-nowrap">{formatDate(order.order_date)}</td>
                  <td className="text-slate-600 whitespace-nowrap">{order.order_time || ''}</td>
                  <td className="text-slate-600 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                  <td className="text-slate-600">{order.purity ?? '-'}</td>
                  <td className="text-slate-900 font-medium">{order.client_name}</td>
                  <td className="text-slate-600">{order.product_symbol ?? '-'}</td>
                  <td className="text-slate-900 text-right">{formatNumberIndian(order.quantity ?? 1)}</td>
                  <td className="text-slate-900 text-right">{formatNumberIndian(order.grams)}g</td>
                  <td className="text-slate-900 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(order.quoted_rate, 2) || '-'}</td>
                  <td className="text-slate-900 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(nr, 2) || '-'}</td>
                  <td className="text-slate-600 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(order.gst_amount, 2) || '-'}</td>
                  <td className="text-slate-600 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(order.tcs_amount, 2) || '-'}</td>
                  <td className="text-slate-900 text-right min-w-[9rem] whitespace-nowrap">{formatRupeeWithSymbol(order.gross_revenue, 2) || '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No orders found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">New Meghna - Client Order</h2>
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
