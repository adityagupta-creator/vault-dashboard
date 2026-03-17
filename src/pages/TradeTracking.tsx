import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
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
        withTimeout(supabase.from('client_orders').select('*').order('created_at', { ascending: false })),
        withTimeout(supabase.from('supplier_purchases').select('*')),
        withTimeout(supabase.from('hedges').select('*'))
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
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Trade Tracking</h1>
        <button onClick={exportToCSV} className="inline-flex items-center px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white font-medium rounded transition-colors">
          <Download className="w-4 h-4 mr-1" />Export CSV
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
              <tr>{['Sr.No', 'Date', 'Client', 'Grams', 'Rate', 'Revenue', 'Supplier', 'Purchase', 'Margin', '%'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade, idx) => {
                const netRevenue = trade.order.net_revenue || 0
                const netPurchase = trade.purchase?.net_purchase || 0
                const margin = netRevenue - netPurchase
                const marginPercent = netPurchase > 0 ? (margin / netPurchase * 100) : 0
                return (
                  <tr key={trade.order.id}>
                    <td className="text-slate-600 text-center w-12">{idx + 1}</td>
                    <td className="text-slate-900">{trade.order.order_date}</td>
                    <td className="text-slate-900">{trade.order.client_name}</td>
                    <td className="text-slate-900">{trade.order.grams}g</td>
                    <td className="text-slate-900">₹{trade.order.quoted_rate?.toLocaleString() || '-'}</td>
                    <td className="text-slate-900">₹{netRevenue.toLocaleString()}</td>
                    <td className="text-slate-600">{trade.purchase?.supplier_name || '-'}</td>
                    <td className="text-slate-600">₹{netPurchase.toLocaleString()}</td>
                    <td className={`font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{margin.toLocaleString()}</td>
                    <td className={`font-medium ${marginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{marginPercent.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredTrades.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No trades found</div>}
      </div>
    </div>
  )
}
