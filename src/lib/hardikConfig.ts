/**
 * Hardik Coin config: pure utility functions only.
 * All persistence is now handled by cloud hooks in src/hooks/useAppSettings.ts.
 * The HardikCustomColumn type is re-exported from useAppSettings for convenience.
 */

export type { HardikCustomColumn } from '../hooks/useAppSettings'

/** Merge DB order with stored row order: stored first (if present), then remaining by DB order */
export function mergeRowOrder(storedIds: string[], dbOrderIds: string[]): string[] {
  const set = new Set(storedIds)
  const rest = dbOrderIds.filter((id) => !set.has(id))
  return [...storedIds.filter((id) => dbOrderIds.includes(id)), ...rest]
}
