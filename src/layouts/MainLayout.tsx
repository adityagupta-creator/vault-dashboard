import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { usePermissionsStore } from '../store/permissions'
import { 
  LayoutDashboard, ShoppingCart, Archive, FileSpreadsheet,
  LogOut, Menu, X, PanelLeftClose, PanelLeftOpen, Settings, Shield, Loader2
} from 'lucide-react'
import { useState, useMemo } from 'react'

const allNavigation = [
  { name: 'Dashboard', href: '/', slug: 'dashboard', icon: LayoutDashboard },
  { name: 'Hardik Coin', href: '/hardik-coin', slug: 'hardik-coin', icon: FileSpreadsheet },
  { name: 'Meghna - Client Orders', href: '/client-orders', slug: 'client-orders', icon: ShoppingCart },
  { name: 'Vault Inventory', href: '/vault', slug: 'vault', icon: Archive },
  { name: 'Settings', href: '/settings', slug: 'settings', icon: Settings },
  { name: 'Admin Panel', href: '/admin', slug: 'admin', icon: Shield },
]

export default function MainLayout() {
  const { user, signOut } = useAuthStore()
  const allowedSlugs = usePermissionsStore((s) => s.allowedSlugs)
  const permsFetched = usePermissionsStore((s) => s.fetched)
  const permsLoading = usePermissionsStore((s) => s.loading)
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const sidebarReady = permsFetched && !permsLoading

  const navigation = useMemo(() => {
    if (user?.role === 'admin') return allNavigation
    if (!sidebarReady) return []
    return allNavigation.filter((item) => allowedSlugs.includes(item.slug))
  }, [user, allowedSlugs, sidebarReady])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const roleLabel = user?.role === 'admin' ? 'Admin' : 'User'

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
                {!sidebarReady ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                  </div>
                ) : navigation.map((item) => (
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
      <div className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:bg-slate-900 lg:border-r lg:border-slate-800 transition-all ${sidebarCollapsed ? 'lg:w-14' : 'lg:w-48'}`}>
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} px-3 py-2 border-b border-slate-800`}>
          {sidebarCollapsed ? (
            <span className="text-sm font-bold text-amber-400">SG</span>
          ) : (
            <span className="text-base font-bold text-amber-400">SafeGold</span>
          )}
        </div>
        <nav className="flex-1 px-2 py-1.5 space-y-0.5 overflow-y-auto">
          {!sidebarReady && user?.role !== 'admin' ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            </div>
          ) : navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `flex items-center rounded transition-colors ${sidebarCollapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2'} text-[11px] ${
                  isActive ? 'bg-amber-500 text-slate-900 font-medium' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
              title={sidebarCollapsed ? item.name : undefined}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-2'}`} />
              {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="px-2 py-2 border-t border-slate-800">
          <div className={`flex items-center mb-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-slate-900">
                {user?.full_name?.[0] || user?.email?.[0] || 'U'}
              </span>
            </div>
            {!sidebarCollapsed && (
              <div className="ml-2 min-w-0 flex-1">
                <p className="text-[11px] font-medium text-white truncate">{user?.full_name || user?.email}</p>
                <p className="text-[10px] text-slate-400">{roleLabel}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={`flex items-center w-full px-2 py-1.5 text-[11px] text-slate-400 hover:text-white transition-colors rounded ${sidebarCollapsed ? 'justify-center' : ''}`}
            title="Sign Out"
          >
            <LogOut className={`w-4 h-4 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-2'}`} />
            {!sidebarCollapsed && 'Sign Out'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all flex flex-col min-h-screen ${sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-48'}`}>
        <div className="hidden lg:flex items-center justify-between px-2 py-1 bg-white border-b border-slate-200">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          <div />
        </div>
        <div className="lg:hidden flex items-center justify-between px-2 py-1.5 bg-white border-b border-slate-200">
          <span className="text-base font-bold text-amber-600">SafeGold</span>
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <main className="px-1.5 py-1 flex-1 flex flex-col min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
