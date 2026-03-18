/**
 * Shared sheet import: parse CSV/XLS/XLSX, validate columns, build client_orders payloads.
 * Deduplication uses composite key: Date + Time + Party Name.
 */

import * as XLSX from 'xlsx'
import { extractCity, salesPersonFor } from './hardikUtils'

export const REQUIRED_COLUMN_HINTS = ['date', 'time', 'partyname', 'namefirm', 'quantity', 'quantitysold', 'grams', 'gm']

export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

export function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length ? text : null
}

export function toIsoDate(value: unknown): string | null {
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

export function toTimeString(value: unknown): string | null {
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
  const timePart = text.replace(/:(\d{3})$/, '')
  const match = timePart.match(/\d{1,2}:\d{2}(?::\d{2})?/)
  return match ? (match[0].length === 5 ? `${match[0]}:00` : match[0]) : (text.length === 5 ? `${text}:00` : text)
}

function parsePurityFromSymbol(symbol: string | null | undefined): string | null {
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

function parseDateTimeOrDate(value: unknown): { date: string | null; time: string | null } {
  if (value === null || value === undefined || value === '') return { date: null, time: null }
  const text = String(value).trim().replace(/:(\d{3})$/, '')
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return { date: null, time: null }
  return {
    date: d.toISOString().split('T')[0],
    time: d.toTimeString().slice(0, 8),
  }
}

/** Composite key for deduplication: Date + Time + Party Name */
export function compositeKey(orderDate: string, orderTime: string | null, clientName: string): string {
  return `${orderDate}|${orderTime ?? ''}|${(clientName ?? '').trim().toLowerCase()}`
}

export interface ImportPayload {
  payload: Record<string, unknown>
  compositeKey: string
}

export interface ParseResult {
  payloads: ImportPayload[]
  errors: string[]
  skipped: number
}

/**
 * Parse buffer (CSV/XLS/XLSX/HTML) into rows of object records.
 */
export function parseSheetBuffer(buffer: ArrayBuffer): Record<string, unknown>[] {
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
    const rows: Record<string, unknown>[] = []
    for (let i = 1; i < trs.length; i++) {
      const cells = trs[i].querySelectorAll('td, th')
      const row: Record<string, unknown> = {}
      headers.forEach((h, j) => {
        row[h] = (cells[j]?.textContent || '').trim()
      })
      rows.push(row)
    }
    return rows
  }
  const u8 = new Uint8Array(buffer)
  const looksLikeText = u8.slice(0, 128).every((b) => b === 0x0a || b === 0x0d || b === 0x09 || (b >= 0x20 && b <= 0x7e) || b >= 0x80)
  let workbook: XLSX.WorkBook
  if (looksLikeText) {
    const text = new TextDecoder().decode(buffer)
    workbook = XLSX.read(text, { type: 'string', cellDates: true })
  } else {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('No worksheet found in the uploaded file.')
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
}

/**
 * Validate that first row has at least some required-like columns (normalized).
 * Accepts a combined date+time in the "Time" column if no separate "Date" column.
 */
export function validateRequiredColumns(firstRow: Record<string, unknown>): { valid: boolean; message?: string } {
  const keys = new Set(Object.keys(firstRow).map(normalizeKey))
  const hasDate = keys.has('date')
  const hasTime = keys.has('time')
  const hasDateOrTime = hasDate || hasTime
  const hasParty = keys.has('partyname') || keys.has('namefirm')
  const hasQtyOrGrams = keys.has('quantity') || keys.has('quantitysold') || keys.has('grams') || keys.has('gm')
  if (!hasDateOrTime || !hasParty || !hasQtyOrGrams) {
    return {
      valid: false,
      message: 'Invalid format. Required columns: Date (or Time with date), Party Name (or Name/Firm), and Quantity/Grams.',
    }
  }
  return { valid: true }
}

/**
 * Build client_orders insert payloads from parsed rows. Uses composite key Date+Time+Party Name.
 */
export async function buildOrderPayloads(
  rows: Record<string, unknown>[],
  options: { userId: string | null; fileName: string }
): Promise<ParseResult> {
  const errors: string[] = []
  let skipped = 0
  const payloads: ImportPayload[] = []

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

    const quotedRateRaw = toNumber(normalizedRow.quotedrate)
    let netRevenue: number | null = null
    let gstAmount: number | null = null
    let grossRevenue: number | null = null
    let quotedRate = quotedRateRaw ?? (pricePerGram ?? 0)

    if (totalGross != null && totalGross > 0) {
      gstAmount = Math.round(totalGross * (3 / 103) * 100) / 100
      netRevenue = Math.round((totalGross - gstAmount) * 100) / 100
      grossRevenue = totalGross
      if (!quotedRateRaw && !pricePerGram && grams) {
        quotedRate = Math.round((netRevenue / grams) * 100) / 100
      }
    } else if (grams && quotedRate) {
      netRevenue = Math.round(grams * quotedRate * 100) / 100
      gstAmount = Math.round(netRevenue * 0.03 * 100) / 100
      grossRevenue = Math.round((netRevenue + gstAmount) * 100) / 100
    }

    const tcsAmount = null

    if (!clientName || !orderDate || !grams) {
      skipped += 1
      errors.push(`Row ${index + 2}: missing client name, order date, or grams.`)
      continue
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(row))
    const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const importHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    const city = extractCity(symbol)
    const salesPerson = salesPersonFor(symbol)
    const rawData = { ...row, ...(salesPerson ? { sales_person: salesPerson } : {}) }

    const key = compositeKey(orderDate, orderTime, clientName)
    payloads.push({
      compositeKey: key,
      payload: {
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
        city: city || null,
        trade_status: 'Online',
        remarks: `Imported from sheet: ${options.fileName}`,
        created_by: options.userId,
        import_hash: importHash,
        raw_data: rawData,
      },
    })
  }

  return { payloads, errors, skipped }
}
