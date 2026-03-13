import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { Download } from 'lucide-react'
import type { ClientOrder } from '../types'

export default function ReportsPage() {
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const { data } = await withTimeout(supabase.from('client_orders').select('*').order('created_at', { ascending: false }))
      setOrders(data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  const totalOrders = orders.length
  const totalGrams = orders.reduce((sum, o) => sum + o.grams, 0)
  const totalRevenue = orders.reduce((sum, o) => sum + (o.gross_revenue || 0), 0)
  const totalPurchase = orders.reduce((sum, o) => sum + (o.net_revenue ? o.net_revenue * 0.85 : 0), 0)
  const totalMargin = totalRevenue - totalPurchase
  const pendingPayments = orders.filter(o => o.trade_status === 'pending_payment').length
  const pendingDeliveries = orders.filter(o => ['do_created', 'in_delivery'].includes(o.trade_status)).length

  const ordersByDay = orders.reduce((acc: Record<string, number>, order) => {
    const date = order.order_date; acc[date] = (acc[date] || 0) + 1; return acc
  }, {})

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })
  const chartData = last7Days.map(date => ({ date, orders: ordersByDay[date] || 0, label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }) }))
  const maxOrders = Math.max(...chartData.map(d => d.orders), 1)

  const exportReport = () => {
    const headers = ['Order #', 'Client', 'Date', 'Grams', 'Revenue', 'Status']
    const rows = orders.map(o => [o.order_number || '', o.client_name, o.order_date, o.grams, o.gross_revenue || 0, o.trade_status])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'safegold_report.csv'; a.click()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-1">
      <div className="flex items-center justify-between flex-shrink-0 py-0.5">
        <h1 className="text-sm font-semibold text-slate-900">Reports</h1>
        <button onClick={exportReport} className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-green-500 hover:bg-green-600 text-white font-medium rounded">
          <Download className="w-4 h-4 mr-1" />Export
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 flex-shrink-0">
        {[
          { label: 'Orders', value: totalOrders },
          { label: 'Grams', value: `${(totalGrams / 1000).toFixed(2)} kg` },
          { label: 'Revenue', value: `₹${(totalRevenue / 100000).toFixed(2)}L` },
          { label: 'Margin', value: `₹${(totalMargin / 100000).toFixed(2)}L`, green: true },
          { label: 'Margin %', value: `${totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : 0}%`, green: true },
        ].map(({ label, value, green }) => (
          <div key={label} className="bg-white rounded p-1.5 border border-slate-200">
            <p className="text-[9px] text-slate-500">{label}</p>
            <p className={`text-xs font-bold ${green ? 'text-green-600' : 'text-slate-900'}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 flex-shrink-0">
        <div className="bg-amber-50 rounded p-2 border border-amber-200">
          <p className="text-[10px] text-amber-800 font-medium">Pending Payments</p>
          <p className="text-xl font-bold text-amber-600">{pendingPayments}</p>
        </div>
        <div className="bg-blue-50 rounded p-2 border border-blue-200">
          <p className="text-[10px] text-blue-800 font-medium">Pending Deliveries</p>
          <p className="text-xl font-bold text-blue-600">{pendingDeliveries}</p>
        </div>
      </div>
      <div className="bg-white rounded border border-slate-200 p-2 flex-1 min-h-0 flex flex-col">
        <h2 className="text-xs font-semibold text-slate-900 mb-2">Orders (Last 7 Days)</h2>
        <div className="flex items-end justify-between gap-2 flex-1 min-h-[80px]">
          {chartData.map((day, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center flex-1 justify-end">
                <div className="w-full max-w-8 bg-amber-500 rounded-t"
                  style={{ height: `${(day.orders / maxOrders) * 100}%`, minHeight: day.orders > 0 ? '4px' : '0' }}></div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{day.label}</p>
              <p className="text-xs font-medium text-slate-700">{day.orders}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded border border-slate-200 p-2 flex-shrink-0">
        <h2 className="text-xs font-semibold text-slate-900 mb-2">Status Breakdown</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { status: 'pending_supplier_booking', label: 'Booking', color: 'bg-yellow-500' },
            { status: 'pending_hedge', label: 'Hedge', color: 'bg-blue-500' },
            { status: 'pending_payment', label: 'Payment', color: 'bg-amber-500' },
            { status: 'payment_verified', label: 'Verified', color: 'bg-green-500' },
            { status: 'do_created', label: 'DO', color: 'bg-purple-500' },
          ].map(item => {
            const count = orders.filter(o => o.trade_status === item.status).length
            return (
              <div key={item.status} className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded text-xs">
                <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                <span className="font-bold text-slate-900">{count}</span>
                <span className="text-slate-500">{item.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
