import Link from "next/link"
import { remainingBucketCapacity } from "@/lib/capital"
import { MARKET_INVOICES } from "@/lib/market-invoices"
import { calculateBucketMatchStats } from "@/lib/bucket-match"
import {
  formatBRL,
  formatCompactBRL,
  formatDays,
  formatIndustries,
  formatPercent,
  formatScoreRange,
} from "@/lib/format"
import { StatusBadge } from "@/components/ui/StatusBadge"
import type { InvestmentBucket } from "@/lib/types"

type BucketCardProps = {
  bucket: InvestmentBucket
  availableThrough: number
  availableCapital: number
}

export function BucketCard({ bucket, availableThrough, availableCapital }: BucketCardProps) {
  const remaining = remainingBucketCapacity(bucket)
  const stats = calculateBucketMatchStats(bucket, MARKET_INVOICES)
  const capitalLimited = availableThrough < remaining && availableCapital < remaining

  return (
    <article className="flex flex-col rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">{bucket.name}</h3>
        <StatusBadge tone={bucket.status === "active" ? "positive" : "warning"}>
          {bucket.status === "active" ? "Active" : "Paused"}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-neutral-500">Required APR</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatPercent(bucket.requiredApr, 1)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Score</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {formatScoreRange(bucket.scoreMin, bucket.scoreMax)}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Industry</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatIndustries(bucket.industries)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Max tenor</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {bucket.tenorMax != null ? formatDays(bucket.tenorMax) : "Any"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Bucket cap</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatBRL(bucket.capitalCap)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Current exposure</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatBRL(bucket.currentExposure)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Remaining bucket cap</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatBRL(remaining)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Available through this bucket
          </dt>
          <dd className="mt-0.5 text-lg font-semibold text-neutral-900">
            {formatCompactBRL(availableThrough)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Current opportunities
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-900">
            {stats.currentInvoiceCount} invoices
          </p>
          <p className="text-xs text-neutral-500">
            {formatCompactBRL(stats.currentFaceValue)} total face value
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Historical matches
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-900">
            {stats.historicalInvoiceCount} invoices
          </p>
          <p className="text-xs text-neutral-500">
            {formatCompactBRL(stats.historicalFaceValue)} total face value
          </p>
        </div>
      </div>

      {capitalLimited && (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          Up to {formatCompactBRL(availableCapital)} can currently be deployed through this bucket
          because only {formatCompactBRL(availableCapital)} of committed capital remains available.
        </p>
      )}
      {!capitalLimited && remaining > 0 && remaining <= 100_000 && (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          Only {formatCompactBRL(remaining)} of bucket capacity remains.
        </p>
      )}

      <div className="mt-auto pt-5">
        <Link
          href={`/investor/buckets/${bucket.id}`}
          className="inline-flex h-9 items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          View / Edit Bucket
        </Link>
      </div>
    </article>
  )
}
