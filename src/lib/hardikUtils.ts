/**
 * Utils for Hardik Coin workflow – mirrors Python script logic.
 * City & salesperson derived from Symbol (product_symbol) first token.
 */

const CITY_CODE_TO_NAME: Record<string, string> = {
  PJB: 'Mohali',
  KOL: 'Kolkata',
  BHB: 'Bhubaneswar',
  DEL: 'Delhi',
  AGRA: 'Agra',
  LKO: 'Lucknow',
  MUM: 'Mumbai',
}

const CITY_CODE_TO_SALESPERSON: Record<string, string> = {
  PJB: 'Amritanshu',
  KOL: 'Sanjib',
  BHB: 'Sanjib',
  DEL: 'Narendra',
  AGRA: 'Narendra',
  LKO: 'Narendra',
  MUM: '',
}

export function extractCityCode(symbol: string | null | undefined): string {
  const s = (symbol ?? '').toString().trim()
  if (!s) return ''
  return s.split(/\s+/)[0]?.toUpperCase() ?? ''
}

export function extractCity(symbol: string | null | undefined): string {
  const code = extractCityCode(symbol)
  return CITY_CODE_TO_NAME[code] ?? ''
}

export function salesPersonFor(symbol: string | null | undefined): string {
  const code = extractCityCode(symbol)
  return CITY_CODE_TO_SALESPERSON[code] ?? ''
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
