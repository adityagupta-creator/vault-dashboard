/**
 * Hardik Coin config: custom columns and row order persisted in localStorage.
 * - hardik_custom_columns: JSON array of { id, name, position }
 * - hardik_row_order: array of client_order_ids for display order
 */

export interface HardikCustomColumn {
  id: string
  name: string
  position: number
}

const CUSTOM_COLUMNS_KEY = 'hardik_custom_columns'
const ROW_ORDER_KEY = 'hardik_row_order'

export function getCustomColumns(): HardikCustomColumn[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLUMNS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setCustomColumns(columns: HardikCustomColumn[]): void {
  localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(columns))
}

export function addCustomColumn(name: string, position: number): HardikCustomColumn {
  const columns = getCustomColumns()
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const col: HardikCustomColumn = { id, name, position }
  columns.push(col)
  columns.sort((a, b) => a.position - b.position)
  setCustomColumns(columns)
  return col
}

export function renameCustomColumn(id: string, name: string): void {
  const columns = getCustomColumns().map((c) => (c.id === id ? { ...c, name } : c))
  setCustomColumns(columns)
}

export function deleteCustomColumn(id: string): void {
  const columns = getCustomColumns().filter((c) => c.id !== id)
  setCustomColumns(columns)
}

export function getRowOrder(): string[] {
  try {
    const raw = localStorage.getItem(ROW_ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setRowOrder(ids: string[]): void {
  localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(ids))
}

/** Merge DB order with stored row order: stored first (if present), then remaining by DB order */
export function mergeRowOrder(storedIds: string[], dbOrderIds: string[]): string[] {
  const set = new Set(storedIds)
  const rest = dbOrderIds.filter((id) => !set.has(id))
  return [...storedIds.filter((id) => dbOrderIds.includes(id)), ...rest]
}
