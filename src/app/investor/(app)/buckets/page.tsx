"use client"

import { useState } from "react"
import Link from "next/link"
import { calculateBucketMatchStats } from "@/lib/bucket-match"
import { remainingBucketCapacity } from "@/lib/capital"
import { MARKET_INVOICES } from "@/lib/market-invoices"
import {
  formatBRL,
  formatCompactBRL,
  formatDays,
  formatIndustries,
  formatPercent,
  formatScoreRange,
} from "@/lib/format"
import { useStore } from "@/lib/store"
import type { InvestmentBucket } from "@/lib/types"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

export default function BucketsPage() {
  const { buckets, setBucketStatus, deleteBucket } = useStore()
  const [pauseId, setPauseId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const pauseBucket = buckets.find((bucket) => bucket.id === pauseId)
  const deleteBucketRecord = buckets.find((bucket) => bucket.id === deleteId)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Investment Buckets
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Standing mandates that draw from the same committed capital pool.
          </p>
        </div>
        <Link
          href="/investor/buckets/new"
          className="inline-flex h-9 items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Create Bucket
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium tracking-wide text-neutral-500 uppercase">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">APR</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Tenor</th>
              <th className="px-4 py-3">Cap</th>
              <th className="px-4 py-3">Allocation</th>
              <th className="px-4 py-3">Current</th>
              <th className="px-4 py-3">Historic</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {buckets.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-sm text-neutral-500">
                  No buckets yet. Create a mandate to start allocating committed capital.
                </td>
              </tr>
            ) : (
              buckets.map((bucket) => (
                <BucketRow
                  key={bucket.id}
                  bucket={bucket}
                  onPause={() =>
                    bucket.status === "paused"
                      ? setBucketStatus(bucket.id, "active")
                      : setPauseId(bucket.id)
                  }
                  onDelete={() => setDeleteId(bucket.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {pauseBucket && (
        <ConfirmDialog
          title="Pause this investment bucket?"
          description="Paused buckets cannot fund new invoices. Existing investments are unaffected."
          confirmLabel="Pause Bucket"
          onClose={() => setPauseId(null)}
          onConfirm={() => {
            setBucketStatus(pauseBucket.id, "paused")
            setPauseId(null)
          }}
        />
      )}

      {deleteBucketRecord && (
        <ConfirmDialog
          title="Delete this investment bucket?"
          description="Deleting the bucket stops new allocations through these rules. Existing investments are unaffected."
          confirmLabel="Delete Bucket"
          danger
          onClose={() => setDeleteId(null)}
          onConfirm={() => {
            deleteBucket(deleteBucketRecord.id)
            setDeleteId(null)
          }}
        />
      )}
    </div>
  )
}

function BucketRow({
  bucket,
  onPause,
  onDelete,
}: {
  bucket: InvestmentBucket
  onPause: () => void
  onDelete: () => void
}) {
  const stats = calculateBucketMatchStats(bucket, MARKET_INVOICES)
  const remaining = remainingBucketCapacity(bucket)

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <Link
          href={`/investor/buckets/${bucket.id}`}
          className="font-medium text-neutral-900 hover:underline"
        >
          {bucket.name}
        </Link>
        <p className="text-xs text-neutral-500">{formatBRL(remaining)} remaining</p>
      </td>
      <td className="px-4 py-3">{formatPercent(bucket.requiredApr, 1)}</td>
      <td className="px-4 py-3">{formatScoreRange(bucket.scoreMin, bucket.scoreMax)}</td>
      <td className="px-4 py-3">{formatIndustries(bucket.industries)}</td>
      <td className="px-4 py-3">{bucket.tenorMax != null ? formatDays(bucket.tenorMax) : "Any"}</td>
      <td className="px-4 py-3 font-medium">{formatCompactBRL(bucket.capitalCap)}</td>
      <td className="px-4 py-3">{formatCompactBRL(bucket.currentExposure)}</td>
      <td className="px-4 py-3">
        {stats.currentInvoiceCount} · {formatCompactBRL(stats.currentFaceValue)}
      </td>
      <td className="px-4 py-3">
        {stats.historicalInvoiceCount} · {formatCompactBRL(stats.historicalFaceValue)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge tone={bucket.status === "active" ? "positive" : "warning"}>
          {bucket.status === "active" ? "Active" : "Paused"}
        </StatusBadge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <Link
            href={`/investor/buckets/${bucket.id}`}
            className="font-medium text-neutral-900 underline-offset-2 hover:underline"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={onPause}
            className="font-medium text-neutral-900 underline-offset-2 hover:underline"
          >
            {bucket.status === "paused" ? "Reactivate" : "Pause"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="font-medium text-red-700 underline-offset-2 hover:underline"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}
