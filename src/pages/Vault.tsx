/**
 * Vault.tsx — Bullion Inventory Management
 *
 * Handles the real agency Excel format used by Sequel Logistics (and similar):
 *   • One workbook per vault per day
 *   • One sheet per SKU (transaction ledger with running balance)
 *   • "Sheet1" = EOD summary (authoritative closing quantities)
 *   • Vault name and report date extracted from sheet headers
 *   • Full transaction history parsed into vault_transactions table
 *   • Closing balance from footer row → vault_inventory (upserted)
 *
 * Column layout (0-based) in every SKU sheet:
 *   0  Sr.No | 1  Deposit date | 2  Delivery date | 3  DO Ref No.
 *   4  Dep Qty (bars) | 5  Dep Wt | 6  Del Qty (bars) | 7  Del Wt
 *   8  CounterParty | 9  Receiver | 10 Bal Qty | 11 Bal Wt
 *   12 Nature (DD/WD) | 13 Docket No. | 14 Bar No.
 */

import { useState, useCallback, useRef } from 'react'
import { supabase } from '../api/supabase'
import {
  Plus, Search, X, Upload, AlertTriangle, ChevronDown, ChevronRight,
  BarChart2, RefreshCw, Download, CheckCircle, Package, Calendar,
  FileSpreadsheet, Layers, Eye, EyeOff, History, ArrowDown, ArrowUp,
} from 'lucide-react'
import { formatNumberIndian } from '../lib/hardikUtils'
import { useRealtimeTable } from '../hooks/useRealtimeSync'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultLocation {
  id: string
  vault_name: string      // e.g. "Sequel Delhi"
  agency: string          // e.g. "Sequel"
  city: string            // e.g. "Delhi"
  is_active: boolean
  created_at: string
}

interface SKU {
  id: string
  purity: number          // 995 | 999 | 999.9
  weight_grams: number    // 1000 | 500 | 100 | 50 | 20 | 10 | 8 | 5 | 4 | 2 | 1
  sku_label: string       // e.g. "999.9 / 10g Coin"
  product_type: string    // "bar" | "coin"
  equiv_995_per_unit: number
  is_active: boolean
}

interface VaultInventory {
  id: string
  vault_id: string
  sku_id: string
  report_date: string
  closing_qty: number
  closing_grams: number
  equiv_995_grams: number
  total_deposited_qty: number
  total_delivered_qty: number
  recon_status: 'ok' | 'mismatch' | 'pending'
  discrepancy_grams: number
  source_file: string | null
  created_at: string
  vault?: VaultLocation
  sku?: SKU
}

interface VaultTransaction {
  id: string
  vault_id: string
  sku_id: string
  txn_date: string
  txn_type: 'inward' | 'outward'
  qty: number
  weight_grams: number
  do_reference: string | null
  counterparty: string | null
  receiver: string | null
  nature_of_delivery: string | null   // 'DD' | 'WD'
  docket_no: string | null
  bar_numbers: string | null
  running_bal_qty: number
  running_bal_grams: number
  source_file: string | null
  created_at: string
  vault?: VaultLocation
  sku?: SKU
}

interface UploadLog {
  id: string
  agency: string
  vault_name: string
  file_name: string
  report_date: string
  skus_parsed: number
  inventory_rows: number
  transaction_rows: number
  status: 'success' | 'partial' | 'failed'
  error_detail: string | null
  uploaded_at: string
}

type TabView = 'dashboard' | 'inventory' | 'transactions' | 'reconciliation' | 'upload' | 'history'
type AgencyFilter = 'All' | 'Brinks' | 'Sequel' | 'CMS' | 'Safegold'

// ─── SKU resolution maps ──────────────────────────────────────────────────────

// Sheet1 denomination label → [purity, weight_grams]
const SHEET1_LABEL_MAP: Record<string, [number, number]> = {
  '995 -1 kg':        [995,   1000],
  '999-100 grams':    [999,   100],
  '9999-1 Kg':        [999.9, 1000],
  '995-500 GMS':      [995,   500],
  '995- 100 grams':   [995,   100],
  '99.99- 1 grams':   [999.9, 1],
  '999.9- 2 grams':   [999.9, 2],
  '99.99- 10 grams':  [999.9, 10],
  '99.99- 05 grams':  [999.9, 5],
  '99.99- 50 grams':  [999.9, 50],
  '99.99- 20 grams':  [999.9, 20],
  '99.99 - 04 grams': [999.9, 4],
  '99.90 - 08 gms':   [999.9, 8],
}

// SKU sheet name → [purity, weight_grams]
const SHEET_SKU_MAP: Record<string, [number, number]> = {
  '500 Gms 995':               [995,   500],
  'GOLD COIN 1 GRAMS   999.9': [999.9, 1],
  'GOLD COIN 2 GRAMS   999.9 ':[999.9, 2],
  'GOLD COIN 4 GRAMS  99.99':  [999.9, 4],
  'GOLD COIN 5 GRAMS   999.9 ':[999.9, 5],
  'GOLD COIN 8 GRAMS   999.9': [999.9, 8],
  'GOLD COIN 10 GRAMS 99.99':  [999.9, 10],
  'GOLD COIN 20 GRAMS 99.99':  [999.9, 20],
  'GOLD COIN 50 GRAMS 99.99 ': [999.9, 50],
  'Gold 100 grams 999':        [999,   100],
  'Gold 100 grams 995':        [995,   100],
  'GOLD - 1kg 995':            [995,   1000],
}

