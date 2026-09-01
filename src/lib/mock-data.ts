import {
  ATLAS_BUCKETS,
  ATLAS_HOLDINGS,
  ATLAS_INVESTOR_ID,
  ATLAS_TRANSACTIONS,
  FRESH_INVESTOR_ID,
} from "./investor-seed"
import type {
  Confidence,
  ConnectionStats,
  InvestmentBucket,
  Investor,
  InvestorPosition,
  InvestorProfileId,
  InvestorTransaction,
  Invoice,
  KybStatus,
  PortfolioHolding,
  RiskScore,
  Seller,
  SellerProfileId,
  Wallet,
} from "./types"

export const SELLER = {
  name: "ABC Industrial Ltda.",
  cnpj: "12.345.678/0001-90",
  initials: "AB",
} as const satisfies Seller

export const FRESH_SELLER = {
  name: "Nova Comércio Ltda.",
  cnpj: "98.765.432/0001-10",
  initials: "NC",
} as const satisfies Seller

export const EXISTING_INVESTOR = {
  id: ATLAS_INVESTOR_ID,
  name: "Atlas Credit Fund",
  cnpj: "11.222.333/0001-44",
  initials: "AC",
  committedCapital: 5_000_000,
  deployedCapital: 2_650_000,
  status: "verified",
  classification: "Institutional / Professional",
} as const satisfies Investor

export const FRESH_INVESTOR = {
  id: FRESH_INVESTOR_ID,
  name: "Nova Investimentos Ltda.",
  cnpj: "55.666.777/0001-88",
  initials: "NI",
  committedCapital: 0,
  deployedCapital: 0,
  status: "pending",
  classification: "Institutional / Professional",
} as const satisfies Investor

export const EMPTY_WALLET: Wallet = {
  connected: false,
  address: "",
  network: "",
  balance: 0,
}

export const EXISTING_WALLET: Wallet = {
  connected: true,
  address: "rH7KF...91A",
  network: "XRPL",
  balance: 1_500_000,
}

export const FRESH_CONNECTED_WALLET: Wallet = {
  connected: true,
  address: "rN7KF...04E",
  network: "XRPL",
  balance: 500_000,
}

export const PLATFORM_NAME = "Antecipa"

export const SOLD_THIS_MONTH_BASE = 1_420_000
export const AVERAGE_FINANCING_COST = 1.9

export const SCORE_WEIGHTS = {
  invoiceIntegrity: 0.25,
  buyerExternal: 0.2,
  sellerBuyerHistory: 0.25,
  openFinanceEvidence: 0.15,
  platformHistory: 0.15,
} as const

const BUYERS = {
  rede: { name: "Rede Brasil Foods", cnpj: "45.678.901/0001-23" },
  mercado: { name: "Mercado Sul", cnpj: "78.901.234/0001-56" },
  norte: { name: "Grupo Norte", cnpj: "23.456.789/0001-01" },
  atlas: { name: "Atlas Atacado", cnpj: "31.111.222/0001-33" },
  litoral: { name: "Litoral Pack", cnpj: "22.333.444/0001-55" },
  costa: { name: "Costa Imports", cnpj: "33.444.555/0001-66" },
} as const

const DAYS = {
  short: 7,
  medium: 34,
  long: 120,
} as const

const EMPTY_CONNECTIONS: ConnectionStats = {
  lastSynced: "Never",
  invoicesDetected: 0,
  banks: [],
  bankVisibility: 0,
}

const EXISTING_CONNECTIONS: ConnectionStats = {
  lastSynced: "Today, 14:32",
  invoicesDetected: 53,
  banks: ["Itaú", "Santander", "Banco do Brasil"],
  bankVisibility: 92,
}

function roundMoney(value: number): number {
  return Math.round(value / 50) * 50
}

function applyDiscount(faceValue: number, percent: number): number {
  return roundMoney(faceValue * (1 - percent / 100))
}

function priced(faceValue: number, discountLow: number, discountHigh: number) {
  const mid = (discountLow + discountHigh) / 2
  return {
    finalOffer: applyDiscount(faceValue, mid),
  }
}

