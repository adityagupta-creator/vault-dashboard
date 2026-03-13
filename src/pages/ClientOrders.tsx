import { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '../api/supabase'
import { withTimeout } from '../api/withTimeout'
import { useAuthStore } from '../store/auth'
import { Plus, Search, Send, Upload, X } from 'lucide-react'
import type { ClientOrder } from '../types'
import * as XLSX from 'xlsx'

export default function ClientOrdersPage() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<{ inserted: number; skipped: number; errors: string[]; fileName: string; duplicates?: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [highlightedHashes, setHighlightedHashes] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [formData, setFormData] = useState({
    client_name: '', company_name: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '', product_symbol: '', purity: '',
    grams: '', quantity: '', quoted_rate: '', making_charges: '0',
    order_source: 'offline' as 'online' | 'offline', city: '', remarks: '',
  })

  useEffect(() => { fetchOrders() }, [])

  const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

  const toNumber = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'number' && !Number.isNaN(value)) return value
    const cleaned = String(value).replace(/,/g, '').trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? null : parsed
  }

  const toText = (value: unknown) => {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text.length ? text : null
  }

  const toIsoDate = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    if (value instanceof Date) return value.toISOString().split('T')[0]
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (parsed) {
        const year = String(parsed.y).padStart(4, '0')
        const month = String(parsed.m).padStart(2, '0')
        const day = String(parsed.d).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
    }
    const text = String(value).trim()
    if (!text) return null
    const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
    if (match) {
      const [, day, month, yearRaw] = match
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    const parsedDate = new Date(text)
    return Number.isNaN(parsedDate.valueOf()) ? null : parsedDate.toISOString().split('T')[0]
  }

  const toTimeString = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    if (value instanceof Date) return value.toTimeString().slice(0, 8)
    if (typeof value === 'number' && value >= 0 && value < 1) {
      const totalSeconds = Math.round(value * 24 * 60 * 60)
      const hours = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0')
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
      const seconds = String(totalSeconds % 60).padStart(2, '0')
      return `${hours}:${minutes}:${seconds}`
    }
    const text = String(value).trim()
    if (!text) return null
    // Handle "13 Mar 2026 11:57:05:953" – strip milliseconds for HH:MM:SS
    const timePart = text.replace(/:(\d{3})$/, '')
    const match = timePart.match(/\d{1,2}:\d{2}(?::\d{2})?/)
    return match ? (match[0].length === 5 ? `${match[0]}:00` : match[0]) : (text.length === 5 ? `${text}:00` : text)
  }

  const parsePurityFromSymbol = (symbol: string | null | undefined) => {
    if (!symbol) return null
    const s = String(symbol)
    if (/\b9999\b/.test(s)) return '99.99'
    if (/\b999\b/.test(s)) return '99.90'
    if (/\b995\b/.test(s)) return '99.50'
    const m = s.match(/\b(\d{3,4})\b/)
    if (m) {
      const c = m[1]
      return c.length === 4 ? `${c.slice(0, 2)}.${c.slice(2)}` : `${c.slice(0, 2)}.${c[2]}0`
    }
    return null
  }

  const parseDateTimeOrDate = (value: unknown) => {
    if (value === null || value === undefined || value === '') return { date: null, time: null }
    const text = String(value).trim().replace(/:(\d{3})$/, '')
    const d = new Date(text)
    if (Number.isNaN(d.getTime())) return { date: null, time: null }
    return {
      date: d.toISOString().split('T')[0],
      time: d.toTimeString().slice(0, 8),
    }
  }

  const insertOrdersInChunks = async (payloads: any[]) => {
    const chunkSize = 200
    for (let i = 0; i < payloads.length; i += chunkSize) {
      const chunk = payloads.slice(i, i + chunkSize)
      const { error } = await supabase.from('client_orders').insert(chunk)
      if (error) throw error
    }
  }

  const sendOrderNotification = async (count: number, fileName: string, source: string = 'sheet') => {
    const recipient = import.meta.env.VITE_MEGHNA_EMAIL || 'aditya.gupta@safegold.in'
    if (!recipient) return
    const functionName = import.meta.env.VITE_ORDER_NOTIFY_FUNCTION || 'notify-new-orders'
    try {
      await supabase.functions.invoke(functionName, {
        body: { recipient, count, fileName, source },
      })
    } catch (error) {
      console.error('Error sending order notification:', error)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportError(null)
    setImportSummary(null)

    try {
      const buffer = await file.arrayBuffer()
      let rows: Record<string, unknown>[]
      const head = new Uint8Array(buffer).slice(0, 512)
      const textStart = new TextDecoder().decode(head).toLowerCase()
      const isHtml = textStart.startsWith('<html') || textStart.includes('<html') || textStart.includes('<table')
      if (isHtml) {
        const text = new TextDecoder().decode(buffer)
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'text/html')
        const table = doc.querySelector('table')
        if (!table) throw new Error('No table found in the HTML file.')
        const trs = table.querySelectorAll('tr')
        if (trs.length < 2) throw new Error('The table is empty.')
        const headerCells = trs[0].querySelectorAll('td, th')
        const headers = Array.from(headerCells).map((c) => (c.textContent || '').trim() || `col_${c}`)
        rows = []
        for (let i = 1; i < trs.length; i++) {
          const cells = trs[i].querySelectorAll('td, th')
          const row: Record<string, unknown> = {}
          headers.forEach((h, j) => {
            row[h] = (cells[j]?.textContent || '').trim()
          })
          rows.push(row)
        }
      } else {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        if (!sheet) throw new Error('No worksheet found in the uploaded file.')
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      }
      if (!rows.length) throw new Error('The uploaded sheet is empty.')

      const payloads: any[] = []
      const errors: string[] = []
      let skipped = 0

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]
        const normalizedRow: Record<string, unknown> = {}
        Object.entries(row).forEach(([key, value]) => {
          normalizedRow[normalizeKey(key)] = value
        })

        const clientName = toText(normalizedRow.partyname) ?? toText(normalizedRow.namefirm)
        const timeVal = normalizedRow.time ?? normalizedRow.date
        const dtParsed = parseDateTimeOrDate(timeVal)
        const orderDate = toIsoDate(normalizedRow.date) ?? dtParsed.date
        const orderTime = toTimeString(normalizedRow.time) ?? (orderDate ? dtParsed.time : null)
        const deliveryDate = toIsoDate(normalizedRow.deliverydate)
        const symbolVal = toText(normalizedRow.symbol)
        const purity = toText(normalizedRow.purity) ?? parsePurityFromSymbol(symbolVal)
        const symbol = symbolVal
        const quantitySold = toNumber(normalizedRow.quantitysold) ?? toNumber(normalizedRow.quantity)
        const grams = toNumber(normalizedRow.grams) ?? toNumber(normalizedRow.gm)
        const totalGross = toNumber(normalizedRow.grossrevenue) ?? toNumber(normalizedRow.total)
        const pricePerGram = toNumber((normalizedRow as Record<string, unknown>)['1gmprice'])
        const oPrice = toNumber(normalizedRow.oprice)
        const quotedRateRaw = toNumber(normalizedRow.quotedrate)
          ?? (pricePerGram ? pricePerGram * 10 : (oPrice && grams ? (oPrice * 10) / grams : null))
        let netRevenue = toNumber(normalizedRow.netrevenue1)
        let gstAmount = toNumber(normalizedRow.gst1)
        let tcsAmount = toNumber(normalizedRow.tcs)
        let grossRevenue = totalGross ?? null
        let quotedRate = quotedRateRaw ?? 0
        if (totalGross != null && totalGross > 0) {
          gstAmount = gstAmount ?? Math.round(totalGross * (3 / 103) * 100) / 100
          netRevenue = netRevenue ?? Math.round((totalGross - (gstAmount || 0)) * 100) / 100
          grossRevenue = totalGross
          tcsAmount = tcsAmount ?? Math.round((netRevenue ?? 0) * 0.001 * 100) / 100
          if (grams && !quotedRateRaw && !pricePerGram) quotedRate = Math.round(((netRevenue ?? 0) / grams) * 10) / 10
        } else if (netRevenue != null && grams) {
          gstAmount = gstAmount ?? Math.round(netRevenue * 0.03 * 100) / 100
          tcsAmount = tcsAmount ?? Math.round(netRevenue * 0.001 * 100) / 100
          grossRevenue = grossRevenue ?? netRevenue + (gstAmount || 0) + (tcsAmount || 0)
          if (!quotedRateRaw) quotedRate = Math.round((netRevenue / grams) * 10) / 10
        } else if (grams && quotedRate) {
          netRevenue = netRevenue ?? Math.round((grams * quotedRate / 10) * 100) / 100
          gstAmount = gstAmount ?? Math.round(netRevenue * 0.03 * 100) / 100
          tcsAmount = tcsAmount ?? Math.round(netRevenue * 0.001 * 100) / 100
          grossRevenue = grossRevenue ?? netRevenue + gstAmount + tcsAmount
        }

        if (!clientName || !orderDate || !grams) {
          skipped += 1
          errors.push(`Row ${index + 2}: missing client name, order date, or grams.`)
          continue
        }

        const encoder = new TextEncoder()
        const data = encoder.encode(JSON.stringify(row))
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const importHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        payloads.push({
          client_name: clientName,
          company_name: null,
          order_date: orderDate,
          order_time: orderTime,
          delivery_date: deliveryDate,
          product_symbol: symbol,
          purity,
          quantity: quantitySold ? Math.round(quantitySold) : 1,
          grams,
          quoted_rate: quotedRate,
          making_charges: 0,
          net_revenue: netRevenue,
          gst_amount: gstAmount,
          tcs_amount: tcsAmount,
          gross_revenue: grossRevenue,
          order_source: 'offline',
          city: null,
          trade_status: 'pending_supplier_booking',
          remarks: `Imported from sheet: ${file.name}`,
          created_by: user?.id || null,
          import_hash: importHash,
          raw_data: row
        })
      }

      if (!payloads.length) {
        throw new Error('No valid rows found to import. Please check the sheet formatting.')
      }

      const existingHashes = new Set<string>()
      for (let i = 0; i < payloads.length; i += 200) {
        const chunk = payloads.slice(i, i + 200)
        const hashes = chunk.map(p => p.import_hash)
        const { data } = await supabase.from('client_orders').select('import_hash').in('import_hash', hashes)
        data?.forEach((d: any) => existingHashes.add(d.import_hash))
      }

      const newPayloads: any[] = []
      const seenLocally = new Set<string>()

      for (const p of payloads) {
        if (!existingHashes.has(p.import_hash) && !seenLocally.has(p.import_hash)) {
          seenLocally.add(p.import_hash)
          newPayloads.push(p)
        }
      }

      const duplicateCount = payloads.length - newPayloads.length

      if (newPayloads.length > 0) {
        await insertOrdersInChunks(newPayloads)
        setHighlightedHashes(new Set(newPayloads.map(p => p.import_hash)))
        await fetchOrders()
        await sendOrderNotification(newPayloads.length, file.name)
      } else {
        setHighlightedHashes(new Set())
        await fetchOrders() // just to refresh in case things changed
      }

      setImportSummary({ inserted: newPayloads.length, skipped, errors, fileName: file.name, duplicates: duplicateCount })
    } catch (error) {
      setImportError((error as Error).message)
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const fetchOrders = async () => {
    try {
      const { data, error } = await withTimeout(supabase.from('client_orders').select('*').order('created_at', { ascending: false }))
      if (error) throw error
      setOrders(data || [])
    } catch (error) { console.error('Error fetching orders:', error) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const grams = parseFloat(formData.grams) || 0
      const quoted_rate = parseFloat(formData.quoted_rate) || 0
      const making_charges = parseFloat(formData.making_charges) || 0
      const net_revenue = (grams * quoted_rate) + making_charges
      const gst_amount = net_revenue * 0.03
      const tcs_amount = net_revenue * 0.001
      const gross_revenue = net_revenue + gst_amount + tcs_amount

      const { error } = await supabase.from('client_orders').insert({
        client_name: formData.client_name, company_name: formData.company_name || null,
        order_date: formData.order_date, delivery_date: formData.delivery_date || null,
        product_symbol: formData.product_symbol || null, purity: formData.purity || null,
        grams, quantity: parseInt(formData.quantity) || 1, quoted_rate, making_charges,
        net_revenue, gst_amount, tcs_amount, gross_revenue,
        order_source: formData.order_source, city: formData.city || null,
        trade_status: 'pending_supplier_booking', remarks: formData.remarks || null,
        created_by: user?.id || null,
      })
      if (error) throw error
      setShowModal(false)
      setFormData({ client_name: '', company_name: '', order_date: new Date().toISOString().split('T')[0], delivery_date: '', product_symbol: '', purity: '', grams: '', quantity: '', quoted_rate: '', making_charges: '0', order_source: 'offline', city: '', remarks: '' })
      fetchOrders()
      sendOrderNotification(1, `Client: ${formData.client_name}, Product: ${formData.product_symbol || '-'} (${grams}g)`, 'manual entry')
    } catch (error) { console.error('Error creating order:', error); alert('Failed to create order') }
    finally { setSaving(false) }
  }

  const sendToSupplier = async (orderId: string) => {
    try {
      await supabase.from('client_orders').update({ trade_status: 'pending_hedge' }).eq('id', orderId)
      fetchOrders()
    } catch (error) { console.error('Error updating status:', error) }
  }

  const filteredOrders = orders.filter(order =>
    order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const dynamicKeys = useMemo(() => {
    const keys = new Set<string>()
    filteredOrders.forEach(order => {
      // @ts-ignore
      if (order.raw_data && typeof order.raw_data === 'object') {
        // @ts-ignore
        Object.keys(order.raw_data).forEach(k => keys.add(k))
      }
    })
    return Array.from(keys)
  }, [filteredOrders])

  const statusColors: Record<string, string> = {
    pending_supplier_booking: 'bg-yellow-100 text-yellow-800',
    pending_hedge: 'bg-blue-100 text-blue-800',
    pending_payment: 'bg-amber-100 text-amber-800',
    payment_verified: 'bg-green-100 text-green-800',
    do_created: 'bg-purple-100 text-purple-800',
    in_delivery: 'bg-indigo-100 text-indigo-800',
    reconciliation_pending: 'bg-orange-100 text-orange-800',
    closed: 'bg-slate-100 text-slate-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="page-excel-title">Client Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.html"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors disabled:opacity-60"
          >
            <Upload className="w-4 h-4 mr-1" />
            {importing ? 'Importing...' : 'Import Sheet'}
          </button>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
            <Plus className="w-4 h-4 mr-1" />New Order
          </button>
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>

      {importError && (
        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 flex-shrink-0">
          {importError}
        </div>
      )}

      {importSummary && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 flex-shrink-0">
          <p className="font-medium">Imported {importSummary.inserted} new orders from {importSummary.fileName}.</p>
          {(importSummary.duplicates ?? 0) > 0 && <p className="text-amber-700">Skipped {importSummary.duplicates} duplicate orders.</p>}
          {importSummary.skipped > 0 && <p>Skipped {importSummary.skipped} rows with missing data.</p>}
          {importSummary.errors.slice(0, 3).map((message, idx) => (
            <p key={`${message}-${idx}`}>{message}</p>
          ))}
        </div>
      )}

      <div className="bg-white rounded border border-slate-200 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="table-excel">
            <thead className="sticky top-0 z-10">
              <tr>
                {['Sr.No', 'Order #', 'Client', 'Product', 'Grams', 'Rate', 'Revenue', 'Status', ...dynamicKeys, 'Actions'].map((h, i) => (
                  <th key={h} className={i <= 1 ? 'sticky left-0 z-20 bg-slate-100' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, idx) => (
                <tr key={order.id} className={order.import_hash && highlightedHashes.has(order.import_hash) ? 'bg-emerald-50' : ''}>
                  <td className="text-slate-600 text-center sticky left-0 z-10 bg-inherit w-12">{idx + 1}</td>
                  <td className="text-slate-900 sticky left-12 z-10 bg-inherit border-l border-slate-200">{order.order_number || '-'}</td>
                  <td className="text-slate-900">
                    <span className="font-medium">{order.client_name}</span>
                    {order.company_name && <span className="text-slate-500 block">{order.company_name}</span>}
                  </td>
                  <td className="text-slate-600">{order.product_symbol || '-'} {order.purity ? `(${order.purity})` : ''}</td>
                  <td className="text-slate-900">{order.grams}g</td>
                  <td className="text-slate-900">₹{order.quoted_rate?.toLocaleString() || '-'}</td>
                  <td className="text-slate-900">₹{order.gross_revenue?.toLocaleString() || '-'}</td>
                  <td>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[order.trade_status] || 'bg-slate-100'}`}>
                      {order.trade_status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    {order.trade_status === 'pending_supplier_booking' && (
                      <button onClick={() => sendToSupplier(order.id)} className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-blue-500 hover:bg-blue-600 text-white rounded whitespace-nowrap">
                        <Send className="w-3 h-3 mr-1" />Send to Supplier
                      </button>
                    )}
                  </td>
                  {dynamicKeys.map(key => (
                    <td key={key} className="text-slate-600 whitespace-nowrap">
                      {/* @ts-ignore */}
                      {order.raw_data?.[key] !== undefined ? String(order.raw_data[key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No orders found</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">New Client Order</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Client Name *', key: 'client_name', required: true, type: 'text', placeholder: '' },
                  { label: 'Company Name', key: 'company_name', required: false, type: 'text', placeholder: '' },
                  { label: 'Order Date *', key: 'order_date', required: true, type: 'date', placeholder: '' },
                  { label: 'Delivery Date', key: 'delivery_date', required: false, type: 'date', placeholder: '' },
                  { label: 'Product Symbol', key: 'product_symbol', required: false, type: 'text', placeholder: 'e.g., GOLDGUINEA24K' },
                  { label: 'Purity', key: 'purity', required: false, type: 'text', placeholder: 'e.g., 24K, 22K' },
                  { label: 'Grams *', key: 'grams', required: true, type: 'number', placeholder: '' },
                  { label: 'Quantity', key: 'quantity', required: false, type: 'number', placeholder: '' },
                  { label: 'Quoted Rate (₹/10g) *', key: 'quoted_rate', required: true, type: 'number', placeholder: '' },
                  { label: 'Making Charges (₹)', key: 'making_charges', required: false, type: 'number', placeholder: '' },
                  { label: 'City', key: 'city', required: false, type: 'text', placeholder: '' },
                ].map(({ label, key, required, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input type={type} required={required} placeholder={placeholder}
                      value={(formData as any)[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Order Source</label>
                  <select value={formData.order_source} onChange={(e) => setFormData({ ...formData, order_source: e.target.value as 'online' | 'offline' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
