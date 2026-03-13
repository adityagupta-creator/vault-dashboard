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
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Reconciliation</h1>
      </div>
      {pendingOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {pendingOrders.map(order => (
              <div key={order.id} className="flex items-center gap-2 bg-white rounded px-2 py-1 text-xs">
                <span className="font-medium text-slate-900">{order.client_name}</span>
                <span className="text-slate-500">{order.grams}g - {order.order_date}</span>
                <button onClick={() => createReconciliation(order.id)} className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded">Reconcile</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>
      <div className="bg-white rounded border border-slate-200 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="table-excel">
            <thead className="sticky top-0 z-10">
              <tr>{['Client', 'Date', 'Grams', 'Trade', 'Invoice', 'DO', 'Status'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredRecons.map((recon) => {
                const order = getOrder(recon.client_order_id)
                return (
                  <tr key={recon.id}>
                    <td className="text-slate-900">{order?.client_name || '-'}</td>
                    <td className="text-slate-600">{order?.order_date || '-'}</td>
                    <td className="text-slate-600">{order?.grams || '-'}g</td>
                    <td>{recon.agent_trade_sheet_match ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}</td>
                    <td>{recon.issued_invoice_match ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}</td>
                    <td>{recon.delivery_order_match ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${recon.reconciliation_status === 'matched' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{recon.reconciliation_status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRecons.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No reconciliations found</div>}
      </div>
    </div>
  )
}