const hardChecks = {
  nfeVerified: true,
  duplicataRegistered: true,
  ownershipClean: true,
  noPriorAssignment: true,
  noLien: true,
} as const

type Buyer = { name: string; cnpj: string }

type InvoiceSpec = {
  suffix: string
  nfeKey: string
  buyer: Buyer
  faceValue: number
  daysToMaturity: number
  knownBuyer: boolean
  buyerAccepted: boolean
  historicalInvoices: number
  matchedPayments: number
  historicValue?: number
  latePayments?: number
  latePaymentNote?: string
  score?: number
  confidence?: Confidence
  discountLow?: number
  discountHigh?: number
  risk?: Omit<RiskScore, "overall" | "confidence">
}

function buildInvoice(
  prefix: string,
  seller: Seller,
  spec: InvoiceSpec,
): { invoice: Invoice; riskScore?: RiskScore } {
  const id = `${prefix}-${spec.suffix}`
  const invoice: Invoice = {
    id,
    nfeKey: spec.nfeKey,
    buyerName: spec.buyer.name,
    buyerCnpj: spec.buyer.cnpj,
    sellerName: seller.name,
    sellerCnpj: seller.cnpj,
    faceValue: spec.faceValue,
    daysToMaturity: spec.daysToMaturity,
    ...hardChecks,
    buyerAccepted: spec.buyerAccepted,
    knownBuyer: spec.knownBuyer,
    historicalInvoices: spec.historicalInvoices,
    matchedPayments: spec.matchedPayments,
    historicValue: spec.historicValue,
    latePayments: spec.latePayments,
    latePaymentNote: spec.latePaymentNote,
    status: spec.buyerAccepted ? "eligible" : "waiting_acceptance",
  }

  if (
    spec.buyerAccepted &&
    spec.score != null &&
    spec.confidence &&
    spec.discountLow != null &&
    spec.discountHigh != null &&
    spec.risk
  ) {
    return {
      invoice: {
        ...invoice,
        score: spec.score,
        confidence: spec.confidence,
        ...priced(spec.faceValue, spec.discountLow, spec.discountHigh),
      },
      riskScore: {
        overall: spec.score,
        confidence: spec.confidence,
        ...spec.risk,
      },
    }
  }

  return { invoice }
}

function buildCatalog(
  prefix: string,
  seller: Seller,
  specs: InvoiceSpec[],
): { invoices: Invoice[]; riskScores: Record<string, RiskScore> } {
  const invoices: Invoice[] = []
  const riskScores: Record<string, RiskScore> = {}
  for (const spec of specs) {
    const built = buildInvoice(prefix, seller, spec)
    invoices.push(built.invoice)
    if (built.riskScore) {
      riskScores[built.invoice.id] = built.riskScore
    }
  }
  return { invoices, riskScores }
}

