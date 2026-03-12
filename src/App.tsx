import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { useEffect } from 'react'
import { supabase } from './api/supabase'

import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import ClientOrdersPage from './pages/ClientOrders'
import SupplierPurchasePage from './pages/SupplierPurchase'
import HedgeEntryPage from './pages/HedgeEntry'
import TradeTrackingPage from './pages/TradeTracking'
import FinancePage from './pages/Finance'
import DeliveryOrdersPage from './pages/DeliveryOrders'
import ReconciliationPage from './pages/Reconciliation'
import VaultPage from './pages/Vault'
import ReportsPage from './pages/Reports'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (profile) setUser(profile)
        }
      } catch (error) {
        console.error('Auth init error:', error)
      } finally {
        setLoading(false)
      }
    }
    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (profile) setUser(profile)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="client-orders" element={<ClientOrdersPage />} />
          <Route path="supplier-purchase" element={<SupplierPurchasePage />} />
          <Route path="hedge-entry" element={<HedgeEntryPage />} />
          <Route path="trade-tracking" element={<TradeTrackingPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="delivery-orders" element={<DeliveryOrdersPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="vault" element={<VaultPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
