import type { InvoiceLifecycleStatus } from "./lifecycle"
import type { RiskRange } from "./risk"

export type Installment = {
  sequence: number
  amount: number
  dueDate: string
}

export type InvoiceNft = {
  tokenId: string
  issuer: string
  holder: string
  mintTx: string | null
  burnTx: string | null
}

/**
 * Invoice record shared by matching and storage.
 * Installments may be present. A missing due date means the matcher does not price the invoice.
 */
export type DomainInvoice = {
  id: string
  companyId: string
  documentId: string
  buyerName: string
  buyerTaxId: string
  amount: number
  currency: string
  originCountry: string
  product: string
  dueDate: string | null
  installments: Installment[] | null
  issuerIndustries: string[]
  issuerBusinessDescription: string
  eligibleForMatching: boolean
  saleStatus: "unsold" | "sold"
  soldAt: string | null
  status: InvoiceLifecycleStatus
  /** Current assessment. When null, callers use the issuing company's range. */
  riskAssessment: RiskRange | null
  nft: InvoiceNft | null
}

export type CompanyInvoiceFilter = {
  customerTaxIds: string[]
  products: string[]
  riskLow: number | null
  riskHigh: number | null
}

export function currentRisk(
  companyRange: RiskRange,
  assessment: RiskRange | null,
): RiskRange {
  return assessment ?? companyRange
}
