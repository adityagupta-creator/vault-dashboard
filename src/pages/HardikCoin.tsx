import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { Search, RefreshCw, Truck } from 'lucide-react'
import { extractCity, salesPersonFor } from '../lib/hardikUtils'
import type { ClientOrder, SupplierPurchase } from '../types'

/** 26-column Hardik Coin layout – full trade sheet with purchase side */
const COLS = [
  'Date',
  'Time',
  'Delivery Date',
  'Purity',
  'Party Name',
  'Symbol',
  'Qty Sold',
  'Grams',
  'Quoted Rate',
  'Net Revenue',
  'GST',
  'TCS',
  'Gross Revenue',
  'Qty Bought',
  'Trade Booked',
  'Making Charges',
  'Net Purchase',
  'GST (2%)',
  'Gross Purchase',
  'Supplier Name',
  'Trade Margin',
  'Trade Margin %',
  'City',
  'Trade Status',
  'Sales Person',
]

type Row = {
  order: ClientOrder
  purchase: SupplierPurchase | null
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

export default function HardikCoinPage() {
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [ordersRes, purchasesRes] = await Promise.all([
        withTimeout(supabase.from('client_orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false })),
        withTimeout(supabase.from('supplier_purchases').select('*').order('created_at', { ascending: false })),
      ])
      setOrders(ordersRes.data || [])
      setPurchases(purchasesRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const byOrderId = new Map<string, SupplierPurchase>()
  purchases.forEach((p) => byOrderId.set(p.client_order_id, p))

  const rows: Row[] = orders.map((order) => ({
    order,
    purchase: byOrderId.get(order.id) ?? null,
  }))

  const filtered = rows.filter((r) =>
    r.order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.order.product_symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.purchase?.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (d: string | null) => {
    if (!d) return ''
    const x = new Date(d)
    if (isNaN(x.getTime())) return ''
    const day = String(x.getDate()).padStart(2, '0')
    const month = String(x.getMonth() + 1).padStart(2, '0')
    return `${day}.${month}.${x.getFullYear()}`
  }

  const formatTime = (t: string | null) => t || ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hardik Coin</h1>
          <p className="text-slate-500">Full trade sheet with purchase side</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/supplier-purchase"
            className="inline-flex items-center px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors"
          >
            <Truck className="w-5 h-5 mr-2" />
            Supplier Purchase
          </Link>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by client, symbol or supplier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-[#1F4E79]">
              <tr>
                {COLS.map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-white uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map(({ order, purchase }) => {
                const nr = toNum(order.net_revenue)
                const np = toNum(purchase?.net_purchase)
                const margin = nr && np ? nr - np : null
                const marginPct = nr && margin != null ? (margin / nr) * 100 : null

                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{formatDate(order.order_date)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatTime(order.order_time)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                    <td className="px-3 py-2 text-slate-600">{order.purity ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 font-medium">{order.client_name}</td>
                    <td className="px-3 py-2 text-slate-600">{order.product_symbol ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">{order.quantity ?? 1}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">{order.grams}g</td>
                    <td className="px-3 py-2 text-slate-900 text-right">₹{order.quoted_rate?.toLocaleString() ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">₹{nr ? nr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className="px-3 py-2 text-slate-600 text-right">₹{order.gst_amount?.toLocaleString() ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-600 text-right">₹{order.tcs_amount?.toLocaleString() ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">₹{order.gross_revenue?.toLocaleString() ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">{order.grams}</td>
                    <td className="px-3 py-2 text-slate-600 text-right">{purchase ? `₹${(purchase.supplier_rate ?? 0).toLocaleString()}/10g` : '-'}</td>
                    <td className="px-3 py-2 text-slate-600 text-right">{purchase ? `₹${(purchase.supplier_making_charges ?? 0).toLocaleString()}` : '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">
                      {purchase && purchase.net_purchase != null ? `₹${purchase.net_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-right">
                      {purchase && purchase.gst_2 != null ? `₹${purchase.gst_2.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-900 text-right">
                      {purchase && purchase.gross_purchase != null ? `₹${purchase.gross_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-900">{purchase?.supplier_name ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-900 text-right">
                      {margin != null ? `₹${margin.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-right">
                      {marginPct != null ? `${marginPct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {order.city || extractCity(order.product_symbol) || '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-slate-600">{order.trade_status?.replace(/_/g, ' ') ?? '-'}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {salesPersonFor(order.product_symbol) || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-500">No trades found</div>
        )}
      </div>
    </div>
  )
}
