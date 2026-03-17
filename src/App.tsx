import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { useEffect, useState } from 'react'
import { supabase } from './api/supabase'

import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import ClientOrdersPage from './pages/ClientOrders'
import HardikCoinPage from './pages/HardikCoin'
import VaultPage from './pages/Vault'
import SettingsPage from './pages/Settings'

const AUTH_TIMEOUT_MS = 8_000

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!isLoading) return
    const t = setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [isLoading])

  if (isLoading && !timedOut) return (
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) setUser(null)
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [setUser])

  useEffect(() => {
    let isMounted = true
    let subscription: { unsubscribe: () => void } | null = null
    let safetyTimer: ReturnType<typeof setTimeout> | null = null

    const initAuth = async () => {
      try {
        const hasPersistedUser = useAuthStore.getState().user != null
        if (!hasPersistedUser) setLoading(true)

        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        if (session?.user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (profile && isMounted) setUser(profile)
        } else {
          if (isMounted) setUser(null)
        }
      } catch (error) {
        console.error('Auth init error:', error)
        if (isMounted) setUser(null)
      } finally {
        if (isMounted) setLoading(false)
      }

      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (profile && isMounted) setUser(profile)
        } else {
          if (isMounted) setUser(null)
        }
        if (isMounted) setLoading(false)
      })
      subscription = data.subscription
    }

    safetyTimer = setTimeout(() => {
      if (isMounted && useAuthStore.getState().isLoading) {
        console.warn('Auth init safety timeout reached, forcing loading=false')
        setLoading(false)
      }
    }, AUTH_TIMEOUT_MS)

    initAuth()

    return () => {
      isMounted = false
      subscription?.unsubscribe()
      if (safetyTimer) clearTimeout(safetyTimer)
    }
  }, [setUser, setLoading])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="client-orders" element={<ClientOrdersPage />} />
          <Route path="hardik-coin" element={<HardikCoinPage />} />
          <Route path="vault" element={<VaultPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
