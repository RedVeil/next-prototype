export type OrganisationRecord = {
  id: string
  legal_name: string
  company_id: string
  country: string
  description: string
  risk_score: number
  risk_score_base: number
  industries: string[]
  use_brl: boolean
  use_rlusd: boolean
  payment_method_id: string
  method: string
  identifier: string
  available_rlusd: number
  portfolio_rlusd: number
  invoices_created: InvoiceActivity
  invoices_traded: InvoiceActivity
  invoices_repaid: InvoiceActivity
}

export type InvoiceActivity = {
  count: number
  face_value: number
}

export type UserRecord = {
  id: string
  username: string
  login: string
  role: string
  organisation_id: string
  organisation: string
  created_invoices: string[]
  bought_invoices: string[]
  buckets: string[]
}

export type InvoiceRecord = {
  id: string
  document_id: string
  seller_organisation_id: string
  seller: string
  obligor_organisation_id: string
  obligor: string
  buyer: string
  face_value: number
  currency: string
  risk_score: number
  sold_price: number | null
  repayment_amount: number
  repaid: boolean
  offer: number | null
  offer_rlusd: number | null
  offer_investor: string
  offer_detail: string | null
  origination_date: string
  due_date: string
  product: string
  line_id: string
  line_amount: number
  unit: string
}

export type BucketRecord = {
  id: string
  organisation_id: string
  investor: string
  name: string
  status: string
  risk_low: number
  risk_high: number
  face_min: number
  face_max: number
  tenor_min: number | null
  tenor_max: number | null
  industries: string[]
  countries: string[]
  currencies: string[]
  apr: number
  exposure_kind: string
  exposure_limit_usd: number | null
  exposure_limit_percent: number | null
  feature_ids: string[]
}

export type NamedOrganisation = {
  id: string
  legal_name: string
}

export type ScoringParameter = {
  key: string
  label: string
  weight: number
}

export type DemoData = {
  organisations: OrganisationRecord[]
  industryNames: string[]
  users: UserRecord[]
  investors: NamedOrganisation[]
  invoices: InvoiceRecord[]
  buckets: BucketRecord[]
  features: { id: string; name: string }[]
  parameters: ScoringParameter[]
}
