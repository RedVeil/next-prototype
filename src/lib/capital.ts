import type { InvestmentBucket, Investor, MarketInvoice } from "./types"

export function availableCapital(investor: Pick<Investor, "committedCapital" | "deployedCapital">): number {
  return Math.max(0, investor.committedCapital - investor.deployedCapital)
}

export function remainingBucketCapacity(
  bucket: Pick<InvestmentBucket, "capitalCap" | "currentExposure">,
): number {
  return Math.max(0, bucket.capitalCap - bucket.currentExposure)
}

export function availableThroughBucket(
  investor: Pick<Investor, "committedCapital" | "deployedCapital">,
  bucket: Pick<InvestmentBucket, "capitalCap" | "currentExposure">,
): number {
  return Math.min(availableCapital(investor), remainingBucketCapacity(bucket))
}

export function capitalUtilization(
  investor: Pick<Investor, "committedCapital" | "deployedCapital">,
): number {
  if (investor.committedCapital <= 0) return 0
  return investor.deployedCapital / investor.committedCapital
}

export function preferBucketsForInvoice(
  invoice: MarketInvoice,
  buckets: InvestmentBucket[],
  matches: (invoice: MarketInvoice, bucket: InvestmentBucket) => boolean,
): InvestmentBucket[] {
  return buckets
    .filter((bucket) => bucket.status === "active" && matches(invoice, bucket))
    .sort((a, b) => a.requiredApr - b.requiredApr)
}
