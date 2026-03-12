import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { 
  LayoutDashboard, ShoppingCart, Truck, TrendingUp, 
  DollarSign, FileCheck, Package, Archive,
  BarChart3, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Client Orders', href: '/client-orders', icon: ShoppingCart },
  { name: 'Supplier Purchase', href: '/supplier-purchase', icon: Truck },
  { name: 'Hedge Entry', href: '/hedge-entry', icon: TrendingUp },
  { name: 'Trade Tracking', href: '/trade-tracking', icon: DollarSign },
  { name: 'Finance Verification', href: '/finance', icon: FileCheck },
  { name: 'Delivery Orders', href: '/delivery-orders', icon: Package },
  { name: 'Reconciliation', href: '/reconciliation', icon: FileCheck },
  { name: 'Vault Inventory', href: '/vault', icon: Archive },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
]

export default function MainLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const roleLabels: Record<string, string> = {
    trading_agent: 'Trading Agent',
    finance: 'Finance Team',
    reconciliation: 'Operations',
    vault: 'Vault Team',
    management: 'Management'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900">
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <span className="text-xl font-bold text-amber-400">SafeGold</span>
                <button onClick={() => setSidebarOpen(false)}>
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {navigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center px-4 py-3 rounded-lg transition-colors ${
                        isActive ? 'bg-amber-500 text-slate-900' : 'text-slate-300 hover:bg-slate-800'
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 lg:bg-slate-900 lg:border-r lg:border-slate-800">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <span className="text-xl font-bold text-amber-400">SafeGold</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-amber-500 text-slate-900' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-slate-900">
                {user?.full_name?.[0] || user?.email?.[0] || 'U'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user?.full_name || user?.email}</p>
              <p className="text-xs text-slate-400">{user?.role && roleLabels[user.role]}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center w-full px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <span className="text-lg font-bold text-amber-600">SafeGold</span>
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </div>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