const existingSpecs: InvoiceSpec[] = [
  {
    suffix: "short-rede",
    nfeKey: "3526...1849",
    buyer: BUYERS.rede,
    faceValue: 480_000,
    daysToMaturity: DAYS.short,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 38,
    matchedPayments: 37,
    historicValue: 6_800_000,
    latePayments: 1,
    latePaymentNote: "1 paid 2 days late",
    score: 94,
    confidence: "High",
    discountLow: 1.5,
    discountHigh: 2.5,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 88,
      sellerBuyerHistory: 96,
      openFinanceEvidence: 92,
      platformHistory: 90,
    },
  },
  {
    suffix: "short-rede-wait",
    nfeKey: "3526...1850",
    buyer: BUYERS.rede,
    faceValue: 195_000,
    daysToMaturity: DAYS.short,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 38,
    matchedPayments: 37,
    historicValue: 6_800_000,
    latePayments: 1,
    latePaymentNote: "1 paid 2 days late",
  },
  {
    suffix: "short-atlas",
    nfeKey: "3526...2104",
    buyer: BUYERS.atlas,
    faceValue: 142_000,
    daysToMaturity: DAYS.short,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 86,
    confidence: "High",
    discountLow: 2,
    discountHigh: 3,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 78,
      sellerBuyerHistory: 72,
      openFinanceEvidence: 88,
      platformHistory: 86,
    },
  },
  {
    suffix: "medium-mercado",
    nfeKey: "3526...5521",
    buyer: BUYERS.mercado,
    faceValue: 310_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 7,
    matchedPayments: 5,
    historicValue: 890_000,
    latePayments: 0,
    latePaymentNote: "2 historical invoices could not be matched to bank receipts",
    score: 91,
    confidence: "High",
    discountLow: 1.5,
    discountHigh: 2.5,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 82,
      sellerBuyerHistory: 94,
      openFinanceEvidence: 90,
      platformHistory: 85,
    },
  },
  {
    suffix: "medium-mercado-wait",
    nfeKey: "3526...5522",
    buyer: BUYERS.mercado,
    faceValue: 275_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 7,
    matchedPayments: 5,
    historicValue: 890_000,
    latePayments: 0,
    latePaymentNote: "2 historical invoices could not be matched to bank receipts",
  },
  {
    suffix: "medium-litoral",
    nfeKey: "3526...6610",
    buyer: BUYERS.litoral,
    faceValue: 220_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 84,
    confidence: "High",
    discountLow: 2,
    discountHigh: 3,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 76,
      sellerBuyerHistory: 70,
      openFinanceEvidence: 86,
      platformHistory: 84,
    },
  },
  {
    suffix: "long-norte",
    nfeKey: "3526...9910",
    buyer: BUYERS.norte,
    faceValue: 630_000,
    daysToMaturity: DAYS.long,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 12,
    matchedPayments: 11,
    historicValue: 2_100_000,
    latePayments: 0,
    score: 88,
    confidence: "High",
    discountLow: 1.8,
    discountHigh: 2.8,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 80,
      sellerBuyerHistory: 90,
      openFinanceEvidence: 86,
      platformHistory: 82,
    },
  },
  {
    suffix: "long-norte-wait",
    nfeKey: "3526...9911",
    buyer: BUYERS.norte,
    faceValue: 410_000,
    daysToMaturity: DAYS.long,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 12,
    matchedPayments: 11,
    historicValue: 2_100_000,
    latePayments: 0,
  },
  {
    suffix: "long-costa",
    nfeKey: "3526...7740",
    buyer: BUYERS.costa,
    faceValue: 355_000,
    daysToMaturity: DAYS.long,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 82,
    confidence: "High",
    discountLow: 2.2,
    discountHigh: 3.2,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 74,
      sellerBuyerHistory: 68,
      openFinanceEvidence: 84,
      platformHistory: 80,
    },
  },
]

