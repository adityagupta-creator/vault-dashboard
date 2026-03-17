import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Search, RefreshCw, Truck, Plus, Trash2, MoreVertical, Columns, Download } from 'lucide-react'
import { extractCity, salesPersonFor } from '../lib/hardikUtils'
import { recalcRow } from '../lib/hardikCalculations'
import {
  getCustomColumns,
  setCustomColumns,
  addCustomColumn,
  renameCustomColumn,
  deleteCustomColumn,
  getRowOrder,
  setRowOrder,
  mergeRowOrder,
  type HardikCustomColumn,
} from '../lib/hardikConfig'
import type { ClientOrder, SupplierPurchase } from '../types'
import * as XLSX from 'xlsx'

/** System column definition */
type SystemColId =
  | 'sr_no'
  | 'order_date'
  | 'order_time'
  | 'delivery_date'
  | 'purity'
  | 'client_name'
  | 'product_symbol'
  | 'quantity'
  | 'grams'
  | 'quoted_rate'
  | 'net_revenue'
  | 'gst_amount'
  | 'tcs_amount'
  | 'gross_revenue'
  | 'quantity_bought'
  | 'trade_booked'
  | 'making_charges'
  | 'net_purchase'
  | 'gst_2'
  | 'gross_purchase'
  | 'supplier_name'
  | 'trade_margin'
  | 'trade_margin_pct'
  | 'city'
  | 'trade_status'
  | 'sales_person'

type EditField = SystemColId | `custom:${string}`

type Row = { order: ClientOrder; purchase: SupplierPurchase | null }

const SYSTEM_COLUMNS: { id: SystemColId; header: string; editable: boolean }[] = [
  { id: 'sr_no', header: 'Sr. No.', editable: false },
  { id: 'order_date', header: 'Date', editable: true },
  { id: 'order_time', header: 'Time', editable: true },
  { id: 'delivery_date', header: 'Delivery Date', editable: true },
  { id: 'purity', header: 'Purity', editable: true },
  { id: 'client_name', header: 'Party Name', editable: true },
  { id: 'product_symbol', header: 'Symbol', editable: true },
  { id: 'quantity', header: 'Quantity Sold', editable: true },
  { id: 'grams', header: 'Grams', editable: true },
  { id: 'quoted_rate', header: 'Quoted Rate', editable: true },
  { id: 'net_revenue', header: 'Net Revenue_1', editable: false },
  { id: 'gst_amount', header: 'GST_1', editable: false },
  { id: 'tcs_amount', header: 'TCS', editable: true },
  { id: 'gross_revenue', header: 'Gross Revenue', editable: false },
  { id: 'quantity_bought', header: 'Quantity Bought', editable: false },
  { id: 'trade_booked', header: 'Trade Booked', editable: true },
  { id: 'making_charges', header: 'Making Charges', editable: true },
  { id: 'net_purchase', header: 'Net Purchase_2', editable: false },
  { id: 'gst_2', header: 'GST_2', editable: false },
  { id: 'gross_purchase', header: 'Gross Purchase', editable: false },
  { id: 'supplier_name', header: 'Supplier Name', editable: true },
  { id: 'trade_margin', header: 'Trade Margin', editable: false },
  { id: 'trade_margin_pct', header: 'Trade Margin %', editable: false },
  { id: 'city', header: 'City', editable: true },
  { id: 'trade_status', header: 'Trade Status', editable: true },
  { id: 'sales_person', header: 'Sales Person Name', editable: true },
]

