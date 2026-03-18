import { useState, useCallback, useRef, useEffect } from 'react'
import { formatDate, formatRupeeWithSymbol, formatNumberIndian } from '../lib/hardikUtils'
import { Download, Search, ChevronsDown, ChevronDown } from 'lucide-react'
import { useRealtimeTable } from '../hooks/useRealtimeSync'
import { useLatestImportIds } from '../hooks/useAppSettings'
import { supabase } from '../api/supabase'
import type { ClientOrder } from '../types'
import * as XLSX from 'xlsx'

export default function ClientOrdersPage() {
  const [orders, loading] = useRealtimeTable<ClientOrder>('client_orders', {
    orderBy: [{ column: 'created_at', ascending: false }],
  })
  const [highlightedIds] = useLatestImportIds()
  const [searchTerm, setSearchTerm] = useState('')
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [showScrollBottom, setShowScrollBottom] = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const [editingTcs, setEditingTcs] = useState<{ orderId: string; value: string } | null>(null)

  const saveTcs = useCallback(async () => {
    if (!editingTcs) return
    const n = parseFloat(editingTcs.value.replace(/,/g, ''))
    const tcs_amount = isNaN(n) ? null : Math.round(n * 100) / 100
    await supabase.from('client_orders').update({ tcs_amount }).eq('id', editingTcs.orderId)
    setEditingTcs(null)
  }, [editingTcs])

  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const handleTableScroll = useCallback(() => {
    const el = tableContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setShowScrollBottom(!atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    tableContainerRef.current?.scrollTo({ top: tableContainerRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  const filteredOrders = orders.filter(order =>
    order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.product_symbol?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exportData = (format: 'xlsx' | 'xls' | 'csv') => {
    const rows = filteredOrders.map((order, idx) => ({
      'Sr.No': idx + 1,
      'Date': formatDate(order.order_date) || '',
      'Time': order.order_time || '',
      'Delivery Date': formatDate(order.delivery_date) || '',
      'Purity': order.purity ?? '',
      'Party Name': order.client_name ?? '',
      'Symbol': order.product_symbol ?? '',
      'Quantity Sold': order.quantity ?? 1,
      'Grams': order.grams ?? 0,
      'Quoted Rate': order.quoted_rate != null ? formatRupeeWithSymbol(order.quoted_rate, 2) : '',
      'Net Revenue_1': order.net_revenue != null ? formatRupeeWithSymbol(order.net_revenue, 2) : '',
      'GST_1': order.gst_amount != null ? formatRupeeWithSymbol(order.gst_amount, 2) : '',
      'TCS': order.tcs_amount ? formatRupeeWithSymbol(order.tcs_amount, 2) : '',
      'Gross Revenue': order.gross_revenue != null ? formatRupeeWithSymbol(order.gross_revenue, 2) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Meghna - Client Orders')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
    const bookType = format === 'xls' ? 'biff8' : format
    XLSX.writeFile(wb, `ClientOrders_${stamp}.${format}`, { bookType: bookType as XLSX.BookType })
    setShowExportMenu(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>

  return (
    <div className="page-excel space-y-1">
      <div className="page-excel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="page-excel-title">Meghna - Client Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setShowExportMenu((p) => !p)}
              disabled={filteredOrders.length === 0}
              className="inline-flex items-center px-2 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded transition-colors disabled:opacity-60"
            >
              <Download className="w-4 h-4 mr-1" />Export
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded shadow-lg z-30 min-w-[110px]">
                {([['xlsx', 'Excel (.xlsx)'], ['xls', 'Excel (.xls)'], ['csv', 'CSV (.csv)']] as const).map(([fmt, label]) => (
                  <button key={fmt} type="button" onClick={() => exportData(fmt)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors first:rounded-t last:rounded-b">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="page-excel-search" />
      </div>

      <div className="bg-white rounded border border-slate-200 flex-1 min-h-0 flex flex-col relative">
        <div className="table-container" ref={tableContainerRef} onScroll={handleTableScroll}>
          <table className="table-excel">
            <colgroup>
              <col style={{ width: '2.5rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '5rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: '12rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '5.5rem' }} />
              <col style={{ width: '9rem' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {['Sr.No', 'Date', 'Time', 'Delivery Date', 'Purity', 'Party Name', 'Symbol', 'Quantity Sold', 'Grams', 'Quoted Rate', 'Net Revenue_1', 'GST_1', 'TCS', 'Gross Revenue'].map((h, i) => (
                  <th key={h} className={`${i === 0 ? 'text-center w-12' : ''} ${h === 'Gross Revenue' ? 'min-w-[9rem]' : ['Quoted Rate', 'Net Revenue_1', 'GST_1', 'TCS'].includes(h) ? 'min-w-[5.5rem]' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, idx) => {
                const nr = order.net_revenue ?? 0
                return (
                <tr key={order.id} className={highlightedIds.has(order.id) ? 'bg-amber-100' : ''}>
                  <td className="text-slate-600 text-center w-12 whitespace-nowrap">{idx + 1}</td>
                  <td className="text-slate-900 whitespace-nowrap">{formatDate(order.order_date)}</td>
                  <td className="text-slate-600 whitespace-nowrap">{order.order_time || ''}</td>
                  <td className="text-slate-600 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                  <td className="text-slate-600">{order.purity ?? '-'}</td>
                  <td className="text-slate-900 font-medium">{order.client_name}</td>
                  <td className="text-slate-600">{order.product_symbol ?? '-'}</td>
                  <td className="text-slate-900 text-right">{formatNumberIndian(order.quantity ?? 1)}</td>
                  <td className="text-slate-900 text-right">{formatNumberIndian(order.grams)}g</td>
                  <td className="text-slate-900 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(order.quoted_rate, 2) || '-'}</td>
                  <td className="text-slate-900 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(nr, 2) || '-'}</td>
                  <td className="text-slate-600 text-right min-w-[5.5rem]">{formatRupeeWithSymbol(order.gst_amount, 2) || '-'}</td>
                  <td className="text-slate-600 text-right min-w-[5.5rem]">
                    {editingTcs?.orderId === order.id ? (
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        className="w-full text-right text-xs px-1 py-0 border border-amber-400 rounded outline-none focus:ring-1 focus:ring-amber-300"
                        value={editingTcs.value}
                        onChange={(e) => setEditingTcs({ orderId: order.id, value: e.target.value })}
                        onBlur={saveTcs}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveTcs(); if (e.key === 'Escape') setEditingTcs(null); }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="w-full text-right text-xs hover:bg-amber-50 rounded px-1 py-0 transition-colors cursor-pointer"
                        onClick={() => setEditingTcs({ orderId: order.id, value: order.tcs_amount ? String(order.tcs_amount) : '' })}
                      >
                        {order.tcs_amount ? formatRupeeWithSymbol(order.tcs_amount, 2) : ''}
                      </button>
                    )}
                  </td>
                  <td className="text-slate-900 text-right min-w-[9rem] whitespace-nowrap">{formatRupeeWithSymbol(order.gross_revenue, 2) || '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No orders found</div>}
        {filteredOrders.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg transition-all"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            Bottom
          </button>
        )}
      </div>

    </div>
  )
}
