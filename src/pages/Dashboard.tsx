import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase'
import { AlertTriangle, Bell, BellRing, Loader2 } from 'lucide-react'

const CHECK_WINDOW_HOURS = 24 as const

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

  useEffect(() => {
    const checkForNewOrders = async () => {
      setStatus('checking')
      setErrorMessage(null)

      try {
        const since = new Date(Date.now() - CHECK_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('client_orders')
          .select('id, created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) throw error
        setStatus((data?.length ?? 0) > 0 ? 'new' : 'none')
      } catch (error) {
        console.error('Error checking for new orders:', error)
        setStatus('error')
        setErrorMessage('Unable to check orders right now.')
      } finally {
        setLastChecked(new Date())
      }
    }

    void checkForNewOrders()
  }, [])

  const lastCheckedLabel = lastChecked ? lastChecked.toLocaleString() : '-'
  const statusConfig: Record<OrderStatus, StatusConfig> = {
    checking: {
      title: 'Checking for new orders',
      subtitle: `Looking at the last ${CHECK_WINDOW_HOURS} hours`,
      icon: Loader2,
      tone: 'text-slate-500',
      iconWrap: 'bg-slate-700 text-white',
      spin: true,
    },
    new: {
      title: 'New orders received',
      subtitle: `At least one order in the last ${CHECK_WINDOW_HOURS} hours`,
      icon: BellRing,
      tone: 'text-emerald-700',
      iconWrap: 'bg-emerald-600 text-white',
    },
    none: {
      title: 'No new orders',
      subtitle: `No orders in the last ${CHECK_WINDOW_HOURS} hours`,
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
            Window: last {CHECK_WINDOW_HOURS} hours
          </div>
        </div>
      </div>
    </div>
  )
}
