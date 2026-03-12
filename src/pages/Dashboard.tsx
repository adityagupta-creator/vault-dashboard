import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { useAuthStore } from '../store/auth'
import { ShoppingCart, Truck, TrendingUp, DollarSign, AlertCircle } from 'lucide-react'

interface Stats {
  totalOrders: number
  pendingPayment: number
  pendingDelivery: number
  totalRevenue: number
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<Stats>({ totalOrders: 0, pendingPayment: 0, pendingDelivery: 0, totalRevenue: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboardData() }, [])

  const fetchDashboardData = async () => {
    try {
      const { data: orders } = await supabase
        .from('client_orders').select('*').order('created_at', { ascending: false }).limit(10)
      if (orders) {
        const pendingPayment = orders.filter(o => o.trade_status === 'pending_payment').length
        const pendingDelivery = orders.filter(o => ['do_created', 'in_delivery', 'reconciliation_pending'].includes(o.trade_status)).length
        const totalRevenue = orders.reduce((sum, o) => sum + (o.gross_revenue || 0), 0)
        setStats({ totalOrders: orders.length, pendingPayment, pendingDelivery, totalRevenue })
        setRecentOrders(orders)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { name: 'Total Orders', value: stats.totalOrders, icon: ShoppingCart, color: 'bg-blue-500' },
    { name: 'Pending Payment', value: stats.pendingPayment, icon: DollarSign, color: 'bg-amber-500' },
    { name: 'Pending Delivery', value: stats.pendingDelivery, icon: Truck, color: 'bg-purple-500' },
    { name: 'Total Revenue', value: `₹${(stats.totalRevenue / 100000).toFixed(2)}L`, icon: TrendingUp, color: 'bg-green-500' },
  ]

  const statusColors: Record<string, string> = {
    pending_supplier_booking: 'bg-yellow-100 text-yellow-800',
    pending_hedge: 'bg-blue-100 text-blue-800',
    pending_payment: 'bg-amber-100 text-amber-800',
    payment_verified: 'bg-green-100 text-green-800',
    do_created: 'bg-purple-100 text-purple-800',
    in_delivery: 'bg-indigo-100 text-indigo-800',
    reconciliation_pending: 'bg-orange-100 text-orange-800',
    closed: 'bg-slate-100 text-slate-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  const roleLabels: Record<string, string> = {
    trading_agent: 'Trading Agent', finance: 'Finance Team',
    reconciliation: 'Operations', vault: 'Vault Team', management: 'Management'
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome back, {user?.full_name || user?.email?.split('@')[0]}</h1>
        <p className="opacity-90">{roleLabels[user?.role || '']} Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{stat.name}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
        </div>
        {recentOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grams</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900">{order.order_number || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{order.client_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{order.grams}g</td>
                    <td className="px-6 py-4 text-sm text-slate-900">₹{order.gross_revenue?.toLocaleString() || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.trade_status] || 'bg-slate-100 text-slate-800'}`}>
                        {order.trade_status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No orders yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
