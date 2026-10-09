export type PartyStatus = "pending" | "accepted"
export type AccessStatus = "allowed" | "stopped"

export type CompanyRow = {
  id: string
  profile_id: string | null
  legal_name: string
  tax_id: string
  country: string
  industries: string[]
  business_description: string
  goods_and_services: string[]
  application_status: PartyStatus
  access_status: AccessStatus
  source: "application" | "admin"
  risk_low: number
  risk_high: number
}

export type InvestorRow = {
  id: string
  profile_id: string | null
  legal_name: string
  own_xrpl_address: string | null
  application_status: PartyStatus
  access_status: AccessStatus
  bot_paused: boolean
  source: "application" | "admin"
}

export type BucketRow = {
  id: string
  investor_id: string
  name: string
  status: "active" | "paused"
  risk_low: number
  risk_high: number
  industries: string[]
  products: string[]
  countries: string[]
  currencies: string[]
  criteria_mode: "and" | "or"
  apr: number
  exposure_kind: "flat_usd" | "portfolio_percent"
  exposure_limit_usd: number | null
  exposure_limit_percent: number | null
  exposure_used_usd: number
  tenor_min: number | null
  tenor_max: number | null
  invoice_min: number | null
  invoice_max: number | null
}

export type SessionSnapshot = {
  email: string | null
  userId: string | null
  role: "company" | "investor" | "admin" | null
  company: CompanyRow | null
  investor: InvestorRow | null
  settings: {
    companyApplicationsAllowed: boolean
    investorApplicationsAllowed: boolean
  }
}

export type CompanyInput = {
  legalName: string
  taxId: string
  industries: string[]
  businessDescription: string
  goodsAndServices: string[]
}

export type InvoiceInput = {
  documentId: string
  originCountry: string
  currency: string
  amount: number
  product: string
  dueDate: string | null
  buyerId: string | null
  buyerName: string
  buyerTaxId: string
  issuerIndustries: string[]
}

export type BucketInput = {
  name: string
  riskLow: number
  riskHigh: number
  industries: string[]
  products: string[]
  countries: string[]
  currencies: string[]
  criteriaMode: "and" | "or"
  apr: number
  exposureKind: "flat_usd" | "portfolio_percent"
  exposureLimitUsd: number | null
  exposureLimitPercent: number | null
  tenorMin: number | null
  tenorMax: number | null
  invoiceMin: number | null
  invoiceMax: number | null
}
