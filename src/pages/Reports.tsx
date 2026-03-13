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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Management Reports</h1><p className="text-slate-500">Analytics and insights</p></div>
        <button onClick={exportReport} className="inline-flex items-center px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors">
          <Download className="w-5 h-5 mr-2" />Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Orders', value: totalOrders },
          { label: 'Total Grams', value: `${(totalGrams / 1000).toFixed(2)} kg` },
          { label: 'Total Revenue', value: `₹${(totalRevenue / 100000).toFixed(2)}L` },
          { label: 'Trade Margin', value: `₹${(totalMargin / 100000).toFixed(2)}L`, green: true },
          { label: 'Margin %', value: `${totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : 0}%`, green: true },
        ].map(({ label, value, green }) => (
          <div key={label} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${green ? 'text-green-600' : 'text-slate-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
          <p className="text-amber-800 font-medium">Pending Payments</p>
          <p className="text-4xl font-bold text-amber-600 mt-2">{pendingPayments}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
          <p className="text-blue-800 font-medium">Pending Deliveries</p>
          <p className="text-4xl font-bold text-blue-600 mt-2">{pendingDeliveries}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-6">Orders per Day (Last 7 Days)</h2>
        <div className="flex items-end justify-between gap-4 h-48">
          {chartData.map((day, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center">
                <div className="w-full max-w-12 bg-gradient-to-t from-amber-500 to-amber-400 rounded-t transition-all"
                  style={{ height: `${(day.orders / maxOrders) * 140}px`, minHeight: day.orders > 0 ? '8px' : '0' }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">{day.label}</p>
              <p className="text-sm font-medium text-slate-700">{day.orders}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Order Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[
            { status: 'pending_supplier_booking', label: 'Pending Booking', color: 'bg-yellow-500' },
            { status: 'pending_hedge', label: 'Pending Hedge', color: 'bg-blue-500' },
            { status: 'pending_payment', label: 'Pending Payment', color: 'bg-amber-500' },
            { status: 'payment_verified', label: 'Payment Verified', color: 'bg-green-500' },
            { status: 'do_created', label: 'DO Created', color: 'bg-purple-500' },
          ].map(item => {
            const count = orders.filter(o => o.trade_status === item.status).length
            return (
              <div key={item.status} className="text-center p-4 bg-slate-50 rounded-lg">
                <div className={`w-3 h-3 rounded-full ${item.color} mx-auto mb-2`}></div>
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
