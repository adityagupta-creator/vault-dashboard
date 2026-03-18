export type UserRole = 'trading_agent' | 'finance' | 'reconciliation' | 'vault' | 'management'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ClientOrder {
  id: string
  order_number: string | null
  order_source: 'online' | 'offline'
  client_name: string
  company_name: string | null
  order_date: string
  order_time: string | null
  delivery_date: string | null
  product_symbol: string | null
  purity: string | null
  quantity: number | null
  grams: number
  quoted_rate: number | null
  making_charges: number
  net_revenue: number | null
  gst_amount: number
  tcs_amount: number | null
  gross_revenue: number | null
  city: string | null
  trade_status: string
  remarks: string | null
  assigned_agent_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  import_hash?: string
  raw_data?: any
}


export interface SupplierPurchase {
  id: string
  client_order_id: string
  supplier_name: string
  supplier_quantity_bought: number | null
  supplier_grams: number
  supplier_rate: number | null
  supplier_making_charges: number
  net_purchase: number | null
  gst_2: number
  gross_purchase: number | null
  booked_by_agent_id: string | null
  booked_at: string
  supplier_status: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface Hedge {
  id: string
  supplier_purchase_id: string
  hedge_date: string
  hedge_time: string | null
  hedge_quantity: number | null
  hedge_grams: number
  hedge_price: number | null
  mcx_petal_short_price: number | null
  mcx_ten_short_price: number | null
  frozen_premium: number | null
  contract_expiry: string | null
  hedge_platform: string
  hedge_status: string
  entered_by: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  client_order_id: string
  client_name: string | null
  payment_status: string
  expected_amount: number
  amount_received: number
  payment_date: string | null
  payment_reference: string | null
  payment_proof_file_url: string | null
  verified_by: string | null
  verification_notes: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryOrder {
  id: string
  client_order_id: string
  sku: string | null
  vault: string | null
  delivery_type: string | null
  logistics_partner: string | null
  invoice_number: string | null
  delivery_challan_number: string | null
  debit_note_number: string | null
  e_invoice_number: string | null
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Reconciliation {
  id: string
  client_order_id: string
  supplier_purchase_id: string | null
  hedge_id: string | null
  agent_trade_sheet_match: boolean
  issued_invoice_match: boolean
  delivery_order_match: boolean
  reconciliation_status: string
  reconciled_by: string | null
  reconciliation_notes: string | null
  created_at: string
  updated_at: string
}

export interface VaultLogistics {
  id: string
  vault_name: string
  available_gold: number
  reserved_gold: number
  delivered_gold: number
  updated_by: string | null
  created_at: string
  updated_at: string
}
