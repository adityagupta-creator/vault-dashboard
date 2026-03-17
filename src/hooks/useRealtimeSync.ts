/**
 * Generic Supabase Realtime + polling hooks.
 * Provides real-time table subscriptions with a periodic polling fallback.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import type { RealtimeChannel } from '@supabase/supabase-js'

const POLL_INTERVAL_MS = 30_000
const INITIAL_FETCH_TIMEOUT_MS = 12_000

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

/**
 * Subscribe to a single key in the app_settings table.
 * Returns [value, setValue, loading].
 */
export function useAppSetting<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const initialFetchDone = useRef(false)

  const fetchSetting = useCallback(async () => {
    try {
      const timeout = initialFetchDone.current ? undefined : INITIAL_FETCH_TIMEOUT_MS
      const { data, error } = await withTimeout(
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle(),
        timeout
      )
      if (error) throw error
      if (data?.value != null) {
        setValueState(data.value as T)
      }
    } catch (e) {
      console.error(`[useAppSetting] fetch ${key}:`, e)
    } finally {
      initialFetchDone.current = true
      setLoading(false)
    }
  }, [key])

  const setValue = useCallback(
    async (newValue: T) => {
      setValueState(newValue)
      try {
        const { error } = await supabase
          .from('app_settings')
          .upsert(
            { key, value: newValue as any, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
        if (error) throw error
      } catch (e) {
        console.error(`[useAppSetting] upsert ${key}:`, e)
      }
    },
    [key]
  )

  useEffect(() => {
    fetchSetting()

    const channel = supabase
      .channel(`app-setting-${key}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: `key=eq.${key}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'value' in payload.new) {
            setValueState((payload.new as { value: T }).value)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    const timer = setInterval(fetchSetting, POLL_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [key, fetchSetting])

  return [value, setValue, loading]
}