function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  const x = new Date(d)
  if (isNaN(x.getTime())) return ''
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`
}

/** Convert dd.mm.yyyy to YYYY-MM-DD */
function toISODate(s: string): string {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return s
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function getCustomValue(order: ClientOrder, colId: string): string {
  const rd = order.raw_data
  if (!rd || typeof rd !== 'object') return ''
  return String(rd[colId] ?? '')
}

function toNumExport(v: unknown): number | '' {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isNaN(n) ? '' : n
}

function round2Export(v: number): number {
  return Math.round(v * 100) / 100
}

function setCustomValue(order: ClientOrder, colId: string, value: string): ClientOrder {
  const raw = order.raw_data && typeof order.raw_data === 'object' ? { ...order.raw_data } : {}
  if (value === '') delete raw[colId]
  else raw[colId] = value
  return { ...order, raw_data: raw }
}

const TRADE_STATUS_OPTIONS = [
  'pending_supplier_booking',
  'pending_hedge',
  'pending_payment',
  'payment_verified',
  'do_created',
  'in_delivery',
  'reconciliation_pending',
  'closed',
]

export default function HardikCoinPage() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [customColumns, setCustomColumnsState] = useState<HardikCustomColumn[]>(() => getCustomColumns())
  const [editingCell, setEditingCell] = useState<{ orderId: string; field: EditField } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [contextRow, setContextRow] = useState<Row | null>(null)
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const [addColModal, setAddColModal] = useState(false)
  const [addColName, setAddColName] = useState('')
  const [addColPosition, setAddColPosition] = useState(999)
  const [renameColModal, setRenameColModal] = useState<HardikCustomColumn | null>(null)
  const [renameColName, setRenameColName] = useState('')
  const [colContextMenu, setColContextMenu] = useState<{ col: HardikCustomColumn; x: number; y: number } | null>(null)
  const [rowOrder, setRowOrderState] = useState<string[]>(() => getRowOrder())

  const persistRowOrder = useCallback((ids: string[]) => {
    setRowOrder(ids)
    setRowOrderState(ids)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, purchasesRes] = await Promise.all([
        withTimeout(supabase.from('client_orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false })),
        withTimeout(supabase.from('supplier_purchases').select('*').order('created_at', { ascending: false })),
      ])
      setOrders(ordersRes.data || [])
      setPurchases(purchasesRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const dbIds = orders.map((o) => o.id)
    if (dbIds.length === 0) return
    const merged = mergeRowOrder(rowOrder, dbIds)
    if (JSON.stringify(merged) !== JSON.stringify(rowOrder)) {
      setRowOrderState(merged)
      setRowOrder(merged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders])

  const byOrderId = new Map<string, SupplierPurchase>()
  purchases.forEach((p) => byOrderId.set(p.client_order_id, p))

  const dbOrderIds = orders.map((o) => o.id)
  const effectiveRowOrder = rowOrder.length > 0 ? mergeRowOrder(rowOrder, dbOrderIds) : dbOrderIds

  const orderById = new Map(orders.map((o) => [o.id, o]))
  const rowsAll: Row[] = effectiveRowOrder
    .map((id) => {
      const order = orderById.get(id)
      if (!order) return null
      return { order, purchase: byOrderId.get(id) ?? null }
    })
    .filter((r): r is Row => r != null)

  const filtered = rowsAll.filter(
    (r) =>
      r.order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.order.product_symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.purchase?.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const allCols = [...SYSTEM_COLUMNS]
  const customSorted = [...customColumns].sort((a, b) => a.position - b.position)
  customSorted.forEach((c) => {
    const insertAt = Math.min(c.position, allCols.length)
    allCols.splice(insertAt, 0, {
      id: `custom:${c.id}` as SystemColId,
      header: c.name,
      editable: true,
    })
  })

  const startEdit = (order: ClientOrder, purchase: SupplierPurchase | null, field: EditField) => {
    setEditingCell({ orderId: order.id, field })
    if (field.startsWith('custom:')) {
      setEditValue(getCustomValue(order, field.slice(7)))
    } else {
      switch (field) {
        case 'order_date':
          setEditValue(formatDate(order.order_date))
          break
        case 'order_time':
          setEditValue(order.order_time ?? '')
          break
        case 'delivery_date':
          setEditValue(formatDate(order.delivery_date))
          break
        case 'purity':
          setEditValue(order.purity ?? '')
          break
        case 'client_name':
          setEditValue(order.client_name ?? '')
          break
        case 'product_symbol':
          setEditValue(order.product_symbol ?? '')
          break
        case 'quantity':
          setEditValue(String(order.quantity ?? 1))
          break
        case 'grams':
          setEditValue(String(order.grams ?? 0))
          break
        case 'quoted_rate':
          setEditValue(String(order.quoted_rate ?? ''))
          break
        case 'tcs_amount':
          setEditValue(String(order.tcs_amount ?? ''))
          break
        case 'trade_booked':
          setEditValue(purchase ? String(purchase.supplier_rate ?? '') : '')
          break
        case 'making_charges':
          setEditValue(purchase ? String(purchase.supplier_making_charges ?? '') : '')
          break
        case 'supplier_name':
          setEditValue(purchase?.supplier_name ?? '')
          break
        case 'city':
          setEditValue(order.city ?? extractCity(order.product_symbol) ?? '')
          break
        case 'trade_status':
          setEditValue(order.trade_status ?? '')
          break
        case 'sales_person':
          setEditValue(getCustomValue(order, 'sales_person') || salesPersonFor(order.product_symbol) || '')
          break
        default:
          setEditValue('')
      }
    }
  }

  const persistAndRecalc = useCallback(
    async (order: ClientOrder, purchase: SupplierPurchase | null, orderUpdates: Partial<ClientOrder>, purchaseUpdates: Partial<SupplierPurchase> | null) => {
      const { orderUpdate, purchaseUpdate } = recalcRow(
        { ...order, ...orderUpdates },
        purchase ? { ...purchase, ...purchaseUpdates } : null
      )
      const finalOrder = { ...order, ...orderUpdates, ...orderUpdate }
      const finalPurchase = purchase
        ? purchaseUpdate
          ? { ...purchase, ...purchaseUpdates, ...purchaseUpdate }
          : purchaseUpdates
            ? { ...purchase, ...purchaseUpdates }
            : purchase
        : purchaseUpdates
          ? ({ client_order_id: order.id, ...purchaseUpdates } as SupplierPurchase)
          : null

      const orderPayload: Partial<ClientOrder> = {
        ...orderUpdates,
        ...orderUpdate,
      }
      const { error: orderErr } = await supabase.from('client_orders').update(orderPayload).eq('id', order.id)
      if (orderErr) {
        console.error(orderErr)
        alert('Failed to update order')
        return
      }

      if (finalPurchase) {
        if (purchase) {
          const { error: purchaseErr } = await supabase
            .from('supplier_purchases')
            .update({ ...purchaseUpdates, ...purchaseUpdate })
            .eq('id', purchase.id)
          if (purchaseErr) {
            console.error(purchaseErr)
            alert('Failed to update purchase')
            return
          }
          setPurchases((prev) => prev.map((p) => (p.id === purchase.id ? (finalPurchase as SupplierPurchase) : p)))
        } else {
          const insertPayload = {
            client_order_id: order.id,
            supplier_name: (purchaseUpdates as any)?.supplier_name ?? '',
            supplier_grams: finalOrder.grams,
            supplier_rate: (purchaseUpdates as any)?.supplier_rate ?? 0,
            supplier_making_charges: (purchaseUpdates as any)?.supplier_making_charges ?? 0,
            net_purchase: (purchaseUpdate as any)?.net_purchase ?? 0,
            gst_2: (purchaseUpdate as any)?.gst_2 ?? 0,
            gross_purchase: (purchaseUpdate as any)?.gross_purchase ?? 0,
            supplier_status: 'booked' as const,
            booked_by_agent_id: user?.id ?? null,
          }
          const { data: newPurchase, error: purchaseErr } = await supabase
            .from('supplier_purchases')
            .insert(insertPayload)
            .select('*')
            .single()
          if (purchaseErr) {
            console.error(purchaseErr)
            alert('Failed to create purchase')
            return
          }
          await supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', order.id)
          setPurchases((prev) => [newPurchase as SupplierPurchase, ...prev])
          setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, trade_status: 'pending_hedge' } : o)))
        }
      }

      setOrders((prev) => prev.map((o) => (o.id === order.id ? finalOrder : o)))
      setEditingCell(null)
    },
    [user?.id]
  )

  const saveEdit = async () => {
    if (!editingCell) return
    const order = orders.find((o) => o.id === editingCell.orderId)
    if (!order) return
    const purchase = byOrderId.get(editingCell.orderId) ?? null

    const field = editingCell.field

    if (field.startsWith('custom:')) {
      const colId = field.slice(7)
      const updated = setCustomValue(order, colId, String(editValue || '').trim())
      const { error } = await supabase.from('client_orders').update({ raw_data: updated.raw_data }).eq('id', order.id)
      if (error) {
        console.error(error)
        alert('Failed to update')
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)))
      }
      setEditingCell(null)
      return
    }

    const val = String(editValue ?? '').trim()

    switch (field) {
      case 'order_date': {
        const iso = val ? toISODate(val) || val : order.order_date
        const { error } = await supabase.from('client_orders').update({ order_date: iso }).eq('id', order.id)
        if (error) {
          console.error(error)
          alert('Failed to update')
        } else {
          setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, order_date: iso } : o)))
        }
        setEditingCell(null)
        return
      }
      case 'order_time': {
        const { error } = await supabase.from('client_orders').update({ order_time: val || null }).eq('id', order.id)
        if (error) {
          console.error(error)
          alert('Failed to update')
        } else {
          setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, order_time: val || null } : o)))
        }
        setEditingCell(null)
        return
      }
      case 'delivery_date': {
        const iso = val ? toISODate(val) || val : null
        const { error } = await supabase.from('client_orders').update({ delivery_date: iso }).eq('id', order.id)
        if (error) {
          console.error(error)
          alert('Failed to update')
        } else {
          setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, delivery_date: iso } : o)))
        }
        setEditingCell(null)
        return
      }
      case 'purity':
      case 'client_name':
      case 'product_symbol':
      case 'city':
      case 'trade_status': {
        const key = field === 'client_name' ? 'client_name' : field === 'product_symbol' ? 'product_symbol' : field === 'city' ? 'city' : field === 'trade_status' ? 'trade_status' : 'purity'
        const payload: Record<string, string | null> = { [key]: val || null }
        const { error } = await supabase.from('client_orders').update(payload).eq('id', order.id)
        if (error) {
          console.error(error)
          alert('Failed to update')
        } else {
          const updated = { ...order, ...payload }
          setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)))
        }
        setEditingCell(null)
        return
      }
      case 'sales_person': {
        const updated = setCustomValue(order, 'sales_person', val)
        const { error } = await supabase.from('client_orders').update({ raw_data: updated.raw_data }).eq('id', order.id)
        if (error) {
          console.error(error)
          alert('Failed to update')
        } else {
          setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)))
        }
        setEditingCell(null)
        return
      }
      case 'quantity': {
        const n = parseInt(val, 10)
        if (isNaN(n) || n < 1) {
          setEditingCell(null)
          return
        }
        await persistAndRecalc(order, purchase, { quantity: n }, null)
        return
      }
      case 'grams':
      case 'quoted_rate':
      case 'tcs_amount': {
        const n = parseFloat(val.replace(/,/g, ''))
        if (isNaN(n) || n < 0) {
          setEditingCell(null)
          return
        }
        const rounded = Math.round(n * 100) / 100
        const key = field === 'quoted_rate' ? 'quoted_rate' : field === 'tcs_amount' ? 'tcs_amount' : 'grams'
        await persistAndRecalc(order, purchase, { [key]: rounded }, null)
        return
      }
      case 'trade_booked':
      case 'making_charges':
      case 'supplier_name': {
        const n = parseFloat(val.replace(/,/g, ''))
        if (field === 'supplier_name') {
          const supplier_name = val
          if (!supplier_name) {
            setEditingCell(null)
            return
          }
          if (purchase) {
            const { orderUpdate, purchaseUpdate } = recalcRow(order, { ...purchase, supplier_name })
            const { error } = await supabase.from('supplier_purchases').update({ supplier_name, ...purchaseUpdate }).eq('id', purchase.id)
            if (error) {
              console.error(error)
              alert('Failed to update')
            } else {
              setPurchases((prev) => prev.map((p) => (p.id === purchase.id ? { ...p, supplier_name, ...purchaseUpdate } : p)))
            }
          } else {
            const { orderUpdate, purchaseUpdate } = recalcRow(order, {
              client_order_id: order.id,
              supplier_name,
              supplier_rate: 0,
              supplier_making_charges: 0,
              supplier_grams: order.grams,
            } as SupplierPurchase)
            const insertPayload = {
              client_order_id: order.id,
              supplier_name,
              supplier_grams: order.grams,
              supplier_rate: 0,
              supplier_making_charges: 0,
              net_purchase: (purchaseUpdate as any)?.net_purchase ?? 0,
              gst_2: (purchaseUpdate as any)?.gst_2 ?? 0,
              gross_purchase: (purchaseUpdate as any)?.gross_purchase ?? 0,
              supplier_status: 'booked' as const,
              booked_by_agent_id: user?.id ?? null,
            }
            const { data: newPurchase, error } = await supabase.from('supplier_purchases').insert(insertPayload).select('*').single()
            if (error) {
              console.error(error)
              alert('Failed to create purchase')
            } else {
              await supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', order.id)
              setPurchases((prev) => [newPurchase as SupplierPurchase, ...prev])
              setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, trade_status: 'pending_hedge' } : o)))
            }
          }
        } else {
          const newRate = field === 'trade_booked' ? (isNaN(n) ? 0 : Math.round(n * 100) / 100) : (purchase?.supplier_rate ?? 0)
          const newMaking = field === 'making_charges' ? (isNaN(n) ? 0 : Math.round(n * 100) / 100) : (purchase?.supplier_making_charges ?? 0)
          const supplier_name = purchase?.supplier_name ?? ''
          if (purchase) {
            await persistAndRecalc(order, purchase, {}, { supplier_rate: newRate, supplier_making_charges: newMaking })
          } else {
            const { orderUpdate, purchaseUpdate } = recalcRow(order, {
              client_order_id: order.id,
              supplier_name,
              supplier_rate: newRate,
              supplier_making_charges: newMaking,
              supplier_grams: order.grams,
            } as SupplierPurchase)
            const insertPayload = {
              client_order_id: order.id,
              supplier_name,
              supplier_grams: order.grams,
              supplier_rate: newRate,
              supplier_making_charges: newMaking,
              net_purchase: (purchaseUpdate as any)?.net_purchase ?? 0,
              gst_2: (purchaseUpdate as any)?.gst_2 ?? 0,
              gross_purchase: (purchaseUpdate as any)?.gross_purchase ?? 0,
              supplier_status: 'booked' as const,
              booked_by_agent_id: user?.id ?? null,
            }
            const { data: newPurchase, error } = await supabase.from('supplier_purchases').insert(insertPayload).select('*').single()
            if (error) {
              console.error(error)
              alert('Failed to create purchase')
            } else {
              await supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', order.id)
              setPurchases((prev) => [newPurchase as SupplierPurchase, ...prev])
              setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, trade_status: 'pending_hedge' } : o)))
              const up = { ...orderUpdate }
              await supabase.from('client_orders').update(up).eq('id', order.id)
              setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...orderUpdate } : o)))
            }
          }
        }
        setEditingCell(null)
        return
      }
      default:
        setEditingCell(null)
    }
  }

  const cancelEdit = () => setEditingCell(null)

  const handleInsertRow = async (atIndex: number, above: boolean) => {
    const idx = above ? atIndex : atIndex + 1
    const defaultDate = new Date().toISOString().split('T')[0]
    const payload: Partial<ClientOrder> = {
      client_name: 'New',
      order_date: defaultDate,
      order_time: null,
      delivery_date: null,
      product_symbol: null,
      purity: null,
      quantity: 1,
      grams: 0,
      quoted_rate: 0,
      making_charges: 0,
      net_revenue: 0,
      gst_amount: 0,
      tcs_amount: 0,
      gross_revenue: 0,
      city: null,
      trade_status: 'pending_supplier_booking',
      order_source: 'offline',
      remarks: null,
      created_by: user?.id ?? null,
    }
    const { data: newOrder, error } = await supabase.from('client_orders').insert(payload).select('*').single()
    if (error) {
      console.error(error)
      alert('Failed to insert row')
      return
    }
    const newIds = [...effectiveRowOrder]
    newIds.splice(idx, 0, (newOrder as ClientOrder).id)
    persistRowOrder(newIds)
    setOrders((prev) => [...prev, newOrder as ClientOrder])
  }

  const handleDeleteRow = async (row: Row) => {
    if (!confirm('Delete this row? This will remove the order from the Hardik sheet display. The order will remain in the database.')) return
    const newIds = effectiveRowOrder.filter((id) => id !== row.order.id)
    persistRowOrder(newIds)
    setContextRow(null)
    setContextPos(null)
  }

  const handleAddColumn = () => {
    const name = addColName.trim()
    if (!name) return
    const col = addCustomColumn(name, addColPosition)
    setCustomColumnsState(getCustomColumns())
    setAddColModal(false)
    setAddColName('')
    setAddColPosition(999)
  }

  const handleRenameColumn = (col: HardikCustomColumn) => {
    const name = renameColName.trim()
    if (!name) return
    renameCustomColumn(col.id, name)
    setCustomColumnsState(getCustomColumns())
    setRenameColModal(null)
    setRenameColName('')
  }

  const handleDeleteColumn = (col: HardikCustomColumn) => {
    deleteCustomColumn(col.id)
    setCustomColumnsState(getCustomColumns())
  }

  const closeContextMenu = () => {
    setContextRow(null)
    setContextPos(null)
  }

  /** Raw value for Excel export (numbers as numbers, rest as string) */
  const getCellExportValue = (row: Row, col: { id: string; header: string }, idx: number): string | number => {
    const { order, purchase } = row
    const id = col.id as SystemColId
    switch (id) {
      case 'sr_no': return idx + 1
      case 'order_date': return formatDate(order.order_date) || ''
      case 'order_time': return order.order_time || ''
      case 'delivery_date': return formatDate(order.delivery_date) || ''
      case 'purity': return order.purity ?? ''
      case 'client_name': return order.client_name ?? ''
      case 'product_symbol': return order.product_symbol ?? ''
      case 'quantity': return order.quantity ?? 1
      case 'grams': return toNumExport(order.grams)
      case 'quoted_rate': return toNumExport(order.quoted_rate)
      case 'net_revenue': return toNumExport(order.net_revenue)
      case 'gst_amount': return toNumExport(order.gst_amount)
      case 'tcs_amount': return toNumExport(order.tcs_amount)
      case 'gross_revenue': return toNumExport(order.gross_revenue)
      case 'quantity_bought': return (order.quantity ?? order.grams ?? 0) as number
      case 'trade_booked': return toNumExport(purchase?.supplier_rate)
      case 'making_charges': return toNumExport(purchase?.supplier_making_charges)
      case 'net_purchase': return toNumExport(purchase?.net_purchase)
      case 'gst_2': return toNumExport(purchase?.gst_2)
      case 'gross_purchase': return toNumExport(purchase?.gross_purchase)
      case 'supplier_name': return purchase?.supplier_name ?? ''
      case 'trade_margin': {
        const nr = order.net_revenue ?? 0
        const np = purchase?.net_purchase ?? 0
        return nr && np ? round2Export(nr - np) : ''
      }
      case 'trade_margin_pct': {
        const nr = order.net_revenue ?? 0
        const np = purchase?.net_purchase ?? 0
        const m = nr && np ? nr - np : null
        return nr && m != null ? round2Export((m / nr) * 100) : ''
      }
      case 'city': return order.city || extractCity(order.product_symbol) || ''
      case 'trade_status': return order.trade_status ?? ''
      case 'sales_person': return getCustomValue(order, 'sales_person') || salesPersonFor(order.product_symbol) || ''
      default:
        if (col.id.startsWith('custom:')) return getCustomValue(order, col.id.slice(7)) || ''
        return ''
    }
  }

  const exportToExcel = () => {
    const rows = filtered.map((row, idx) => {
      const obj: Record<string, string | number> = {}
      allCols.forEach((col) => {
        obj[col.header] = getCellExportValue(row, col, idx) as string | number
      })
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hardik Coin')
    const filename = `HardikCoin_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  const renderCell = (col: { id: string; header: string; editable: boolean }, row: Row, idx: number) => {
    const { order, purchase } = row
    const isEditing = editingCell?.orderId === order.id && editingCell?.field === (col.id as EditField)
    const editInputClass = 'w-full min-w-0 px-1.5 py-0.5 text-[10px] border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500'

    if (col.id === 'sr_no') {
      return (
        <td key={col.id} className="text-slate-600 text-center w-12 whitespace-nowrap group relative">
          {idx + 1}
          <div className="absolute left-0 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setContextRow(row)
                setContextPos({ x: e.clientX, y: e.clientY })
              }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )
    }

    if (isEditing) {
      const input =
        col.id === 'quantity' || col.id === 'grams' || col.id === 'quoted_rate' || col.id === 'tcs_amount' || col.id === 'trade_booked' || col.id === 'making_charges' ? (
          <input
            type="number"
            step={col.id === 'quantity' ? '1' : '0.01'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            autoFocus
            className={`${editInputClass} text-right`}
          />
        ) : col.id === 'trade_status' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            autoFocus
            className={editInputClass}
          >
            {TRADE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            autoFocus
            className={editInputClass}
          />
        )
      return (
        <td key={col.id} className="px-1 py-0.5">
          {input}
        </td>
      )
    }

    const clickable = col.editable
    const content = (() => {
      const id = col.id as SystemColId
      switch (id) {
        case 'order_date':
          return formatDate(order.order_date) || '-'
        case 'order_time':
          return order.order_time || '-'
        case 'delivery_date':
          return formatDate(order.delivery_date) || '-'
        case 'purity':
          return order.purity ?? '-'
        case 'client_name':
          return order.client_name || '-'
        case 'product_symbol':
          return order.product_symbol ?? '-'
        case 'quantity':
          return order.quantity ?? 1
        case 'grams':
          return `${order.grams}g`
        case 'quoted_rate':
          return order.quoted_rate != null ? `₹${order.quoted_rate.toLocaleString()}` : '-'
        case 'net_revenue':
          return order.net_revenue != null ? `₹${order.net_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'gst_amount':
          return order.gst_amount != null ? `₹${order.gst_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'tcs_amount':
          return order.tcs_amount != null ? `₹${order.tcs_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'gross_revenue':
          return order.gross_revenue != null ? `₹${order.gross_revenue.toLocaleString()}` : '-'
        case 'quantity_bought':
          return order.quantity ?? order.grams ?? '-'
        case 'trade_booked':
          return purchase ? `₹${(purchase.supplier_rate ?? 0).toLocaleString()}/10g` : 'Click to add'
        case 'making_charges':
          return purchase ? `₹${(purchase.supplier_making_charges ?? 0).toLocaleString()}` : 'Click to add'
        case 'net_purchase':
          return purchase?.net_purchase != null ? `₹${purchase.net_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'gst_2':
          return purchase?.gst_2 != null ? `₹${purchase.gst_2.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'gross_purchase':
          return purchase?.gross_purchase != null ? `₹${purchase.gross_purchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        case 'supplier_name':
          return purchase?.supplier_name ?? 'Click to add'
        case 'trade_margin': {
          const nr = order.net_revenue ?? 0
          const np = purchase?.net_purchase ?? 0
          const m = nr && np ? nr - np : null
          return m != null ? `₹${m.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'
        }
        case 'trade_margin_pct': {
          const nr = order.net_revenue ?? 0
          const np = purchase?.net_purchase ?? 0
          const m = nr && np ? nr - np : null
          const pct = nr && m != null ? (m / nr) * 100 : null
          return pct != null ? `${pct.toFixed(2)}%` : '-'
        }
        case 'city':
          return order.city || extractCity(order.product_symbol) || '-'
        case 'trade_status':
          return order.trade_status?.replace(/_/g, ' ') ?? '-'
        case 'sales_person':
          return getCustomValue(order, 'sales_person') || salesPersonFor(order.product_symbol) || '-'
        default:
          if (col.id.startsWith('custom:')) {
            return getCustomValue(order, col.id.slice(7)) || '-'
          }
          return '-'
      }
    })()

    const alignRight =
      [
        'quantity',
        'grams',
        'quoted_rate',
        'net_revenue',
        'gst_amount',
        'tcs_amount',
        'gross_revenue',
        'quantity_bought',
        'trade_booked',
        'making_charges',
        'net_purchase',
        'gst_2',
        'gross_purchase',
        'trade_margin',
        'trade_margin_pct',
      ].includes(col.id) || col.id.startsWith('custom:')
        ? 'text-right'
        : ''

    return (
      <td
        key={col.id}
        className={`px-1 py-0.5 text-slate-900 ${alignRight} ${col.id === 'client_name' ? 'font-medium' : ''} ${col.id === 'net_revenue' || col.id === 'gross_revenue' || col.id === 'trade_margin' ? 'text-slate-900' : 'text-slate-600'}`}
      >
        {clickable ? (
          <button
            type="button"
            onClick={() => startEdit(order, purchase, col.id as EditField)}
            className="w-full text-left hover:bg-amber-50 -m-1 px-1 py-0.5 rounded min-h-[1.25rem]"
          >
            {content}
          </button>
        ) : (
          <span>{content}</span>
        )}
      </td>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Hardik Coin</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddColModal(true)}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors"
          >
            <Columns className="w-4 h-4 mr-1" />Add Column
          </button>
          <button
            onClick={exportToExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4 mr-1" />Export XLS
          </button>
          <Link
            to="/supplier-purchase"
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors"
          >
            <Truck className="w-4 h-4 mr-1" />Supplier
          </Link>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </button>
        </div>
      </div>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search"
        />
      </div>
      <div className="bg-white rounded border border-slate-200 flex-1 min-h-0 flex flex-col">
        <div className="table-container">
          <table className="table-excel w-full [&_thead_th]:bg-[#1F4E79] [&_thead_th]:text-white [&_thead_th]:border-slate-600">
            <thead className="sticky top-0 z-10">
              <tr>
                {allCols.map((col) => {
                  const isCustom = col.id.startsWith('custom:')
                  const customCol = isCustom ? customSorted.find((c) => `custom:${c.id}` === col.id) : null
                  return (
                    <th
                      key={col.id}
                      className="px-1 py-0.5 text-left text-[10px] font-medium text-white uppercase whitespace-nowrap border border-slate-600 group/th relative"
                    >
                      {col.header}
                      {isCustom && customCol && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setColContextMenu({ col: customCol, x: e.clientX, y: e.clientY })
                          }}
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 p-0.5 rounded"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={row.order.id}>{allCols.map((col) => renderCell(col, row, idx))}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No trades found</div>}
      </div>

      {/* Row context menu */}
      {contextRow && contextPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} aria-hidden />
          <div
            className="fixed z-50 bg-white rounded shadow-lg border border-slate-200 py-1 min-w-[10rem]"
            style={{ left: contextPos.x, top: contextPos.y }}
          >
            <button
              type="button"
              onClick={() => {
                const idx = filtered.findIndex((r) => r.order.id === contextRow.order.id)
                handleInsertRow(idx, true)
                closeContextMenu()
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />Insert row above
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = filtered.findIndex((r) => r.order.id === contextRow.order.id)
                handleInsertRow(idx, false)
                closeContextMenu()
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />Insert row below
            </button>
            <button
              type="button"
              onClick={() => {
                handleDeleteRow(contextRow)
                closeContextMenu()
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />Delete row
            </button>
          </div>
        </>
      )}

      {/* Add column modal */}
      {addColModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-4 min-w-[16rem]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Add custom column</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Column name"
                value={addColName}
                onChange={(e) => setAddColName(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
              />
              <input
                type="number"
                placeholder="Position (0-based)"
                value={addColPosition}
                onChange={(e) => setAddColPosition(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAddColModal(false)} className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded">
                Cancel
              </button>
              <button onClick={handleAddColumn} className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column context menu */}
      {colContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColContextMenu(null)} aria-hidden />
          <div
            className="fixed z-50 bg-white rounded shadow-lg border border-slate-200 py-1 min-w-[10rem]"
            style={{ left: colContextMenu.x, top: colContextMenu.y }}
          >
            <button
              type="button"
              onClick={() => {
                setRenameColModal(colContextMenu.col)
                setRenameColName(colContextMenu.col.name)
                setColContextMenu(null)
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100"
            >
              Rename column
            </button>
            <button
              type="button"
              onClick={() => {
                handleDeleteColumn(colContextMenu.col)
                setColContextMenu(null)
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 text-red-600"
            >
              Delete column
            </button>
          </div>
        </>
      )}

      {/* Rename column modal */}
      {renameColModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-4 min-w-[16rem]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Rename column</h3>
            <input
              type="text"
              placeholder="New name"
              value={renameColName}
              onChange={(e) => setRenameColName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setRenameColModal(null)
                  setRenameColName('')
                }}
                className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRenameColumn(renameColModal)}
                className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
