/**
 * Domain-specific hooks backed by the cloud app_settings table.
 * Replaces all localStorage usage for shared business state.
 */

import { useCallback, useMemo } from 'react'
import { useAppSetting } from './useRealtimeSync'

export interface HardikCustomColumn {
  id: string
  name: string
  position: number
}

/**
 * Cloud-backed custom columns for Hardik Coin.
 * Returns [columns, { addColumn, renameColumn, deleteColumn, setColumns }]
 */
export function useCustomColumns() {
  const [columns, setColumns, loading] = useAppSetting<HardikCustomColumn[]>(
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
  const [rowOrder, setRowOrder, loading] = useAppSetting<string[]>(
    'hardik_row_order',
    []
  )
  return [rowOrder, setRowOrder, loading] as const
}

/**
 * Cloud-backed latest import highlight IDs, shared across all users.
 */
export function useLatestImportIds() {
  const [ids, setIds, loading] = useAppSetting<string[]>(
    'hardik_latest_import_ids',
    []
  )

  const idSet = useMemo(() => new Set(ids), [ids])

  return [idSet, setIds, loading] as const
}
