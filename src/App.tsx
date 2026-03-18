import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { usePermissionsStore, subscribeToPermissionChanges } from './store/permissions'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './api/supabase'

// One-time cleanup of old localStorage keys from previous versions
try {
  ['safegold-auth', 'sb-wmvgvwqvmukbclemxrif-auth-token', 'safegold-last-seen'].forEach(
    (key) => localStorage.removeItem(key)
  )
} catch { /* ignore in environments without localStorage */ }

import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import ClientOrdersPage from './pages/ClientOrders'
import HardikCoinPage from './pages/HardikCoin'
import VaultPage from './pages/Vault'
import SettingsPage from './pages/Settings'
import AdminPage from './pages/Admin'
import AccessDenied from './pages/AccessDenied'

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

function PageGuard({ slug, children }: { slug: string; children: React.ReactNode }) {
  const allowedSlugs = usePermissionsStore((s) => s.allowedSlugs)
  const fetched = usePermissionsStore((s) => s.fetched)
  const loading = usePermissionsStore((s) => s.loading)
  const user = useAuthStore((s) => s.user)

  if (!fetched || loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
    </div>
  )

  if (user?.role === 'admin') return <>{children}</>
  if (!allowedSlugs.includes(slug)) return <AccessDenied />
  return <>{children}</>
}

function App() {
  const { setUser, setLoading } = useAuthStore()
  const { fetchPermissions, reset } = usePermissionsStore()
  const permSubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let isMounted = true
    let subscription: { unsubscribe: () => void } | null = null
    let safetyTimer: ReturnType<typeof setTimeout> | null = null

    const loadPermissionsFor = async (userId: string | null) => {
      if (!isMounted) return
      if (userId) {
        await fetchPermissions()
        if (isMounted && !permSubRef.current) {
          permSubRef.current = subscribeToPermissionChanges()
        }
      } else {
        permSubRef.current?.()
        permSubRef.current = null
        reset()
      }
    }

    const initAuth = async () => {
      try {
        const hasPersistedUser = useAuthStore.getState().user != null
        if (!hasPersistedUser) setLoading(true)

        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error

        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (profile && isMounted) {
            setUser(profile)
            await loadPermissionsFor(profile.id)
          } else if (isMounted) {
            setUser(null)
            await loadPermissionsFor(null)
          }
        } else {
          if (isMounted) {
            setUser(null)
            await loadPermissionsFor(null)
          }
        }
      } catch (error) {
        console.error('Auth init error:', error)
        if (isMounted) {
          setUser(null)
          await loadPermissionsFor(null)
        }
      } finally {
        if (isMounted) setLoading(false)
      }

      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()
          if (profile && isMounted) {
            setUser(profile)
            await loadPermissionsFor(profile.id)
          }
        } else {
          if (isMounted) {
            setUser(null)
            await loadPermissionsFor(null)
          }
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
      permSubRef.current?.()
      permSubRef.current = null
      if (safetyTimer) clearTimeout(safetyTimer)
    }
  }, [setUser, setLoading, fetchPermissions, reset])

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

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<PageGuard slug="dashboard"><DashboardPage /></PageGuard>} />
          <Route path="client-orders" element={<PageGuard slug="client-orders"><ClientOrdersPage /></PageGuard>} />
          <Route path="hardik-coin" element={<PageGuard slug="hardik-coin"><HardikCoinPage /></PageGuard>} />
          <Route path="vault" element={<PageGuard slug="vault"><VaultPage /></PageGuard>} />
          <Route path="settings" element={<PageGuard slug="settings"><SettingsPage /></PageGuard>} />
          <Route path="admin" element={<PageGuard slug="admin"><AdminPage /></PageGuard>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