// Column indices in each SKU sheet (0-based)
const C = {
  DEP_DATE:  1,
  DEL_DATE:  2,
  DO_REF:    3,
  DEP_QTY:   4,
  DEP_WT:    5,
  DEL_QTY:   6,
  DEL_WT:    7,
  PARTY:     8,
  RECEIVER:  9,
  BAL_QTY:   10,
  BAL_WT:    11,
  NATURE:    12,
  DOCKET:    13,
  BAR_NO:    14,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const toStr = (v: unknown): string =>
  v === null || v === undefined || String(v) === 'nan' ? '' : String(v).trim()

const notBlank = (v: unknown): boolean => {
  const s = toStr(v)
  return s !== '' && s !== 'NaT' && s !== 'nan'
}

const equiv995 = (purity: number, weight: number) =>
  parseFloat((weight * (purity / 995)).toFixed(6))

const todayStr = () => new Date().toISOString().split('T')[0]

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const AGENCIES: AgencyFilter[] = ['All', 'Brinks', 'Sequel', 'CMS', 'Safegold']

// ─── Excel Parser ─────────────────────────────────────────────────────────────

interface ParseResult {
  vault_name: string
  report_date: string
  inventory: Partial<VaultInventory>[]
  transactions: Partial<VaultTransaction>[]
  errors: string[]
  skus_parsed: number
}

function parseAgencyWorkbook(
  wb: XLSX.WorkBook,
  fileName: string,
  vaults: VaultLocation[],
  skus: SKU[],
): ParseResult {
  const errors: string[] = []
  const inventory: Partial<VaultInventory>[] = []
  const transactions: Partial<VaultTransaction>[] = []
  let vault_name = ''
  let report_date = ''
  let skus_parsed = 0

  // ── Helper: find vault and sku records ──
  const findVault = (name: string): VaultLocation | undefined =>
    vaults.find(v =>
      v.vault_name.toLowerCase().replace(/\s+/g, '') ===
      name.toLowerCase().replace(/\s+/g, '')
    )

  const findSku = (purity: number, weight: number): SKU | undefined =>
    skus.find(s =>
      Math.abs(s.purity - purity) < 0.05 &&
      Math.abs(s.weight_grams - weight) < 0.05
    )

  // ── Step 1: Parse Sheet1 (EOD Summary) if present ──
  // Sheet1 is the authoritative source for closing balances.
  const sheet1 = wb.Sheets['Sheet1']
  if (sheet1) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet1, { header: 1, defval: null })

    // Extract vault name and date from any SKU sheet (they're all the same vault)
    // We'll get these below from the first SKU sheet

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      const label = toStr(row[0]).trim()
      const total = toNum(row[3]) // TOTAL column

      if (!label || !SHEET1_LABEL_MAP[label]) continue
      const [purity, weight] = SHEET1_LABEL_MAP[label]
      skus_parsed++

      // We collect these but will enrich with vault_id after extracting vault name
      inventory.push({
        _purity: purity,
        _weight: weight,
        closing_qty: total,
        closing_grams: total * weight,
        equiv_995_grams: equiv995(purity, total * weight),
        total_deposited_qty: 0,
        total_delivered_qty: 0,
        recon_status: 'ok',
        discrepancy_grams: 0,
        source_file: fileName,
      } as Partial<VaultInventory> & { _purity: number; _weight: number })
    }
  }

  // ── Step 2: Parse each SKU sheet for transactions + validate closing balance ──
  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'Sheet1') continue
    const skuMap = SHEET_SKU_MAP[sheetName]
    if (!skuMap) continue

    const [purity, weight] = skuMap
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
    if (rows.length < 10) continue

    // Extract vault name (row 2, col 2) and report date (row 5, col 2) once
    if (!vault_name) {
      vault_name = toStr((rows[2] as unknown[])[2])
    }
    if (!report_date) {
      const rawDate = toStr((rows[5] as unknown[])[2])
      // Normalize date: could be "2026-03-21 00:00:00" or similar
      report_date = rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate
    }

    const vault = findVault(vault_name)
    if (!vault) {
      errors.push(`Sheet "${sheetName}": vault "${vault_name}" not found in database — add it first`)
      continue
    }

    const sku = findSku(purity, weight)
    if (!sku) {
      errors.push(`Sheet "${sheetName}": SKU purity=${purity} weight=${weight}g not found in database`)
      continue
    }

    // Find closing balance footer row (search from bottom for "closing" keyword)
    let closingQty = 0
    let closingWt = 0
    let totalDep = 0
    let totalDel = 0

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] as unknown[]
      const hasClosing = row.some(v => toStr(v).toLowerCase().includes('closing'))
      if (hasClosing) {
        closingQty = toNum(row[C.BAL_QTY])
        closingWt  = toNum(row[C.BAL_WT])
        totalDep   = toNum(row[C.DEP_QTY])
        totalDel   = toNum(row[C.DEL_QTY])
        break
      }
    }

    // If Sheet1 didn't exist, push inventory from SKU sheets
    if (!sheet1) {
      skus_parsed++
      inventory.push({
        vault_id: vault.id,
        sku_id: sku.id,
        report_date,
        closing_qty: closingQty,
        closing_grams: closingWt,
        equiv_995_grams: equiv995(purity, closingWt),
        total_deposited_qty: totalDep,
        total_delivered_qty: totalDel,
        recon_status: 'ok',
        discrepancy_grams: 0,
        source_file: fileName,
      })
    } else {
      // Enrich the Sheet1-parsed record with ids and totals
      const existing = (inventory as (Partial<VaultInventory> & { _purity?: number; _weight?: number })[])
        .find(r => r._purity === purity && Math.abs((r._weight ?? 0) - weight) < 0.05)
      if (existing) {
        existing.vault_id = vault.id
        existing.sku_id = sku.id
        existing.report_date = report_date
        existing.total_deposited_qty = totalDep
        existing.total_delivered_qty = totalDel
        // Cross-check Sheet1 qty vs SKU sheet closing balance
        const diff = toNum(existing.closing_qty) - closingQty
        if (Math.abs(diff) > 0) {
          existing.recon_status = 'mismatch'
          existing.discrepancy_grams = diff * weight
          errors.push(`SKU ${purity}/${weight}g: Sheet1 says ${existing.closing_qty} pcs but ledger closing is ${closingQty} pcs (diff: ${diff})`)
        }
      }
    }

    // Parse transaction rows (data starts at row 9, i.e. index 9)
    for (let i = 9; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      const depDate  = toStr(row[C.DEP_DATE])
      const delDate  = toStr(row[C.DEL_DATE])
      const depQty   = toNum(row[C.DEP_QTY])
      const depWt    = toNum(row[C.DEP_WT])
      const delQty   = toNum(row[C.DEL_QTY])
      const delWt    = toNum(row[C.DEL_WT])
      const party    = toStr(row[C.PARTY])
      const receiver = toStr(row[C.RECEIVER])
      const nature   = toStr(row[C.NATURE])
      const docket   = toStr(row[C.DOCKET])
      const barNo    = toStr(row[C.BAR_NO])
      const balQty   = toNum(row[C.BAL_QTY])
      const balWt    = toNum(row[C.BAL_WT])
      const doRef    = toStr(row[C.DO_REF])

      // Skip header, blank, and footer rows
      if (!notBlank(depDate) && !notBlank(delDate)) continue
      if (party.toLowerCase().includes('closing')) continue

      const isInward = notBlank(depDate) && depQty > 0
      const txnDate  = isInward
        ? depDate.substring(0, 10)
        : delDate.substring(0, 10)

      if (!txnDate || txnDate.length < 8) continue

      transactions.push({
        vault_id: vault.id,
        sku_id: sku.id,
        txn_date: txnDate,
        txn_type: isInward ? 'inward' : 'outward',
        qty: isInward ? depQty : delQty,
        weight_grams: isInward ? depWt : delWt,
        do_reference: doRef || null,
        counterparty: party || null,
        receiver: receiver || null,
        nature_of_delivery: nature || null,
        docket_no: docket || null,
        bar_numbers: barNo || null,
        running_bal_qty: balQty,
        running_bal_grams: balWt,
        source_file: fileName,
      })
    }
  }

  // Clean up internal helper fields before returning
  for (const row of inventory as (Partial<VaultInventory> & { _purity?: number; _weight?: number })[]) {
    delete row._purity
    delete row._weight
  }

  return { vault_name, report_date, inventory, transactions, errors, skus_parsed }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ElementType
}) {
  return (
    <div className={`${color} rounded-lg p-3 text-white`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] opacity-80 uppercase tracking-wide font-medium">{label}</p>
        <Icon className="w-3.5 h-3.5 opacity-70" />
      </div>
      <p className="text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  )
}

function ReconBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    ok: 'bg-green-100 text-green-700',
    mismatch: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    success: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${s[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  )
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({ vaults, skus, onDone }: {
  vaults: VaultLocation[]; skus: SKU[]; onDone: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [results, setResults] = useState<{
    name: string; vault: string; date: string
    inv: number; txns: number; errors: string[]
  }[]>([])

  const addFiles = (fl: FileList | null) => {
    if (!fl) return
    setFiles(p => [...p, ...Array.from(fl).filter(f => /\.(xlsx|xls)$/i.test(f.name))])
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files)
  }, [])

  const handleProcess = async () => {
    if (!files.length) return
    setUploading(true)
    const out: typeof results = []

    for (const file of files) {
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
        const { vault_name, report_date, inventory, transactions, errors, skus_parsed } =
          parseAgencyWorkbook(wb, file.name, vaults, skus)

        // Filter out records missing vault_id or sku_id (parse errors)
        const validInv = inventory.filter(r => r.vault_id && r.sku_id && r.report_date)
        const validTxn = transactions.filter(r => r.vault_id && r.sku_id && r.txn_date)

        // Upsert inventory (one row per vault+sku+date)
        if (validInv.length) {
          const { error } = await supabase
            .from('vault_inventory')
            .upsert(validInv, { onConflict: 'vault_id,sku_id,report_date' })
          if (error) errors.push(`DB inventory error: ${error.message}`)
        }

        // Insert transactions (idempotent via do_reference+vault+sku+date or skip dupes)
        if (validTxn.length) {
          const { error } = await supabase
            .from('vault_transactions')
            .upsert(validTxn, { onConflict: 'vault_id,sku_id,txn_date,do_reference,txn_type' })
          if (error) errors.push(`DB transactions error: ${error.message}`)
        }

        // Upload log
        await supabase.from('vault_upload_log').insert({
          agency: vault_name.split(' ')[0] ?? 'Unknown',
          vault_name,
          file_name: file.name,
          report_date: report_date || null,
          skus_parsed,
          inventory_rows: validInv.length,
          transaction_rows: validTxn.length,
          status: errors.length === 0 ? 'success' : validInv.length > 0 ? 'partial' : 'failed',
          error_detail: errors.join(' | ') || null,
        })

        out.push({
          name: file.name,
          vault: vault_name || '?',
          date: report_date || '?',
          inv: validInv.length,
          txns: validTxn.length,
          errors,
        })
      } catch (err) {
        out.push({ name: file.name, vault: '?', date: '?', inv: 0, txns: 0, errors: [String(err)] })
      }
    }

    setResults(out)
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        <p className="text-[11px] text-amber-800 font-medium mb-0.5">Expected file format (Sequel / agency style)</p>
        <ul className="text-[10px] text-amber-700 space-y-0.5 list-disc list-inside">
          <li>One <strong>.xlsx</strong> workbook per vault per day</li>
          <li><strong>Sheet1</strong> = EOD summary (denomination → total qty)</li>
          <li>One sheet per SKU (e.g. "GOLD COIN 10 GRAMS 99.99") with full transaction ledger</li>
          <li>Vault name auto-extracted from row 3 of any sheet</li>
          <li>Report date auto-extracted from row 6 of any sheet</li>
        </ul>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => document.getElementById('vault-file-input')?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
        }`}
      >
        <Upload className="w-7 h-7 mx-auto mb-2 text-slate-400" />
        <p className="text-sm font-medium text-slate-600">Drop agency Excel reports here</p>
        <p className="text-xs text-slate-400 mt-1">
          Multiple files OK — one file per vault (e.g. Sequel_Delhi.xlsx, Brinks_Mumbai.xlsx…)
        </p>
        <input id="vault-file-input" type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              <span className="flex-1 text-xs text-slate-700 truncate">{f.name}</span>
              <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                className="text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleProcess} disabled={!files.length || uploading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {uploading
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing…</>
            : <><Upload className="w-4 h-4" />Import {files.length > 1 ? `${files.length} files` : 'file'}</>}
        </button>
        {results.length > 0 && (
          <button onClick={onDone}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg">
            Done ✓
          </button>
        )}
      </div>

      {/* Results */}
      {results.map((r, i) => (
        <div key={i} className={`border rounded-lg p-3 ${
          !r.inv && r.errors.length ? 'border-red-200 bg-red-50'
          : r.errors.length ? 'border-amber-200 bg-amber-50'
          : 'border-green-200 bg-green-50'
        }`}>
          <div className="flex items-center gap-2">
            {r.errors.length === 0
              ? <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              : r.inv > 0
                ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                : <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
            <span className="text-xs font-medium text-slate-700 truncate flex-1">{r.name}</span>
            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              {r.vault} · {r.date} · {r.inv} SKUs · {r.txns} txns
            </span>
          </div>
          {r.errors.map((e, j) => (
            <p key={j} className="text-[10px] text-red-700 mt-1 ml-5">{e}</p>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const [vaults, vaultsLoading, refetchVaults] = useRealtimeTable<VaultLocation>('vault_locations', {
    orderBy: [{ column: 'agency', ascending: true }],
  })
  const [skus, skusLoading] = useRealtimeTable<SKU>('vault_skus', {
    orderBy: [{ column: 'weight_grams', ascending: false }],
  })
  const [inventory, invLoading, refetchInv] = useRealtimeTable<VaultInventory>('vault_inventory', {
    orderBy: [{ column: 'report_date', ascending: false }],
  })
  const [transactions, txnLoading] = useRealtimeTable<VaultTransaction>('vault_transactions', {
    orderBy: [{ column: 'txn_date', ascending: false }],
  })
  const [uploadLogs] = useRealtimeTable<UploadLog>('vault_upload_log', {
    orderBy: [{ column: 'uploaded_at', ascending: false }],
  })

  const [tab, setTab] = useState<TabView>('dashboard')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set(['Sequel', 'Brinks']))
  const [show995, setShow995] = useState(false)
  const [showAddVault, setShowAddVault] = useState(false)
  const [showAddSKU, setShowAddSKU] = useState(false)
  const [saving, setSaving] = useState(false)
  const [vaultForm, setVaultForm] = useState({ vault_name: '', agency: '', city: '', is_active: true })
  const [skuForm, setSkuForm] = useState({ purity: '', weight_grams: '', product_type: 'coin' })

  // ── Enrich data with joins ──
  const enrichedInv: VaultInventory[] = inventory.map(r => ({
    ...r,
    vault: vaults.find(v => v.id === r.vault_id),
    sku: skus.find(s => s.id === r.sku_id),
  }))

  const enrichedTxn: VaultTransaction[] = transactions.map(r => ({
    ...r,
    vault: vaults.find(v => v.id === r.vault_id),
    sku: skus.find(s => s.id === r.sku_id),
  }))

  const dateInv = enrichedInv.filter(r => r.report_date === selectedDate)

  const filteredInv = dateInv
    .filter(r => agencyFilter === 'All' || r.vault?.agency === agencyFilter)
    .filter(r => !searchTerm ||
      r.vault?.vault_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.sku?.purity).includes(searchTerm) ||
      String(r.sku?.weight_grams).includes(searchTerm)
    )

  const filteredTxn = enrichedTxn
    .filter(r => agencyFilter === 'All' || r.vault?.agency === agencyFilter)
    .filter(r => !searchTerm ||
      r.vault?.vault_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.counterparty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.bar_numbers?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.do_reference?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .slice(0, 200) // cap for performance

  // ── Totals ──
  const totalGrams   = dateInv.reduce((s, r) => s + r.closing_grams, 0)
  const total995     = dateInv.reduce((s, r) => s + r.equiv_995_grams, 0)
  const mismatches   = dateInv.filter(r => r.recon_status === 'mismatch')
  const agencies     = [...new Set(vaults.map(v => v.agency))].sort()

  // Agency accordion data
  const agencyStats = agencies.map(ag => {
    const agVaults = vaults.filter(v => v.agency === ag)
    const agRows = dateInv.filter(r => agVaults.some(v => v.id === r.vault_id))
    return {
      agency: ag,
      vaultCount: agVaults.length,
      totalGrams: agRows.reduce((s, r) => s + r.closing_grams, 0),
      equiv995: agRows.reduce((s, r) => s + r.equiv_995_grams, 0),
      mismatches: agRows.filter(r => r.recon_status === 'mismatch').length,
      vaults: agVaults.map(v => {
        const rows = agRows.filter(r => r.vault_id === v.id)
        return {
          ...v,
          rows,
          grams: rows.reduce((s, r) => s + r.closing_grams, 0),
          equiv: rows.reduce((s, r) => s + r.equiv_995_grams, 0),
          skuCount: rows.filter(r => r.closing_qty > 0).length,
          hasMismatch: rows.some(r => r.recon_status === 'mismatch'),
        }
      }),
    }
  })

  // SKU-wise totals
  const skuTotals = skus
    .map(sku => {
      const rows = dateInv.filter(r => r.sku_id === sku.id)
      return {
        sku,
        qty: rows.reduce((s, r) => s + r.closing_qty, 0),
        grams: rows.reduce((s, r) => s + r.closing_grams, 0),
        e995: rows.reduce((s, r) => s + r.equiv_995_grams, 0),
        vaults: rows.filter(r => r.closing_qty > 0).length,
      }
    })
    .filter(s => s.grams > 0)
    .sort((a, b) => b.grams - a.grams)

  const toggleAgency = (ag: string) =>
    setExpandedAgencies(prev => {
      const next = new Set(prev)
      next.has(ag) ? next.delete(ag) : next.add(ag)
      return next
    })

  const handleAddVault = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await supabase.from('vault_locations').insert(vaultForm)
      setShowAddVault(false)
      setVaultForm({ vault_name: '', agency: '', city: '', is_active: true })
      await refetchVaults()
    } catch { alert('Failed to add vault') } finally { setSaving(false) }
  }

  const handleAddSKU = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const purity = parseFloat(skuForm.purity)
    const weight = parseFloat(skuForm.weight_grams)
    try {
      await supabase.from('vault_skus').insert({
        purity, weight_grams: weight,
        sku_label: `${purity} / ${weight}g ${skuForm.product_type}`,
        product_type: skuForm.product_type,
        equiv_995_per_unit: equiv995(purity, weight),
        is_active: true,
      })
      setShowAddSKU(false)
      setSkuForm({ purity: '', weight_grams: '', product_type: 'coin' })
    } catch { alert('Failed to add SKU') } finally { setSaving(false) }
  }

  const exportReconciliation = () => {
    const rows = filteredInv.map(r => ({
      'Report Date': r.report_date,
      'Agency': r.vault?.agency,
      'Vault': r.vault?.vault_name,
      'City': r.vault?.city,
      'Purity': r.sku?.purity,
      'Weight (g)': r.sku?.weight_grams,
      'Product': r.sku?.product_type,
      'Total Deposited': r.total_deposited_qty,
      'Total Delivered': r.total_delivered_qty,
      'Closing Qty': r.closing_qty,
      'Closing Grams': r.closing_grams,
      '995 Equiv (g)': r.equiv_995_grams,
      'Discrepancy (g)': r.discrepancy_grams,
      'Status': r.recon_status,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation')
    XLSX.writeFile(wb, `vault-reconciliation-${selectedDate}.xlsx`)
  }

  const exportTransactions = () => {
    const rows = filteredTxn.map(r => ({
      'Date': r.txn_date,
      'Type': r.txn_type,
      'Agency': r.vault?.agency,
      'Vault': r.vault?.vault_name,
      'Purity': r.sku?.purity,
      'Weight (g)': r.sku?.weight_grams,
      'Qty': r.qty,
      'Grams': r.weight_grams,
      'Running Bal Qty': r.running_bal_qty,
      'Running Bal Grams': r.running_bal_grams,
      'DO Reference': r.do_reference,
      'Counterparty': r.counterparty,
      'Receiver': r.receiver,
      'Nature': r.nature_of_delivery,
      'Docket No': r.docket_no,
      'Bar Numbers': r.bar_numbers,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `vault-transactions.xlsx`)
  }

  if (vaultsLoading || skusLoading || invLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
    </div>
  )

  const tabs: { id: TabView; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',      label: 'Dashboard',      icon: BarChart2 },
    { id: 'inventory',      label: 'Inventory',      icon: Package },
    { id: 'transactions',   label: 'Transactions',   icon: History },
    { id: 'reconciliation', label: 'Reconciliation', icon: CheckCircle },
    { id: 'upload',         label: 'Upload',         icon: Upload },
    { id: 'history',        label: 'History',        icon: Calendar },
  ]

  return (
    <div className="page-excel space-y-2">

      {/* Header */}
      <div className="page-excel-header flex-shrink-0">
        <h1 className="page-excel-title">Vault Inventory</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowAddSKU(true)}
            className="inline-flex items-center px-2 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white font-medium rounded transition-colors">
            <Layers className="w-3.5 h-3.5 mr-1" />Add SKU
          </button>
          <button onClick={() => setShowAddVault(true)}
            className="inline-flex items-center px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded transition-colors">
            <Plus className="w-3.5 h-3.5 mr-1" />Add Vault
          </button>
        </div>
      </div>

      {/* Alert bar */}
      {mismatches.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700">
            {mismatches.length} reconciliation mismatch{mismatches.length > 1 ? 'es' : ''} on {fmtDate(selectedDate)} — Sheet1 totals don't match ledger closing balances
          </span>
          <button onClick={() => setTab('reconciliation')} className="ml-auto text-xs text-red-600 underline">
            Review →
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
        <MetricCard label="Total Gold (grams)" value={`${formatNumberIndian(totalGrams)}g`}
          sub={`${formatNumberIndian(total995)}g in 995 equiv`} color="bg-amber-500" icon={Package} />
        <MetricCard label="Vault Locations" value={vaults.filter(v => v.is_active).length}
          sub={`across ${agencies.length} agencies`} color="bg-blue-500" icon={BarChart2} />
        <MetricCard label="SKUs with Stock" value={skuTotals.length}
          sub={`of ${skus.length} tracked`} color="bg-slate-500" icon={Layers} />
        <MetricCard label="Mismatches" value={mismatches.length}
          sub={mismatches.length === 0 ? 'All reconciled ✓' : 'Needs review'}
          color={mismatches.length > 0 ? 'bg-red-500' : 'bg-green-500'} icon={AlertTriangle} />
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-slate-200 flex-shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ═══════ DASHBOARD ═══════ */}
      {tab === 'dashboard' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button onClick={() => setShow995(p => !p)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg transition-colors ${show995 ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
              {show995 ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} 995 equiv
            </button>
            <span className="text-[10px] text-slate-400 ml-1">{dateInv.length} records</span>
            <button onClick={() => refetchInv()} className="ml-auto p-1 text-slate-400 hover:text-amber-500">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Agency accordion */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Agency-wise Stock — {fmtDate(selectedDate)}</span>
            </div>
            {agencyStats.map(ag => (
              <div key={ag.agency} className="border-b border-slate-100 last:border-0">
                <button onClick={() => toggleAgency(ag.agency)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left">
                  {expandedAgencies.has(ag.agency)
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                  <span className="text-xs font-semibold text-slate-800 w-20">{ag.agency}</span>
                  <span className="text-[10px] text-slate-400">{ag.vaultCount} vaults</span>
                  <span className="ml-auto text-xs font-mono text-amber-700 font-semibold">
                    {formatNumberIndian(show995 ? ag.equiv995 : ag.totalGrams)}g
                    {show995 ? ' (995 eq)' : ''}
                  </span>
                  {ag.mismatches > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-semibold">⚠ {ag.mismatches}</span>
                  )}
                </button>

                {expandedAgencies.has(ag.agency) && (
                  <div className="bg-slate-50 px-4 pb-3 pt-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-slate-400 uppercase">
                          <th className="text-left py-1">Vault</th>
                          <th className="text-left">City</th>
                          <th className="text-right">{show995 ? '995 Equiv (g)' : 'Grams'}</th>
                          <th className="text-right">SKUs</th>
                          <th className="text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ag.vaults.map(v => (
                          <tr key={v.id}>
                            <td className="py-1.5 font-medium text-slate-800">{v.vault_name}</td>
                            <td className="text-slate-500">{v.city}</td>
                            <td className="text-right font-mono text-amber-700">
                              {(show995 ? v.equiv : v.grams) > 0
                                ? formatNumberIndian(show995 ? v.equiv : v.grams)
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="text-right text-slate-400">{v.skuCount}</td>
                            <td className="text-right">
                              {v.rows.length === 0
                                ? <span className="text-slate-300 text-[10px]">No data</span>
                                : v.hasMismatch
                                  ? <span className="text-red-500 text-[10px] font-semibold">⚠ mismatch</span>
                                  : <span className="text-green-500 text-[10px]">✓ ok</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {agencyStats.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">
                No inventory for {fmtDate(selectedDate)}.{' '}
                <button onClick={() => setTab('upload')} className="text-amber-600 underline">Upload a report →</button>
              </div>
            )}
          </div>

          {/* SKU-wise table */}
          {skuTotals.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                <span className="text-xs font-semibold text-slate-700">SKU-wise Summary — {fmtDate(selectedDate)}</span>
              </div>
              <div className="table-container">
                <table className="table-excel">
                  <thead className="sticky top-0 z-10">
                    <tr>{['Purity','Weight','Product','Closing Qty','Grams','995 Equiv (g)','Vaults'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {skuTotals.map(({ sku, qty, grams, e995, vaults: vc }) => (
                      <tr key={sku.id}>
                        <td className="text-xs font-mono font-semibold text-slate-800">{sku.purity}</td>
                        <td className="text-xs font-mono">{sku.weight_grams}g</td>
                        <td className="text-xs capitalize text-slate-500">{sku.product_type}</td>
                        <td className="text-xs text-right font-mono font-semibold">{formatNumberIndian(qty)}</td>
                        <td className="text-xs text-right font-mono text-amber-700 font-semibold">{formatNumberIndian(grams)}</td>
                        <td className="text-xs text-right font-mono text-slate-500">{formatNumberIndian(e995)}</td>
                        <td className="text-xs text-right text-slate-400">{vc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ INVENTORY ═══════ */}
      {tab === 'inventory' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="Search vault, purity, weight…" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-52" />
            </div>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <div className="flex gap-1">
              {AGENCIES.map(a => (
                <button key={a} onClick={() => setAgencyFilter(a)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${agencyFilter === a ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {a}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[10px] text-slate-400">{filteredInv.length} records</span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="table-container">
              <table className="table-excel">
                <thead className="sticky top-0 z-10">
                  <tr>{['#','Agency','Vault','City','Purity','Weight','Product','Deposited','Delivered','Closing Qty','Grams','995 Equiv','Status'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredInv.map((r, i) => (
                    <tr key={r.id} className={r.recon_status === 'mismatch' ? 'bg-red-50' : ''}>
                      <td className="text-slate-400 text-center text-xs w-8">{i + 1}</td>
                      <td className="text-xs text-slate-500">{r.vault?.agency}</td>
                      <td className="text-xs font-medium text-slate-800">{r.vault?.vault_name}</td>
                      <td className="text-xs text-slate-500">{r.vault?.city}</td>
                      <td className="text-xs font-mono font-semibold">{r.sku?.purity}</td>
                      <td className="text-xs font-mono">{r.sku?.weight_grams}g</td>
                      <td className="text-xs capitalize text-slate-400">{r.sku?.product_type}</td>
                      <td className="text-xs text-right font-mono text-green-600">{formatNumberIndian(r.total_deposited_qty)}</td>
                      <td className="text-xs text-right font-mono text-red-600">{formatNumberIndian(r.total_delivered_qty)}</td>
                      <td className="text-xs text-right font-mono font-semibold">{formatNumberIndian(r.closing_qty)}</td>
                      <td className="text-xs text-right font-mono text-amber-700">{formatNumberIndian(r.closing_grams)}</td>
                      <td className="text-xs text-right font-mono text-slate-500">{formatNumberIndian(r.equiv_995_grams)}</td>
                      <td><ReconBadge status={r.recon_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredInv.length === 0 && <p className="text-xs text-slate-400 text-center py-10">No records match filters</p>}
          </div>
        </div>
      )}

      {/* ═══════ TRANSACTIONS ═══════ */}
      {tab === 'transactions' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="Search vault, party, DO ref, bar no…" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-64" />
            </div>
            <div className="flex gap-1">
              {AGENCIES.map(a => (
                <button key={a} onClick={() => setAgencyFilter(a)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${agencyFilter === a ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {a}
                </button>
              ))}
            </div>
            <button onClick={exportTransactions}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg">
              <Download className="w-3.5 h-3.5" />Export
            </button>
          </div>
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="table-container">
              <table className="table-excel">
                <thead className="sticky top-0 z-10">
                  <tr>{['Date','Type','Vault','Purity','Wt','Qty','Grams','Bal Qty','Bal Grams','Counterparty','Receiver','DO Ref','Nature','Docket','Bar Nos'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredTxn.map((r, i) => (
                    <tr key={r.id ?? i} className={r.txn_type === 'inward' ? 'bg-green-50/50' : ''}>
                      <td className="text-xs font-mono text-slate-600">{r.txn_date}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.txn_type === 'inward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {r.txn_type === 'inward' ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                          {r.txn_type}
                        </span>
                      </td>
                      <td className="text-xs font-medium text-slate-800 max-w-[120px] truncate">{r.vault?.vault_name}</td>
                      <td className="text-xs font-mono">{r.sku?.purity}</td>
                      <td className="text-xs font-mono">{r.sku?.weight_grams}g</td>
                      <td className={`text-xs text-right font-mono font-semibold ${r.txn_type === 'inward' ? 'text-green-700' : 'text-red-700'}`}>
                        {r.txn_type === 'inward' ? '+' : '-'}{formatNumberIndian(r.qty)}
                      </td>
                      <td className={`text-xs text-right font-mono ${r.txn_type === 'inward' ? 'text-green-600' : 'text-red-600'}`}>
                        {r.txn_type === 'inward' ? '+' : '-'}{formatNumberIndian(r.weight_grams)}
                      </td>
                      <td className="text-xs text-right font-mono text-slate-600">{formatNumberIndian(r.running_bal_qty)}</td>
                      <td className="text-xs text-right font-mono text-amber-700">{formatNumberIndian(r.running_bal_grams)}</td>
                      <td className="text-xs text-slate-600 max-w-[140px] truncate">{r.counterparty ?? '—'}</td>
                      <td className="text-xs text-slate-500 max-w-[100px] truncate">{r.receiver ?? '—'}</td>
                      <td className="text-xs font-mono text-slate-500">{r.do_reference ?? '—'}</td>
                      <td className="text-xs text-slate-500">{r.nature_of_delivery ?? '—'}</td>
                      <td className="text-xs font-mono text-slate-400">{r.docket_no ?? '—'}</td>
                      <td className="text-xs text-slate-400 max-w-[160px] truncate">{r.bar_numbers ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTxn.length === 0 && <p className="text-xs text-slate-400 text-center py-10">No transactions found</p>}
            {txnLoading && <p className="text-xs text-slate-400 text-center py-2">Loading…</p>}
          </div>
        </div>
      )}

      {/* ═══════ RECONCILIATION ═══════ */}
      {tab === 'reconciliation' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <span className="text-xs">
              {mismatches.length > 0
                ? <span className="text-red-600 font-medium">{mismatches.length} mismatch{mismatches.length > 1 ? 'es' : ''} — Sheet1 vs ledger closing balance differs</span>
                : dateInv.length > 0
                  ? <span className="text-green-600 font-medium">✓ All {dateInv.length} records reconciled</span>
                  : <span className="text-slate-400">No data for {fmtDate(selectedDate)}</span>}
            </span>
            <button onClick={exportReconciliation}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg">
              <Download className="w-3.5 h-3.5" />Export Report
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600">
            Reconciliation checks that <strong>Sheet1 closing qty</strong> (agency-provided EOD summary) matches the
            <strong> running ledger closing balance</strong> on each SKU sheet. Mismatches may indicate data entry errors
            in the agency report.
          </div>

          <div className="bg-white rounded-lg border border-slate-200">
            <div className="table-container">
              <table className="table-excel">
                <thead className="sticky top-0 z-10">
                  <tr>{['Vault','Purity','Weight','Product','Total Deposited','Total Delivered','Closing Qty','Closing Grams','995 Equiv','Discrepancy (g)','Status'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[...filteredInv]
                    .sort((a, b) => (a.recon_status === 'mismatch' ? 0 : 1) - (b.recon_status === 'mismatch' ? 0 : 1))
                    .map(r => (
                      <tr key={r.id} className={r.recon_status === 'mismatch' ? 'bg-red-50' : ''}>
                        <td className="text-xs font-medium text-slate-800">{r.vault?.vault_name}</td>
                        <td className="text-xs font-mono">{r.sku?.purity}</td>
                        <td className="text-xs font-mono">{r.sku?.weight_grams}g</td>
                        <td className="text-xs capitalize text-slate-400">{r.sku?.product_type}</td>
                        <td className="text-xs text-right font-mono text-green-600">{formatNumberIndian(r.total_deposited_qty)}</td>
                        <td className="text-xs text-right font-mono text-red-600">{formatNumberIndian(r.total_delivered_qty)}</td>
                        <td className="text-xs text-right font-mono font-semibold">{formatNumberIndian(r.closing_qty)}</td>
                        <td className="text-xs text-right font-mono text-amber-700">{formatNumberIndian(r.closing_grams)}</td>
                        <td className="text-xs text-right font-mono text-slate-500">{formatNumberIndian(r.equiv_995_grams)}</td>
                        <td className={`text-xs text-right font-mono font-semibold ${Math.abs(r.discrepancy_grams) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {r.discrepancy_grams > 0 ? '+' : ''}{formatNumberIndian(r.discrepancy_grams)}
                        </td>
                        <td><ReconBadge status={r.recon_status} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {filteredInv.length === 0 && <p className="text-xs text-slate-400 text-center py-10">No data for {fmtDate(selectedDate)}</p>}
          </div>
        </div>
      )}

      {/* ═══════ UPLOAD ═══════ */}
      {tab === 'upload' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <UploadPanel vaults={vaults} skus={skus} onDone={() => { setTab('dashboard'); refetchInv() }} />
        </div>
      )}

      {/* ═══════ HISTORY ═══════ */}
      {tab === 'history' && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="table-container">
            <table className="table-excel">
              <thead className="sticky top-0 z-10">
                <tr>{['Uploaded At','File','Vault','Report Date','SKUs','Inv Rows','Txn Rows','Status','Errors'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {uploadLogs.map(log => (
                  <tr key={log.id}>
                    <td className="text-xs text-slate-500">{fmtDate(log.uploaded_at)}</td>
                    <td className="text-xs font-mono text-slate-700 max-w-[160px] truncate">{log.file_name}</td>
                    <td className="text-xs text-slate-600">{log.vault_name}</td>
                    <td className="text-xs font-mono text-slate-600">{log.report_date}</td>
                    <td className="text-xs text-right font-mono">{log.skus_parsed}</td>
                    <td className="text-xs text-right font-mono text-green-600">{log.inventory_rows}</td>
                    <td className="text-xs text-right font-mono text-blue-600">{log.transaction_rows}</td>
                    <td><ReconBadge status={log.status} /></td>
                    <td className="text-xs text-red-500 max-w-[200px] truncate">{log.error_detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {uploadLogs.length === 0 && <p className="text-xs text-slate-400 text-center py-10">No upload history yet</p>}
        </div>
      )}

      {/* ═══════ Add Vault Modal ═══════ */}
      {showAddVault && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Add Vault Location</h2>
              <button onClick={() => setShowAddVault(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddVault} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Vault Name * <span className="text-slate-400 font-normal">(must match exactly what appears in agency Excel row 3)</span>
                </label>
                <input type="text" required value={vaultForm.vault_name} placeholder="e.g. Sequel Delhi"
                  onChange={e => setVaultForm({ ...vaultForm, vault_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Agency *</label>
                  <input type="text" required list="agency-list" value={vaultForm.agency} placeholder="e.g. Sequel"
                    onChange={e => setVaultForm({ ...vaultForm, agency: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <datalist id="agency-list">
                    {['Brinks','Sequel','CMS','Safegold'].map(a => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
                  <input type="text" required value={vaultForm.city}
                    onChange={e => setVaultForm({ ...vaultForm, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="v-active" checked={vaultForm.is_active}
                  onChange={e => setVaultForm({ ...vaultForm, is_active: e.target.checked })} className="accent-amber-500" />
                <label htmlFor="v-active" className="text-xs text-slate-600">Active</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddVault(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {saving ? 'Adding…' : 'Add Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ Add SKU Modal ═══════ */}
      {showAddSKU && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Add SKU</h2>
              <button onClick={() => setShowAddSKU(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddSKU} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Purity *</label>
                  <input type="number" required step="0.1" value={skuForm.purity} placeholder="e.g. 999.9"
                    onChange={e => setSkuForm({ ...skuForm, purity: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Weight (g) *</label>
                  <input type="number" required step="0.1" value={skuForm.weight_grams} placeholder="e.g. 10"
                    onChange={e => setSkuForm({ ...skuForm, weight_grams: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Product Type</label>
                <select value={skuForm.product_type} onChange={e => setSkuForm({ ...skuForm, product_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="coin">Coin</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              {skuForm.purity && skuForm.weight_grams && (
                <p className="text-[10px] text-slate-500 bg-slate-50 rounded px-3 py-2">
                  995 equiv per unit: <strong>{equiv995(parseFloat(skuForm.purity), parseFloat(skuForm.weight_grams)).toFixed(4)}g</strong>
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddSKU(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {saving ? 'Adding…' : 'Add SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
