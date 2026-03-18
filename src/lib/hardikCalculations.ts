/**
 * Hardik Coin calculation module.
 *
 * All rates (Quoted Rate, Trade Booked) are stored as per gram.
 *
 * Sales:
 *   Net Revenue_1 = Grams × Quoted Rate
 *   GST_1         = Net Revenue_1 × 3%
 *   TCS           = manually entered (not auto-calculated)
 *   Gross Revenue = Net Revenue_1 + GST_1
 *
 * Purchase:
 *   Net Purchase_2 = Grams × Trade Booked
 *   GST_2          = Net Purchase_2 × 3%
 *   Gross Purchase = Net Purchase_2 + GST_2
 *   Trade Margin   = Net Revenue_1 − Net Purchase_2
 *   Trade Margin %  = Trade Margin / Net Revenue_1
 */

import type { ClientOrder, SupplierPurchase } from '../types'

const GST_RATE = 0.03

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

export function recalcSales(order: ClientOrder): Partial<ClientOrder> {
  const grams = toNum(order.grams)
  const quotedRate = toNum(order.quoted_rate)
  const quantitySold = toNum(order.quantity) || 1

  const net_revenue = round2(grams * quotedRate)
  const gst_amount = round2(net_revenue * GST_RATE)
  const gross_revenue = round2(net_revenue + gst_amount)

  return {
    net_revenue,
    gst_amount,
    gross_revenue,
    quantity: quantitySold,
  }
}

export function recalcPurchase(
  order: ClientOrder,
  purchase: SupplierPurchase | Partial<SupplierPurchase> | null
): Partial<SupplierPurchase> | null {
  if (!purchase) return null
  const grams = toNum(order.grams)
  const tradeBooked = toNum((purchase as SupplierPurchase).supplier_rate ?? 0)

  const net_purchase = round2(grams * tradeBooked)
  const gst_2 = round2(net_purchase * GST_RATE)
  const gross_purchase = round2(net_purchase + gst_2)

  return {
    net_purchase,
    gst_2,
    gross_purchase,
    supplier_grams: grams,
  }
}

export function calcMargin(netRevenue: number, netPurchase: number): { tradeMargin: number; tradeMarginPct: number } {
  const tradeMargin = round2(netRevenue - netPurchase)
  const tradeMarginPct = netRevenue !== 0 ? round2((tradeMargin / netRevenue) * 100) : 0
  return { tradeMargin, tradeMarginPct }
}

export function recalcRow(
  order: ClientOrder,
  purchase: SupplierPurchase | null
): {
  orderUpdate: Partial<ClientOrder>
  purchaseUpdate: Partial<SupplierPurchase> | null
  tradeMargin: number
  tradeMarginPct: number
} {
  const orderUpdate = recalcSales(order)
  const purchaseUpdate = recalcPurchase(order, purchase)

  const nr = orderUpdate.net_revenue ?? toNum(order.net_revenue)
  const np = purchaseUpdate?.net_purchase ?? toNum(purchase?.net_purchase)

  const { tradeMargin, tradeMarginPct } = calcMargin(nr, np)

  return {
    orderUpdate,
    purchaseUpdate,
    tradeMargin,
    tradeMarginPct,
  }
}
