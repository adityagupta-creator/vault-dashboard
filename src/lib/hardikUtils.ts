export const PURCHASE_GST_RATE = 0.03

const CITY_CODE_TO_NAME: Record<string, string> = {
  PJB: 'Mohali',
  KOL: 'Kolkata',
  BHB: 'Bhubaneswar',
  DEL: 'Delhi',
  AGRA: 'Agra',
  LKO: 'Lucknow',
  MUM: 'Mumbai',
  AMR: 'Amritsar',
  LDH: 'Ludhiana',
}

const CITY_NAME_TO_SALESPERSON: Record<string, string> = {
  Delhi: 'Narendra',
  Agra: 'Narendra',
  Lucknow: 'Narendra',
  Kolkata: 'Sanjib',
  Bhubaneswar: 'Sanjib',
  Mohali: 'Amritanshu',
  Amritsar: 'Amritanshu',
  Ludhiana: 'Amritanshu',
  Mumbai: '',
}

const KNOWN_CITY_NAMES = Object.values(CITY_CODE_TO_NAME).filter(Boolean)

export function extractCityCode(symbol: string | null | undefined): string {
  const s = (symbol ?? '').toString().trim()
  if (!s) return ''
  return s.split(/\s+/)[0]?.toUpperCase() ?? ''
}

export function extractCity(symbol: string | null | undefined): string {
  const s = (symbol ?? '').toString().trim()
  if (!s) return ''
  const code = s.split(/\s+/)[0]?.toUpperCase() ?? ''
  if (CITY_CODE_TO_NAME[code]) return CITY_CODE_TO_NAME[code]
  const lower = s.toLowerCase()
  for (const city of KNOWN_CITY_NAMES) {
    if (lower.includes(city.toLowerCase())) return city
  }
  return ''
}

export function salesPersonFor(symbolOrCity: string | null | undefined): string {
  const city = CITY_CODE_TO_NAME[extractCityCode(symbolOrCity)]
    ? extractCity(symbolOrCity)
    : (symbolOrCity ?? '').toString().trim()
  const resolved = KNOWN_CITY_NAMES.find((c) => c.toLowerCase() === city.toLowerCase()) ?? extractCity(symbolOrCity)
  return CITY_NAME_TO_SALESPERSON[resolved] ?? ''
}

/** Format date as dd.mm.yyyy for Hardik sheet */
export function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

const INDIAN_LOCALE = 'en-IN'

/**
 * Format number in Indian style (e.g. 12,00,200) for display.
 * Use for non-currency numbers (grams, quantity, etc.).
 */
export function formatNumberIndian(
  n: number | null | undefined,
  decimals?: number
): string {
  if (n == null || Number.isNaN(n)) return ''
  const opts =
    decimals != null
      ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : {}
  return n.toLocaleString(INDIAN_LOCALE, opts)
}

/**
 * Format currency in Indian style with 2 decimal places (e.g. 80,55,300.00).
 * Handles null/empty and negative values (e.g. ₹-1,20,000.00).
 * Use for display only; does not change stored values.
 */
export function formatRupee(
  n: number | null | undefined,
  decimals: number = 2
): string {
  if (n == null || Number.isNaN(n)) return ''
  return n.toLocaleString(INDIAN_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format currency for display with ₹ symbol (e.g. ₹80,55,300.00).
 * Returns empty string for null/empty; use with fallback like formatRupeeWithSymbol(x) || '-'
 */
export function formatRupeeWithSymbol(
  n: number | null | undefined,
  decimals: number = 2
): string {
  const s = formatRupee(n, decimals)
  return s === '' ? '' : `₹${s}`
}
