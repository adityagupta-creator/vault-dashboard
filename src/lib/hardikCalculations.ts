/**
 * Hardik Coin calculation module - matches Python formulas exactly.
 *
 * Sales:
 *   Net Revenue_1 = Grams * (Quoted Rate / 10)  [Quoted Rate is ₹/10g]
 *   GST_1 = Net Revenue_1 * 0.03
 *   Gross Revenue = Net Revenue_1 + GST_1
 *   Quantity Bought = Quantity Sold
 *
 * Purchase:
 *   Net Purchase_2 = (Grams/10) * Trade Booked + Making Charges
 *   GST_2 = Net Purchase_2 * 0.03
 *   Gross Purchase = Net Purchase_2 + GST_2
 *
 * Margin:
 *   Trade Margin = Net Revenue_1 - Net Purchase_2
 *   Trade Margin % = Trade Margin / Net Revenue_1
 */

import type { ClientOrder, SupplierPurchase } from '../types'

const SALES_GST_RATE = 0.03
const PURCHASE_GST_RATE = 0.03
const TCS_RATE = 0.001

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Sales: Matches Python master sheet recalculation.
 * Net Revenue_1 = Grams * Quoted Rate (Quoted Rate stored as ₹/10g → value = grams/10 * quoted_rate)
 * Per ClientOrders schema, quoted_rate is ₹/10g; making_charges added to net.
 */
export function recalcSales(order: ClientOrder): Partial<ClientOrder> {
  const grams = toNum(order.grams)
  const quotedRate = toNum(order.quoted_rate)
  const makingCharges = toNum(order.making_charges)
  const quantitySold = toNum(order.quantity) || 1

  const net_revenue = round2((grams / 10) * quotedRate + makingCharges)
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

/** Purchase: Net Purchase_2 = (grams/10)*Trade_Booked + Making_Charges, GST_2, Gross Purchase */
export function recalcPurchase(
  order: ClientOrder,
  purchase: SupplierPurchase | Partial<SupplierPurchase> | null
): Partial<SupplierPurchase> | null {
  if (!purchase) return null
  const grams = toNum(order.grams)
  const tradeBooked = toNum((purchase as SupplierPurchase).supplier_rate ?? 0)
  const makingCharges = toNum((purchase as SupplierPurchase).supplier_making_charges ?? 0)

  const net_purchase = round2((grams / 10) * tradeBooked + makingCharges)
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
