/**
 * Domain-specific hooks backed by the cloud app_settings table.
 * Uses a single batched fetch for all settings and one Realtime channel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface HardikCustomColumn {
  id: string
  name: string
  position: number
}

type SettingsMap = Record<string, unknown>

const POLL_INTERVAL_MS = 30_000

let globalCache: SettingsMap | null = null
let globalLoading = false
let globalFetched = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

async function fetchAllSettings(): Promise<SettingsMap> {
  const { data, error } = await withTimeout(
    supabase.from('app_settings').select('key, value'),
    5_000
  )
  if (error) throw error
  const map: SettingsMap = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }
  return map
}

async function loadSettings() {
  if (globalLoading) return
  globalLoading = true
  notify()
  try {
    globalCache = await fetchAllSettings()
    globalFetched = true
  } catch (e) {
    console.error('[useAppSettings] batch fetch:', e)
    globalFetched = true
  } finally {
    globalLoading = false
    notify()
  }
}

let channelRef: RealtimeChannel | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0

function subscribe() {
  subscriberCount++
  if (subscriberCount === 1) {
    if (!globalFetched) loadSettings()

    channelRef = supabase
      .channel('app-settings-batch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'key' in payload.new && 'value' in payload.new) {
            const { key, value } = payload.new as { key: string; value: unknown }
            globalCache = { ...globalCache, [key]: value }
            notify()
          }
        }
      )
      .subscribe()

    pollTimer = setInterval(loadSettings, POLL_INTERVAL_MS)
  }
}

function unsubscribe() {
  subscriberCount--
  if (subscriberCount <= 0) {
    subscriberCount = 0
    if (channelRef) {
      supabase.removeChannel(channelRef)
      channelRef = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

function useSetting<T>(key: string, defaultValue: T): [T, (v: T) => Promise<void>, boolean] {
  const [, forceRender] = useState(0)
  const listenerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1)
    listenerRef.current = listener
    listeners.add(listener)
    subscribe()

    return () => {
      listeners.delete(listener)
      unsubscribe()
    }
  }, [])

  const value: T = globalCache && key in globalCache
    ? (globalCache[key] as T)
    : defaultValue

  const loading = !globalFetched

  const setValue = useCallback(
    async (newValue: T) => {
      globalCache = { ...globalCache, [key]: newValue }
      notify()
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

  return [value, setValue, loading]
}

/**
 * Cloud-backed custom columns for Hardik Coin.
 */
export function useCustomColumns() {
  const [columns, setColumns, loading] = useSetting<HardikCustomColumn[]>(
    'hardik_custom_columns',
    []
  )

  const addColumn = useCallback(
    async (name: string, position: number) => {
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const col: HardikCustomColumn = { id, name, position }
      const updated = [...columns, col].sort((a, b) => a.position - b.position)
      await setColumns(updated)
      return col
    },
    [columns, setColumns]
  )

  const renameColumn = useCallback(
    async (id: string, name: string) => {
      const updated = columns.map((c) => (c.id === id ? { ...c, name } : c))
      await setColumns(updated)
    },
    [columns, setColumns]
  )

  const deleteColumn = useCallback(
    async (id: string) => {
      const updated = columns.filter((c) => c.id !== id)
      await setColumns(updated)
    },
    [columns, setColumns]
  )

  return [columns, { addColumn, renameColumn, deleteColumn, setColumns }, loading] as const
}

/**
 * Cloud-backed row order for Hardik Coin.
 */
export function useRowOrder() {
  const [rowOrder, setRowOrder, loading] = useSetting<string[]>(
    'hardik_row_order',
    []
  )
  return [rowOrder, setRowOrder, loading] as const
}

/**
 * Cloud-backed latest import highlight IDs.
 */
export function useLatestImportIds() {
  const [ids, setIds, loading] = useSetting<string[]>(
    'hardik_latest_import_ids',
    []
  )
  const idSet = useMemo(() => new Set(ids), [ids])
  return [idSet, setIds, loading] as const
}

/**
 * Cloud-backed notification email recipients.
 */
export function useNotificationEmails() {
  const [emails, setEmails, loading] = useSetting<string[]>(
    'notification_emails',
    []
  )

  const addEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim().toLowerCase()
      if (!trimmed || emails.includes(trimmed)) return
      await setEmails([...emails, trimmed])
    },
    [emails, setEmails]
  )

  const removeEmail = useCallback(
    async (email: string) => {
      await setEmails(emails.filter((e) => e !== email))
    },
    [emails, setEmails]
  )

  return [emails, { addEmail, removeEmail, setEmails }, loading] as const
}
