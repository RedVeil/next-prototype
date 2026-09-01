import type { BucketDraft, BucketMatchStats, InvestmentBucket, MarketInvoice } from "./types"

const CONFIDENCE_RANK = { Low: 0, Medium: 1, High: 2 } as const

export type BucketRuleInput = Pick<
  InvestmentBucket,
  | "scoreMin"
  | "scoreMax"
  | "industries"
  | "tenorMin"
  | "tenorMax"
  | "invoiceMin"
  | "invoiceMax"
  | "minimumConfidence"
  | "minHistoricalInvoices"
  | "minPlatformRepayments"
  | "maxLatePaymentRate"
  | "requiredApr"
>

export function draftToRules(draft: BucketDraft): BucketRuleInput {
  return {
    scoreMin: draft.scoreMin,
    scoreMax: draft.scoreMax,
    industries: draft.industries,
    tenorMin: draft.tenorMin,
    tenorMax: draft.tenorMax,
    invoiceMin: draft.invoiceMin,
    invoiceMax: draft.invoiceMax,
    minimumConfidence: draft.minimumConfidence,
    minHistoricalInvoices: draft.minHistoricalInvoices,
    minPlatformRepayments: draft.minPlatformRepayments,
    maxLatePaymentRate: draft.maxLatePaymentRate,
    requiredApr: draft.requiredApr,
  }
}

function allowsAnyIndustry(industries: string[]): boolean {
  return industries.length === 0 || industries.includes("Any")
}

export function matchesBucket(invoice: MarketInvoice, bucket: BucketRuleInput): boolean {
  if (invoice.score < bucket.scoreMin || invoice.score > bucket.scoreMax) return false
  if (!allowsAnyIndustry(bucket.industries) && !bucket.industries.includes(invoice.industry)) {
    return false
  }
  if (bucket.tenorMin != null && invoice.tenorDays < bucket.tenorMin) return false
  if (bucket.tenorMax != null && invoice.tenorDays > bucket.tenorMax) return false
  if (bucket.invoiceMin != null && invoice.faceValue < bucket.invoiceMin) return false
  if (bucket.invoiceMax != null && invoice.faceValue > bucket.invoiceMax) return false
  if (
    bucket.minimumConfidence &&
    CONFIDENCE_RANK[invoice.confidence] < CONFIDENCE_RANK[bucket.minimumConfidence]
  ) {
    return false
  }
  if (invoice.availableApr < bucket.requiredApr) return false
  if (
    bucket.minHistoricalInvoices != null &&
    invoice.buyerHistoricalInvoices < bucket.minHistoricalInvoices
  ) {
    return false
  }
  if (
    bucket.minPlatformRepayments != null &&
    invoice.buyerPlatformRepayments < bucket.minPlatformRepayments
  ) {
    return false
  }
  if (
    bucket.maxLatePaymentRate != null &&
    invoice.buyerLatePaymentRate > bucket.maxLatePaymentRate
  ) {
    return false
  }
  return true
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function calculateBucketMatchStats(
  bucket: BucketRuleInput,
  invoices: MarketInvoice[],
): BucketMatchStats {
  const current = invoices.filter((invoice) => !invoice.historical && matchesBucket(invoice, bucket))
  const historical = invoices.filter(
    (invoice) => invoice.historical && matchesBucket(invoice, bucket),
  )
  const currentFaceValue = current.reduce((sum, invoice) => sum + invoice.faceValue, 0)
  const historicalFaceValue = historical.reduce((sum, invoice) => sum + invoice.faceValue, 0)
  const repaid = historical.filter((invoice) => invoice.repaid).length

  return {
    currentInvoiceCount: current.length,
    currentFaceValue,
    historicalInvoiceCount: historical.length,
    historicalFaceValue,
    averageScore: average(current.map((invoice) => invoice.score)),
    averageTenor: average(current.map((invoice) => invoice.tenorDays)),
    averageApr: average(current.map((invoice) => invoice.availableApr)),
    historicalAverageInvoice:
      historical.length > 0 ? historicalFaceValue / historical.length : 0,
    historicalAverageTenor: average(historical.map((invoice) => invoice.tenorDays)),
    averageMonthlyVolume: historicalFaceValue / 12,
    historicalRepaymentRate: historical.length > 0 ? (repaid / historical.length) * 100 : 0,
  }
}

export function previewMatchingInvoices(
  bucket: BucketRuleInput,
  invoices: MarketInvoice[],
  limit = 3,
): MarketInvoice[] {
  return invoices
    .filter((invoice) => !invoice.historical && matchesBucket(invoice, bucket))
    .slice(0, limit)
}

export const EMPTY_MATCH_STATS: BucketMatchStats = {
  currentInvoiceCount: 0,
  currentFaceValue: 0,
  historicalInvoiceCount: 0,
  historicalFaceValue: 0,
  averageScore: 0,
  averageTenor: 0,
  averageApr: 0,
  historicalAverageInvoice: 0,
  historicalAverageTenor: 0,
  averageMonthlyVolume: 0,
  historicalRepaymentRate: 0,
}
