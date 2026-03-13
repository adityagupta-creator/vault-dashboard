import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Search, Check, X } from 'lucide-react'
import type { ClientOrder, Payment } from '../types'

export default function FinancePage() {
  const { user } = useAuthStore()
  const [payments, setPayments] = useState<Payment[]>([])
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ client_order_id: '', payment_date: '', amount_received: '', payment_reference: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [paymentsRes, ordersRes] = await Promise.all([
        withTimeout(supabase.from('payments').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('client_orders').select('*').eq('trade_status', 'pending_payment'))
      ])
      setPayments(paymentsRes.data || [])
      setOrders(ordersRes.data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const order = orders.find(o => o.id === formData.client_order_id)
      if (!order) throw new Error('Order not found')
      await Promise.all([
        supabase.from('payments').insert({
          client_order_id: formData.client_order_id, client_name: order.client_name,
          expected_amount: order.gross_revenue || 0, amount_received: parseFloat(formData.amount_received) || 0,
          payment_date: formData.payment_date || null, payment_reference: formData.payment_reference || null,
          payment_status: 'verified',
        }),
        supabase.from('client_orders').update({ trade_status: 'payment_verified' }).eq('id', formData.client_order_id)
      ])
      setShowModal(false)
      setFormData({ client_order_id: '', payment_date: '', amount_received: '', payment_reference: '' })
      fetchData()
    } catch (error) { console.error(error); alert('Failed to create payment') }
    finally { setSaving(false) }
  }

  const verifyPayment = async (paymentId: string, status: 'verified' | 'rejected') => {
    await supabase.from('payments').update({ payment_status: status, verified_by: user?.id || null }).eq('id', paymentId)
    fetchData()
  }

  const filteredPayments = payments.filter(p => p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()))

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800', partial: 'bg-orange-100 text-orange-800',
    received: 'bg-blue-100 text-blue-800', verified: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Finance Verification</h1><p className="text-slate-500">Verify and track payments</p></div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors">Record Payment</button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" placeholder="Search by client name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>{['Client', 'Expected', 'Received', 'Date', 'Reference', 'Status', 'Actions'].map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">{payment.client_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">₹{payment.expected_amount?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">₹{payment.amount_received?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{payment.payment_date || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{payment.payment_reference || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[payment.payment_status] || 'bg-slate-100'}`}>{payment.payment_status}</span>
                  </td>
                  <td className="px-6 py-4">
                    {payment.payment_status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => verifyPayment(payment.id, 'verified')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve"><Check className="w-5 h-5" /></button>
                        <button onClick={() => verifyPayment(payment.id, 'rejected')} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Reject"><X className="w-5 h-5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPayments.length === 0 && <div className="p-12 text-center text-slate-500">No payments found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Record Payment</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Order *</label>
                <select required value={formData.client_order_id} onChange={(e) => setFormData({ ...formData, client_order_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select an order</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.client_name} - ₹{o.gross_revenue?.toLocaleString()}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received (₹)</label>
                  <input type="number" step="0.01" value={formData.amount_received} onChange={(e) => setFormData({ ...formData, amount_received: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                  <input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Reference</label>
                <input type="text" placeholder="Transaction ID / UTR" value={formData.payment_reference} onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Verify Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
