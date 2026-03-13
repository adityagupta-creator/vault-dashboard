import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { Search, RefreshCw, Truck } from 'lucide-react'
import { extractCity, salesPersonFor } from '../lib/hardikUtils'
import type { ClientOrder, SupplierPurchase } from '../types'

/** 27-column Hardik Coin layout – full trade sheet with purchase side */
const COLS = [
  'Sr.No',
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
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Hardik Coin</h1>
        <div className="flex items-center gap-2">
          <Link to="/supplier-purchase" className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors">
            <Truck className="w-4 h-4 mr-1" />Supplier
          </Link>
          <button onClick={fetchData} className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors">
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
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
          <table className="table-excel w-full min-w-[1200px] [&_thead_th]:bg-[#1F4E79] [&_thead_th]:text-white [&_thead_th]:border-slate-600">
            <thead className="sticky top-0 z-10">
              <tr>
                {COLS.map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left text-[10px] font-medium text-white uppercase whitespace-nowrap border border-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ order, purchase }, idx) => {
                const nr = toNum(order.net_revenue)
                const np = toNum(purchase?.net_purchase)
                const margin = nr && np ? nr - np : null
                const marginPct = nr && margin != null ? (margin / nr) * 100 : null

                return (
                  <tr key={order.id}>
                    <td className="text-slate-600 text-center w-12 whitespace-nowrap">{idx + 1}</td>
                    <td className="text-slate-900 whitespace-nowrap">{formatDate(order.order_date)}</td>
                    <td className=" text-slate-600 whitespace-nowrap">{formatTime(order.order_time)}</td>
                    <td className=" text-slate-600 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                    <td className=" text-slate-600">{order.purity ?? '-'}</td>
                    <td className=" text-slate-900 font-medium">{order.client_name}</td>
                    <td className=" text-slate-600">{order.product_symbol ?? '-'}</td>
                    <td className=" text-slate-900 text-right">{order.quantity ?? 1}</td>
                    <td className=" text-slate-900 text-right">{order.grams}g</td>
                    <td className=" text-slate-900 text-right">₹{order.quoted_rate?.toLocaleString() ?? '-'}</td>
                    <td className=" text-slate-900 text-right">₹{nr ? nr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className=" text-slate-600 text-right">₹{order.gst_amount?.toLocaleString() ?? '-'}</td>
                    <td className=" text-slate-600 text-right">₹{order.tcs_amount?.toLocaleString() ?? '-'}</td>
                    <td className=" text-slate-900 text-right">₹{order.gross_revenue?.toLocaleString() ?? '-'}</td>
                    <td className=" text-slate-900 text-right">{order.grams}</td>
                    <td className=" text-slate-600 text-right">{purchase ? `₹${(purchase.supplier_rate ?? 0).toLocaleString()}/10g` : '-'}</td>
                    <td className=" text-slate-600 text-right">{purchase ? `₹${(purchase.supplier_making_charges ?? 0).toLocaleString()}` : '-'}</td>
                    <td className=" text-slate-900 text-right">
                      {purchase && purchase.net_purchase != null ? `₹${purchase.net_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className=" text-slate-600 text-right">
                      {purchase && purchase.gst_2 != null ? `₹${purchase.gst_2.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className=" text-slate-900 text-right">
                      {purchase && purchase.gross_purchase != null ? `₹${purchase.gross_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className=" text-slate-900">{purchase?.supplier_name ?? '-'}</td>
                    <td className=" text-slate-900 text-right">
                      {margin != null ? `₹${margin.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className=" text-slate-600 text-right">
                      {marginPct != null ? `${marginPct.toFixed(2)}%` : '-'}
                    </td>
                    <td className=" text-slate-600">
                      {order.city || extractCity(order.product_symbol) || '-'}
                    </td>
                    <td className="">
                      <span className="text-slate-600">{order.trade_status?.replace(/_/g, ' ') ?? '-'}</span>
                    </td>
                    <td className=" text-slate-600">
                      {salesPersonFor(order.product_symbol) || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No trades found</div>}
      </div>
    </div>
  )
}
