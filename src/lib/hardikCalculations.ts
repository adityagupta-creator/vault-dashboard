/**
 * Hardik Coin calculation module - matches Python reference exactly.
 *
 * Python update_master (sales recalculation):
 *   nr1   = (grams * qr).round(2)     # Net Revenue_1 = Grams * Quoted Rate
 *   gst1  = (nr1 * 0.03).round(2)
 *   gross = (nr1 + gst1).round(2)
 *   Quantity Bought = Quantity Sold
 *
 * Python F1_FORMULAS (purchase):
 *   Q = Net Purchase_2 = N * (O + P)  # Quantity Bought * (Trade Booked + Making Charges)
 *   R = GST_2 = Q * 0.03
 *   S = Gross Purchase = Q + R
 *   U = Trade Margin = J - Q
 *   V = Trade Margin % = U / J
 *
 * Column map: N=Quantity Bought, O=Trade Booked, P=Making Charges, J=Net Revenue_1
 */

import type { ClientOrder, SupplierPurchase } from '../types'

const SALES_GST_RATE = 0.03
const PURCHASE_GST_RATE = 0.03

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Sales: Matches Python update_master exactly.
 * Net Revenue_1 = Grams * Quoted Rate
 * GST_1 = Net Revenue_1 * 0.03
 * Gross Revenue = Net Revenue_1 + GST_1
 * (Python does not include TCS in gross; we preserve TCS from order if present)
 */
export function recalcSales(order: ClientOrder): Partial<ClientOrder> {
  const grams = toNum(order.grams)
  const quotedRate = toNum(order.quoted_rate)
  const quantitySold = toNum(order.quantity) || 1

  const net_revenue = round2(grams * quotedRate)
  const gst_amount = round2(net_revenue * SALES_GST_RATE)
  const tcs_amount = toNum(order.tcs_amount)
  const gross_revenue = round2(net_revenue + gst_amount + tcs_amount)

  return {
    net_revenue,
    gst_amount,
    tcs_amount,
    gross_revenue,
    quantity: quantitySold,
  }
}

/**
 * Purchase: Matches Python F1_FORMULAS exactly.
 * Net Purchase_2 = Quantity Bought * (Trade Booked + Making Charges)
 * N = Quantity Bought = Grams; O = Trade Booked; P = Making Charges
 * (Trade Booked and Making Charges are per gram in the formula)
 */
export function recalcPurchase(
  order: ClientOrder,
  purchase: SupplierPurchase | Partial<SupplierPurchase> | null
): Partial<SupplierPurchase> | null {
  if (!purchase) return null
  const quantityBought = toNum(order.grams) || toNum(order.quantity) || 1
  const tradeBooked = toNum((purchase as SupplierPurchase).supplier_rate ?? 0)
  const makingCharges = toNum((purchase as SupplierPurchase).supplier_making_charges ?? 0)

  const grams = toNum(order.grams)
  const net_purchase = round2(quantityBought * (tradeBooked + makingCharges))
  const gst_2 = round2(net_purchase * PURCHASE_GST_RATE)
  const gross_purchase = round2(net_purchase + gst_2)

  return {
    net_purchase,
    gst_2,
    gross_purchase,
    supplier_grams: grams,
  }
}

/** Trade Margin = Net Revenue_1 - Net Purchase_2; Trade Margin % = Trade Margin / Net Revenue_1 */
export function calcMargin(netRevenue: number, netPurchase: number): { tradeMargin: number; tradeMarginPct: number } {
  const tradeMargin = round2(netRevenue - netPurchase)
  const tradeMarginPct = netRevenue !== 0 ? round2((tradeMargin / netRevenue) * 100) : 0
  return { tradeMargin, tradeMarginPct }
}

/** Recalculate order (sales) and optionally purchase. Returns updated order + purchase fields to persist. */
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
