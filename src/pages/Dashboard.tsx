import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { AlertTriangle, Bell, BellRing, Loader2, X } from 'lucide-react'

const CHECK_WINDOW_HOURS = 24 as const
const LAST_SEEN_KEY = 'safegold-orders-last-seen'

type OrderStatus = 'checking' | 'new' | 'none' | 'error'

type StatusConfig = {
  title: string
  subtitle: string
  icon: typeof Bell
  tone: string
  iconWrap: string
  spin?: boolean
}

export default function DashboardPage() {
  const [status, setStatus] = useState<OrderStatus>('checking')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newOrdersCount, setNewOrdersCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [windowLabel, setWindowLabel] = useState(`last ${CHECK_WINDOW_HOURS} hours`)

  useEffect(() => {
    let isMounted = true

    const checkForNewOrders = async () => {
      setStatus('checking')
      setErrorMessage(null)

      try {
        const storedLastSeen = localStorage.getItem(LAST_SEEN_KEY)
        const since = storedLastSeen ?? new Date(Date.now() - CHECK_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
        const label = storedLastSeen ? 'since your last check' : `in the last ${CHECK_WINDOW_HOURS} hours`
        if (isMounted) setWindowLabel(label)

        const { count, error } = await withTimeout(supabase
          .from('client_orders')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since)
          .ilike('remarks', 'Imported from sheet%'))

        if (error) throw error
        const safeCount = count ?? 0
        if (!isMounted) return
        setNewOrdersCount(safeCount)
        const hasNew = safeCount > 0
        setStatus(hasNew ? 'new' : 'none')
        setShowPopup(hasNew)
      } catch (error) {
        console.error('Error checking for new orders:', error)
        if (isMounted) {
          setStatus('error')
          setErrorMessage('Unable to check orders right now.')
        }
      } finally {
        if (isMounted) setLastChecked(new Date())
      }
    }

    void checkForNewOrders()
    const interval = setInterval(checkForNewOrders, 60000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const handleDismissPopup = () => {
    const now = new Date().toISOString()
    localStorage.setItem(LAST_SEEN_KEY, now)
    setShowPopup(false)
    setStatus('none')
    setNewOrdersCount(0)
    setWindowLabel('since your last check')
  }

  const lastCheckedLabel = lastChecked ? lastChecked.toLocaleString() : '-'
  const statusConfig: Record<OrderStatus, StatusConfig> = {
    checking: {
      title: 'Checking for new orders',
      subtitle: `Looking ${windowLabel}`,
      icon: Loader2,
      tone: 'text-slate-500',
      iconWrap: 'bg-slate-700 text-white',
      spin: true,
    },
    new: {
      title: 'New orders received',
      subtitle: `At least one order ${windowLabel}`,
      icon: BellRing,
      tone: 'text-emerald-700',
      iconWrap: 'bg-emerald-600 text-white',
    },
    none: {
      title: 'No new orders',
      subtitle: `No orders ${windowLabel}`,
      icon: Bell,
      tone: 'text-slate-600',
      iconWrap: 'bg-slate-900 text-white',
    },
    error: {
      title: 'Unable to check orders',
      subtitle: errorMessage ?? 'Please try again shortly.',
      icon: AlertTriangle,
      tone: 'text-rose-700',
      iconWrap: 'bg-rose-600 text-white',
    },
  }

  const { title, subtitle, icon: StatusIcon, tone, iconWrap, spin } = statusConfig[status]

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="relative w-full max-w-xl">
        <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-amber-50 via-white to-slate-50 blur-2xl opacity-80" />
        <div className="relative rounded-3xl border border-slate-200 bg-white/80 backdrop-blur px-10 py-12 text-center shadow-sm">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${iconWrap}`}>
            <StatusIcon className={`h-8 w-8 ${spin ? 'animate-spin' : ''}`} />
          </div>
          <div className="mt-6 space-y-3" aria-live="polite">
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${tone}`}>Order Monitor</p>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="mt-8 text-xs text-slate-400">
            <span className="font-medium text-slate-500">Last checked:</span> {lastCheckedLabel}
            <span className="mx-2 text-slate-300">•</span>
            Window: {windowLabel}
          </div>
        </div>
      </div>

      {showPopup && status === 'new' && (
        <div className="fixed right-6 top-6 z-50 w-[320px] rounded-2xl border border-emerald-200 bg-white shadow-lg">
          <div className="flex items-start justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-emerald-700">New orders added</p>
              <p className="text-xs text-slate-500">
                {newOrdersCount} order{newOrdersCount === 1 ? '' : 's'} imported from the latest sheet.
              </p>
            </div>
            <button onClick={handleDismissPopup} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={handleDismissPopup}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Mark as seen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
