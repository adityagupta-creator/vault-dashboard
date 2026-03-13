import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Search, Check, X } from 'lucide-react'
import type { ClientOrder, Reconciliation } from '../types'

export default function ReconciliationPage() {
  const { user } = useAuthStore()
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [reconRes, ordersRes] = await Promise.all([
        withTimeout(supabase.from('reconciliations').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('client_orders').select('*').in('trade_status', ['do_created', 'in_delivery', 'reconciliation_pending']))
      ])
      setReconciliations(reconRes.data || [])
      setOrders(ordersRes.data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const createReconciliation = async (orderId: string) => {
    await Promise.all([
      supabase.from('reconciliations').insert({
        client_order_id: orderId, agent_trade_sheet_match: true, issued_invoice_match: true,
        delivery_order_match: true, reconciliation_status: 'matched', reconciled_by: user?.id || null,
      }),
      supabase.from('client_orders').update({ trade_status: 'closed' }).eq('id', orderId)
    ])
    fetchData()
  }

  const getOrder = (id: string) => orders.find(o => o.id === id)
  const filteredRecons = reconciliations.filter(r => getOrder(r.client_order_id)?.client_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  const pendingOrders = orders.filter(o => !reconciliations.some(r => r.client_order_id === o.id))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Reconciliation</h1><p className="text-slate-500">Match orders with invoices and delivery orders</p></div>

      {pendingOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-4">Pending Reconciliation</h2>
          <div className="space-y-2">
            {pendingOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between bg-white rounded-lg p-4">
                <div>
                  <p className="font-medium text-slate-900">{order.client_name}</p>
                  <p className="text-sm text-slate-500">{order.grams}g - {order.order_date}</p>
                </div>
                <button onClick={() => createReconciliation(order.id)} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">Reconcile</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" placeholder="Search reconciliations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>{['Client', 'Order Date', 'Grams', 'Trade Sheet', 'Invoice', 'DO Match', 'Status'].map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRecons.map((recon) => {
                const order = getOrder(recon.client_order_id)
                return (
                  <tr key={recon.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900">{order?.client_name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{order?.order_date || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{order?.grams || '-'}g</td>
                    <td className="px-6 py-4">{recon.agent_trade_sheet_match ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-red-500" />}</td>
                    <td className="px-6 py-4">{recon.issued_invoice_match ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-red-500" />}</td>
                    <td className="px-6 py-4">{recon.delivery_order_match ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-red-500" />}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${recon.reconciliation_status === 'matched' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{recon.reconciliation_status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRecons.length === 0 && <div className="p-12 text-center text-slate-500">No reconciliations found</div>}
      </div>
    </div>
  )
}
