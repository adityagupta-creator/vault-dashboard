import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { Search, Download } from 'lucide-react'
import type { ClientOrder, SupplierPurchase, Hedge } from '../types'

interface TradeData { order: ClientOrder; purchase?: SupplierPurchase; hedge?: Hedge }

export default function TradeTrackingPage() {
  const [trades, setTrades] = useState<TradeData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => { fetchTrades() }, [])

  const fetchTrades = async () => {
    try {
      const [ordersRes, purchasesRes, hedgesRes] = await Promise.all([
        supabase.from('client_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('supplier_purchases').select('*'),
        supabase.from('hedges').select('*')
      ])
      const purchases = purchasesRes.data || []
      const hedges = hedgesRes.data || []
      const tradeData: TradeData[] = (ordersRes.data || []).map(order => {
        const purchase = purchases.find(p => p.client_order_id === order.id)
        const hedge = purchase ? hedges.find(h => h.supplier_purchase_id === purchase.id) : undefined
        return { order, purchase, hedge }
      })
      setTrades(tradeData)
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const filteredTrades = trades.filter(t =>
    t.order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.order.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exportToCSV = () => {
    const headers = ['Date', 'Client Name', 'Symbol', 'Grams', 'Quoted Rate', 'Net Revenue', 'Supplier', 'Net Purchase', 'Margin', 'Margin %']
    const rows = filteredTrades.map(t => {
      const netRevenue = t.order.net_revenue || 0
      const netPurchase = t.purchase?.net_purchase || 0
      const margin = netRevenue - netPurchase
      const marginPercent = netPurchase > 0 ? (margin / netPurchase * 100).toFixed(2) : '0'
      return [t.order.order_date, t.order.client_name, t.order.product_symbol || '', t.order.grams, t.order.quoted_rate || '', netRevenue, t.purchase?.supplier_name || '', netPurchase, margin, marginPercent]
    })
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'trade_tracking.csv'; a.click()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Trade Tracking</h1><p className="text-slate-500">Track client orders with supplier mappings</p></div>
        <button onClick={exportToCSV} className="inline-flex items-center px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors">
          <Download className="w-5 h-5 mr-2" />Export CSV
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
              <tr>{['Date', 'Client', 'Grams', 'Rate', 'Revenue', 'Supplier', 'Purchase', 'Margin', '%'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTrades.map((trade) => {
                const netRevenue = trade.order.net_revenue || 0
                const netPurchase = trade.purchase?.net_purchase || 0
                const margin = netRevenue - netPurchase
                const marginPercent = netPurchase > 0 ? (margin / netPurchase * 100) : 0
                return (
                  <tr key={trade.order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 text-sm text-slate-900">{trade.order.order_date}</td>
                    <td className="px-4 py-4 text-sm text-slate-900">{trade.order.client_name}</td>
                    <td className="px-4 py-4 text-sm text-slate-900">{trade.order.grams}g</td>
                    <td className="px-4 py-4 text-sm text-slate-900">₹{trade.order.quoted_rate?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-4 text-sm text-slate-900">₹{netRevenue.toLocaleString()}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{trade.purchase?.supplier_name || '-'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">₹{netPurchase.toLocaleString()}</td>
                    <td className={`px-4 py-4 text-sm font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{margin.toLocaleString()}</td>
                    <td className={`px-4 py-4 text-sm font-medium ${marginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{marginPercent.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredTrades.length === 0 && <div className="p-12 text-center text-slate-500">No trades found</div>}
      </div>
    </div>
  )
}
