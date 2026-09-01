export type Confidence = "Low" | "Medium" | "High"

export type SessionRole = "seller" | "investor"

export type Seller = {
  name: string
  cnpj: string
  initials: string
}

export type SellerProfileId = "existing" | "fresh"

export type InvestorStatus = "verified" | "pending"

export type Investor = {
  id: string
  name: string
  cnpj: string
  initials: string
  committedCapital: number
  deployedCapital: number
  status: InvestorStatus
  classification: string
}

export type InvestorProfileId = "existing" | "fresh"

export type KybStatus = "pending" | "approved"

export type Wallet = {
  connected: boolean
  address: string
  network: string
  balance: number
}

export type InvestorPositionStatus = "active" | "settling" | "settled"

export type InvestorPosition = {
  id: string
  sellerName: string
  buyerName: string
  faceValue: number
  fundedAmount: number
  expectedReturn: number
  daysToMaturity: number
  status: InvestorPositionStatus
}

export type ConnectionStats = {
  lastSynced: string
  invoicesDetected: number
  banks: string[]
  bankVisibility: number
}

export type InvoiceStatus =
  | "eligible"
  | "waiting_acceptance"
  | "offer_available"
  | "sold"
  | "repaid"

export type Invoice = {
  id: string
  nfeKey: string
  buyerName: string
  buyerCnpj: string
  sellerName: string
  sellerCnpj: string
  faceValue: number
  daysToMaturity: number
  nfeVerified: boolean
  duplicataRegistered: boolean
  buyerAccepted: boolean
  ownershipClean: boolean
  noPriorAssignment: boolean
  noLien: boolean
  knownBuyer: boolean
  historicalInvoices: number
  matchedPayments: number
  historicValue?: number
  latePayments?: number
  latePaymentNote?: string
  score?: number
  confidence?: Confidence
  finalOffer?: number
  status: InvoiceStatus
}

export type RiskScore = {
  overall: number
  confidence: Confidence
  invoiceIntegrity: number
  buyerExternal: number
  sellerBuyerHistory: number
  openFinanceEvidence: number
  platformHistory: number
}

export type OfferStatus = "available" | "accepted" | "declined" | "expired"

export type Offer = {
  invoiceId: string
  faceValue: number
  finalPrice: number
  discountAmount: number
  discountPercentage: number
  status: OfferStatus
}

export type BuyerPaymentStatus = "waiting" | "received"
export type InvestorSettlementStatus = "waiting" | "processing" | "settled"

export type Settlement = {
  invoiceId: string
  sellerReceived: number
  buyerPayment: BuyerPaymentStatus
  investorSettlement: InvestorSettlementStatus
}

export type PlatformBuyerHistory = {
  observed: number
  onTime: number
  lateWithin5: number
  defaults: number
}

export const INDUSTRIES = [
  "Any",
  "Agriculture",
  "Food",
  "Manufacturing",
  "Logistics",
  "Retail",
  "Automotive",
  "Chemicals",
  "Construction",
  "Healthcare",
  "Other",
] as const

export type Industry = (typeof INDUSTRIES)[number]

export type BucketStatus = "active" | "paused"

export type InvestmentBucket = {
  id: string
  name: string
  investorId: string
  capitalCap: number
  requiredApr: number
  scoreMin: number
  scoreMax: number
  industries: string[]
  tenorMin?: number
  tenorMax?: number
  invoiceMin?: number
  invoiceMax?: number
  minimumConfidence?: Confidence
  minHistoricalInvoices?: number
  minPlatformRepayments?: number
  maxLatePaymentRate?: number
  maxBuyerExposure?: number
  maxSellerExposure?: number
  maxBuyerPortfolioPercent?: number
  currentExposure: number
  status: BucketStatus
}

export type BucketMatchStats = {
  currentInvoiceCount: number
  currentFaceValue: number
  historicalInvoiceCount: number
  historicalFaceValue: number
  averageScore: number
  averageTenor: number
  averageApr: number
  historicalAverageInvoice: number
  historicalAverageTenor: number
  averageMonthlyVolume: number
  historicalRepaymentRate: number
}

export type MarketInvoice = {
  id: string
  buyerName: string
  sellerName: string
  faceValue: number
  score: number
  confidence: Confidence
  industry: string
  tenorDays: number
  availableApr: number
  historical: boolean
  repaid?: boolean
  daysLate?: number
  buyerHistoricalInvoices: number
  buyerPlatformRepayments: number
  buyerLatePaymentRate: number
}

export type PortfolioHoldingStatus = "Current" | "Settling" | "Settled"

export type PortfolioHolding = {
  id: string
  buyerName: string
  sellerName: string
  amountInvested: number
  faceValue: number
  apr: number
  score: number
  daysToMaturity: number
  bucketId: string
  bucketName: string
  status: PortfolioHoldingStatus
}

export type InvestorTransactionKind =
  | "capital_deposited"
  | "capital_withdrawn"
  | "invoice_purchased"
  | "invoice_repaid"
  | "investor_repayment"
  | "bucket_changed"

export type InvestorTransaction = {
  id: string
  at: string
  kind: InvestorTransactionKind
  amount: number
  counterparty?: string
  note?: string
}

export type BucketDraft = {
  name: string
  capitalCap: number
  requiredApr: number
  scoreMin: number
  scoreMax: number
  industries: string[]
  tenorMin: number
  tenorMax: number
  invoiceMin?: number
  invoiceMax?: number
  minimumConfidence?: Confidence
  minHistoricalInvoices?: number
  minPlatformRepayments?: number
  maxLatePaymentRate?: number
  maxBuyerExposure?: number
  maxSellerExposure?: number
  maxBuyerPortfolioPercent?: number
}