const freshSpecs: InvoiceSpec[] = [
  {
    suffix: "short-rede",
    nfeKey: "3526...3011",
    buyer: BUYERS.rede,
    faceValue: 480_000,
    daysToMaturity: DAYS.short,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 5,
    matchedPayments: 4,
    historicValue: 620_000,
    latePayments: 0,
    score: 74,
    confidence: "Medium",
    discountLow: 2.5,
    discountHigh: 3.5,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 76,
      sellerBuyerHistory: 72,
      openFinanceEvidence: 48,
      platformHistory: 36,
    },
  },
  {
    suffix: "short-rede-wait",
    nfeKey: "3526...3012",
    buyer: BUYERS.rede,
    faceValue: 195_000,
    daysToMaturity: DAYS.short,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 5,
    matchedPayments: 4,
    historicValue: 620_000,
    latePayments: 0,
  },
  {
    suffix: "short-atlas",
    nfeKey: "3526...3188",
    buyer: BUYERS.atlas,
    faceValue: 142_000,
    daysToMaturity: DAYS.short,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 64,
    confidence: "Low",
    discountLow: 3.5,
    discountHigh: 4.5,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 66,
      sellerBuyerHistory: 42,
      openFinanceEvidence: 40,
      platformHistory: 26,
    },
  },
  {
    suffix: "medium-mercado",
    nfeKey: "3526...4020",
    buyer: BUYERS.mercado,
    faceValue: 310_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 4,
    matchedPayments: 3,
    historicValue: 410_000,
    latePayments: 0,
    latePaymentNote: "1 historical invoice could not be matched to bank receipts",
    score: 72,
    confidence: "Medium",
    discountLow: 2.6,
    discountHigh: 3.6,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 74,
      sellerBuyerHistory: 70,
      openFinanceEvidence: 46,
      platformHistory: 34,
    },
  },
  {
    suffix: "medium-mercado-wait",
    nfeKey: "3526...4021",
    buyer: BUYERS.mercado,
    faceValue: 275_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 4,
    matchedPayments: 3,
    historicValue: 410_000,
    latePayments: 0,
    latePaymentNote: "1 historical invoice could not be matched to bank receipts",
  },
  {
    suffix: "medium-litoral",
    nfeKey: "3526...4180",
    buyer: BUYERS.litoral,
    faceValue: 220_000,
    daysToMaturity: DAYS.medium,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 62,
    confidence: "Low",
    discountLow: 3.6,
    discountHigh: 4.6,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 64,
      sellerBuyerHistory: 40,
      openFinanceEvidence: 38,
      platformHistory: 24,
    },
  },
  {
    suffix: "long-norte",
    nfeKey: "3526...5090",
    buyer: BUYERS.norte,
    faceValue: 630_000,
    daysToMaturity: DAYS.long,
    knownBuyer: true,
    buyerAccepted: true,
    historicalInvoices: 6,
    matchedPayments: 5,
    historicValue: 780_000,
    latePayments: 0,
    score: 70,
    confidence: "Medium",
    discountLow: 2.8,
    discountHigh: 3.8,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 72,
      sellerBuyerHistory: 68,
      openFinanceEvidence: 44,
      platformHistory: 32,
    },
  },
  {
    suffix: "long-norte-wait",
    nfeKey: "3526...5091",
    buyer: BUYERS.norte,
    faceValue: 410_000,
    daysToMaturity: DAYS.long,
    knownBuyer: true,
    buyerAccepted: false,
    historicalInvoices: 6,
    matchedPayments: 5,
    historicValue: 780_000,
    latePayments: 0,
  },
  {
    suffix: "long-costa",
    nfeKey: "3526...5277",
    buyer: BUYERS.costa,
    faceValue: 355_000,
    daysToMaturity: DAYS.long,
    knownBuyer: false,
    buyerAccepted: true,
    historicalInvoices: 0,
    matchedPayments: 0,
    score: 60,
    confidence: "Low",
    discountLow: 3.8,
    discountHigh: 4.8,
    risk: {
      invoiceIntegrity: 100,
      buyerExternal: 62,
      sellerBuyerHistory: 38,
      openFinanceEvidence: 36,
      platformHistory: 22,
    },
  },
]

const existingSeed = buildCatalog("ex", SELLER, existingSpecs)
const freshSeed = buildCatalog("fr", FRESH_SELLER, freshSpecs)

export type SellerProfileCatalog = {
  id: SellerProfileId
  seller: Seller
  invoices: Invoice[]
  riskScores: Record<string, RiskScore>
  soldThisMonthBase: number
  averageFinancingCost: number
  connections: ConnectionStats
}

export const PROFILES: Record<SellerProfileId, SellerProfileCatalog> = {
  existing: {
    id: "existing",
    seller: SELLER,
    invoices: existingSeed.invoices,
    riskScores: existingSeed.riskScores,
    soldThisMonthBase: SOLD_THIS_MONTH_BASE,
    averageFinancingCost: AVERAGE_FINANCING_COST,
    connections: EXISTING_CONNECTIONS,
  },
  fresh: {
    id: "fresh",
    seller: FRESH_SELLER,
    invoices: freshSeed.invoices,
    riskScores: freshSeed.riskScores,
    soldThisMonthBase: 0,
    averageFinancingCost: 0,
    connections: EMPTY_CONNECTIONS,
  },
}

