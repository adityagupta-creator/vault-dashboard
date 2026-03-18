/**
 * Generic Supabase Realtime + polling hooks.
 * Provides real-time table subscriptions with a periodic polling fallback.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import type { RealtimeChannel } from '@supabase/supabase-js'

const POLL_INTERVAL_MS = 30_000
const INITIAL_FETCH_TIMEOUT_MS = 5_000

/**
 * Subscribe to a Supabase table with Realtime + polling fallback.
 * Returns [data, loading, refetch].
 */
export function useRealtimeTable<T extends { id: string }>(
  table: string,
  options?: {
    orderBy?: { column: string; ascending: boolean }[]
    pollInterval?: number
  }
): [T[], boolean, () => Promise<void>] {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const initialFetchDone = useRef(false)
  const pollMs = options?.pollInterval ?? POLL_INTERVAL_MS

  const fetchAll = useCallback(async () => {
    try {
      let query = supabase.from(table).select('*')
      if (options?.orderBy) {
        for (const o of options.orderBy) {
          query = query.order(o.column, { ascending: o.ascending })
        }
      }
      const timeout = initialFetchDone.current ? undefined : INITIAL_FETCH_TIMEOUT_MS
      const { data: rows, error } = await withTimeout(query, timeout)
      if (error) throw error
      setData((rows as T[]) || [])
    } catch (e) {
      console.error(`[useRealtimeTable] fetch ${table}:`, e)
    } finally {
      initialFetchDone.current = true
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          fetchAll()
        }
      )
      .subscribe()

    channelRef.current = channel

    const timer = setInterval(fetchAll, pollMs)

    return () => {
      clearInterval(timer)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [table, fetchAll, pollMs])

  return [data, loading, fetchAll]
}

