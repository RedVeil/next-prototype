import {
  chooseLowestPrice,
  daysUntilDue,
  fitsExposure,
  financingPrice,
  matchesMandate,
  roundPrice,
  type BucketMandate,
  type MandateInvoice,
} from "@antecipa/domain"

export const MATCHER_SERVICE = "matcher" as const

export type MatcherStatus = "idle" | "stubbed"

export type MatcherInvoice = MandateInvoice & {
  id: string
  eligibleForMatching: boolean
  dueDate: string | null
  amount: number
  amountUsd: number
}

export type OfferDraft = {
  invoiceId: string
  bucketId: string
  investorId: string
  apr: number
  dueDate: string
  days: number
  price: number
  status: "open"
}

export type MatchRequest = {
  invoices: MatcherInvoice[]
  buckets: BucketMandate[]
  nowIso: string
  portfolioUsdByInvestor?: Record<string, number>
  random?: () => number
}

/**
 * One pass, no scheduler. Loads only eligible invoices that have a due date,
 * prices active buckets, and keeps the lowest price. Ties pick one bucket at random.
 * Invoices with no due date, including installment-only invoices, are skipped.
 */
export function matchOnce(request: MatchRequest): OfferDraft[] {
  const random = request.random ?? Math.random
  const portfolios = request.portfolioUsdByInvestor ?? {}
  const offers: OfferDraft[] = []

  for (const invoice of request.invoices) {
    if (!invoice.eligibleForMatching || invoice.dueDate == null) continue
    const days = daysUntilDue(request.nowIso, invoice.dueDate)
    if (days == null || days < 0) continue

    const priced = request.buckets.flatMap((bucket) => {
      if (bucket.status !== "active") return []
      if (!matchesMandate(invoice, bucket)) return []
      const portfolioUsd = portfolios[bucket.investorId] ?? 0
      if (!fitsExposure(bucket, invoice.amountUsd, portfolioUsd)) return []
      return [
        {
          bucket,
          price: roundPrice(financingPrice(invoice.amount, bucket.apr, days)),
        },
      ]
    })

    const winner = chooseLowestPrice(priced, random)
    if (!winner) continue
    offers.push({
      invoiceId: invoice.id,
      bucketId: winner.bucket.id,
      investorId: winner.bucket.investorId,
      apr: winner.bucket.apr,
      dueDate: invoice.dueDate,
      days,
      price: winner.price,
      status: "open",
    })
  }

  return offers
}

export const matcherStatus: MatcherStatus = "stubbed"