export function cloneProfile(id: SellerProfileId): SellerProfileCatalog {
  const catalog = PROFILES[id]
  return {
    id: catalog.id,
    seller: { ...catalog.seller },
    invoices: catalog.invoices.map((invoice) => ({ ...invoice })),
    riskScores: Object.fromEntries(
      Object.entries(catalog.riskScores).map(([key, score]) => [key, { ...score }]),
    ),
    soldThisMonthBase: catalog.soldThisMonthBase,
    averageFinancingCost: catalog.averageFinancingCost,
    connections: {
      ...catalog.connections,
      banks: [...catalog.connections.banks],
    },
  }
}

export type InvestorProfileCatalog = {
  id: InvestorProfileId
  investor: Investor
  kybStatus: KybStatus
  wallet: Wallet
  positions: InvestorPosition[]
  buckets: InvestmentBucket[]
  holdings: PortfolioHolding[]
  transactions: InvestorTransaction[]
}

export const INVESTOR_PROFILES: Record<InvestorProfileId, InvestorProfileCatalog> = {
  existing: {
    id: "existing",
    investor: EXISTING_INVESTOR,
    kybStatus: "approved",
    wallet: EXISTING_WALLET,
    positions: [],
    buckets: ATLAS_BUCKETS,
    holdings: ATLAS_HOLDINGS,
    transactions: ATLAS_TRANSACTIONS,
  },
  fresh: {
    id: "fresh",
    investor: FRESH_INVESTOR,
    kybStatus: "pending",
    wallet: EMPTY_WALLET,
    positions: [],
    buckets: [],
    holdings: [],
    transactions: [],
  },
}

export function cloneInvestorProfile(id: InvestorProfileId): InvestorProfileCatalog {
  const catalog = INVESTOR_PROFILES[id]
  return {
    id: catalog.id,
    investor: { ...catalog.investor },
    kybStatus: catalog.kybStatus,
    wallet: { ...catalog.wallet },
    positions: catalog.positions.map((position) => ({ ...position })),
    buckets: catalog.buckets.map((bucket) => ({
      ...bucket,
      industries: [...bucket.industries],
    })),
    holdings: catalog.holdings.map((holding) => ({ ...holding })),
    transactions: catalog.transactions.map((transaction) => ({ ...transaction })),
  }
}

export const invoices = PROFILES.existing.invoices
export const riskScores = PROFILES.existing.riskScores

export const UNDERWRITING_STEPS = [
  "Re-check NF-e",
  "Confirm buyer acceptance",
  "Confirm seller ownership",
  "Check for liens or prior assignments",
  "Refresh buyer risk signals",
  "Refresh repayment history",
  "Calculate final pricing",
  "Confirm funding availability",
] as const

export const ACCEPT_STEPS = [
  "Final invoice validation",
  "Confirm buyer acceptance",
  "Confirm seller still owns receivable",
  "Confirm no new lien or assignment",
  "Register receivable transfer",
  "Update registered payment instructions",
  "Release seller funds",
] as const

export const OFFER_VALIDITY_MS = 15 * 60 * 1000

export const NEW_INVOICE_STEPS = [
  "Validate NF-e",
  "Check registered duplicata",
  "Confirm buyer acceptance",
  "Confirm seller ownership / no lien",
  "Score invoice",
  "Calculate offer",
] as const

export function sellerInitials(name: string): string {
  const cleaned = name.replace(/\b(ltda\.?|s\.?a\.?|eireli|me)\b/gi, " ")
  const parts = cleaned
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^(da|de|do|dos|das|e)$/i.test(part))
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "AB"
}

export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "")
}

export function isHardEligible(invoice: Invoice): boolean {
  return (
    invoice.nfeVerified &&
    invoice.buyerAccepted &&
    invoice.duplicataRegistered &&
    invoice.ownershipClean &&
    invoice.noPriorAssignment &&
    invoice.noLien
  )
}
