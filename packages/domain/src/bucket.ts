import { rangeLiesInside, type RiskRange } from "./risk"

export type CriteriaMode = "and" | "or"

export type ExposureKind = "flat_usd" | "portfolio_percent"

export type BucketStatus = "active" | "paused"

export type BucketMandate = {
  id: string
  investorId: string
  name: string
  status: BucketStatus
  riskLow: number
  riskHigh: number
  industries: string[]
  products: string[]
  countries: string[]
  currencies: string[]
  criteriaMode: CriteriaMode
  /** APR as a percent. 11 means 11% a year. */
  apr: number
  exposureKind: ExposureKind
  exposureLimitUsd: number
  exposureLimitPercent: number
  exposureUsedUsd: number
  tenorMin?: number
  tenorMax?: number
  invoiceMin?: number
  invoiceMax?: number
}

export type MandateInvoice = {
  originCountry: string
  currency: string
  industry: string
  product: string
  risk: RiskRange
}

/**
 * Country and currency are always gates. An empty list matches nothing.
 * A blank industry or product list is not a criterion.
 * And: every filled criterion must pass. Or: any filled criterion may pass.
 * The invoice risk range must lie inside the bucket range when risk is tested.
 */
export function matchesMandate(invoice: MandateInvoice, bucket: BucketMandate): boolean {
  if (bucket.countries.length === 0 || bucket.currencies.length === 0) return false
  if (!bucket.countries.includes(invoice.originCountry)) return false
  if (!bucket.currencies.includes(invoice.currency)) return false

  const bucketRange: RiskRange = { low: bucket.riskLow, high: bucket.riskHigh }
  const checks: boolean[] = [rangeLiesInside(invoice.risk, bucketRange)]
  if (bucket.industries.length > 0) {
    checks.push(bucket.industries.includes(invoice.industry))
  }
  if (bucket.products.length > 0) {
    checks.push(bucket.products.includes(invoice.product))
  }

  if (bucket.criteriaMode === "or") return checks.some(Boolean)
  return checks.every(Boolean)
}

export function exposureLimitUsd(bucket: BucketMandate, portfolioUsd: number): number {
  if (bucket.exposureKind === "portfolio_percent") {
    if (!Number.isFinite(portfolioUsd)) return Number.POSITIVE_INFINITY
    return (portfolioUsd * bucket.exposureLimitPercent) / 100
  }
  return bucket.exposureLimitUsd
}

/** True when this purchase would stay within the bucket exposure limit. */
export function fitsExposure(
  bucket: BucketMandate,
  invoiceAmountUsd: number,
  portfolioUsd: number,
): boolean {
  if (!Number.isFinite(invoiceAmountUsd) || invoiceAmountUsd < 0) return false
  return bucket.exposureUsedUsd + invoiceAmountUsd <= exposureLimitUsd(bucket, portfolioUsd)
}
