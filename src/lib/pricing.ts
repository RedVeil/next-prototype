import { normalizeCnpj } from "./mock-data"
import type { Invoice, PlatformBuyerHistory, RiskScore, Seller } from "./types"

export type InvoiceDraft = {
  buyerName: string
  buyerCnpj: string
  nfeKey: string
  faceValue: number
  daysToMaturity: number
  buyerAccepted: boolean
}

function roundMoney(value: number): number {
  return Math.round(value / 50) * 50
}

function applyDiscount(faceValue: number, percent: number): number {
  return roundMoney(faceValue * (1 - percent / 100))
}

const unknownRisk: RiskScore = {
  overall: 76,
  confidence: "Medium",
  invoiceIntegrity: 100,
  buyerExternal: 72,
  sellerBuyerHistory: 68,
  openFinanceEvidence: 70,
  platformHistory: 70,
}

const unknownHistory: PlatformBuyerHistory = {
  observed: 9,
  onTime: 8,
  lateWithin5: 1,
  defaults: 0,
}

export const platformHistoryByCnpj: Record<string, PlatformBuyerHistory> = {
  [normalizeCnpj("45.678.901/0001-23")]: {
    observed: 84,
    onTime: 82,
    lateWithin5: 2,
    defaults: 0,
  },
  [normalizeCnpj("78.901.234/0001-56")]: {
    observed: 12,
    onTime: 10,
    lateWithin5: 2,
    defaults: 0,
  },
  [normalizeCnpj("23.456.789/0001-01")]: {
    observed: 28,
    onTime: 26,
    lateWithin5: 2,
    defaults: 0,
  },
}

function findKnownInvoice(buyerCnpj: string, catalog: Invoice[]): Invoice | undefined {
  const normalized = normalizeCnpj(buyerCnpj)
  return catalog.find(
    (invoice) => invoice.knownBuyer && normalizeCnpj(invoice.buyerCnpj) === normalized,
  )
}

export function getPlatformHistory(invoice: Invoice): PlatformBuyerHistory | undefined {
  return platformHistoryByCnpj[normalizeCnpj(invoice.buyerCnpj)] ?? unknownHistory
}

export function buildPostedInvoice(
  draft: InvoiceDraft,
  seller: Seller,
  catalogInvoices: Invoice[],
  catalogRiskScores: Record<string, RiskScore>,
): { invoice: Invoice; riskScore?: RiskScore } {
  const id = `inv-posted-${Date.now()}`
  const known = findKnownInvoice(draft.buyerCnpj, catalogInvoices)
  const nfeKey = draft.nfeKey.trim() || "3526...0000"

  const base: Invoice = {
    id,
    nfeKey,
    buyerName: draft.buyerName.trim(),
    buyerCnpj: draft.buyerCnpj.trim(),
    sellerName: seller.name,
    sellerCnpj: seller.cnpj,
    faceValue: draft.faceValue,
    daysToMaturity: draft.daysToMaturity,
    nfeVerified: true,
    duplicataRegistered: true,
    buyerAccepted: draft.buyerAccepted,
    ownershipClean: true,
    noPriorAssignment: true,
    noLien: true,
    knownBuyer: Boolean(known),
    historicalInvoices: known?.historicalInvoices ?? 4,
    matchedPayments: known?.matchedPayments ?? 3,
    historicValue: known?.historicValue,
    latePayments: known?.latePayments,
    latePaymentNote: known?.latePaymentNote,
    status: draft.buyerAccepted ? "eligible" : "waiting_acceptance",
  }

  if (!draft.buyerAccepted) {
    return { invoice: base }
  }

  if (known?.score != null && known.confidence && known.id in catalogRiskScores) {
    const discountPct =
      known.finalOffer != null && known.faceValue > 0
        ? ((known.faceValue - known.finalOffer) / known.faceValue) * 100
        : 2.5
    return {
      invoice: {
        ...base,
        score: known.score,
        confidence: known.confidence,
        finalOffer: applyDiscount(draft.faceValue, discountPct),
      },
      riskScore: { ...catalogRiskScores[known.id] },
    }
  }

  return {
    invoice: {
      ...base,
      score: unknownRisk.overall,
      confidence: unknownRisk.confidence,
      finalOffer: applyDiscount(draft.faceValue, 2.5),
    },
    riskScore: unknownRisk,
  }
}
