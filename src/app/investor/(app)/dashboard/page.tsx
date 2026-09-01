"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { formatBRL, formatPercent } from "@/lib/format"
import { availableCapital } from "@/lib/capital"
import { useStore } from "@/lib/store"
import { MetricCard } from "@/components/ui/MetricCard"
import { BucketCard } from "@/components/investor/BucketCard"
import { CapitalUtilization } from "@/components/investor/CapitalUtilization"

const STAGGER_MS = 100
const METRIC_COUNT = 5

export default function InvestorOverviewPage() {
  const { investor, buckets, weightedApr, activeBucketCount, availableThroughBucket } = useStore()
  const [revealedMetrics, setRevealedMetrics] = useState(0)

  useEffect(() => {
    const timers: number[] = []
    for (let i = 0; i < METRIC_COUNT; i++) {
      timers.push(window.setTimeout(() => setRevealedMetrics(i + 1), (i + 1) * STAGGER_MS))
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  if (!investor) return null

  const available = availableCapital(investor)
  const metrics = [
    { label: "Committed capital", value: formatBRL(investor.committedCapital) },
    { label: "Deployed", value: formatBRL(investor.deployedCapital) },
    { label: "Available", value: formatBRL(available) },
    { label: "Weighted average APR", value: formatPercent(weightedApr, 1) },
    { label: "Active buckets", value: String(activeBucketCount) },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          You commit capital once. Investment buckets are standing mandates that can draw from
          this shared pool — they are not separate deposits.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            loading={index >= revealedMetrics}
          />
        ))}
      </div>

      <div className="mt-8">
        <CapitalUtilization investor={investor} />
      </div>

      <section className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Investment buckets</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Each bucket combines eligibility rules, a required APR, and an exposure cap against the
              same committed capital.
            </p>
          </div>
          <Link
            href="/investor/buckets/new"
            className="inline-flex h-9 items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New Investment Bucket
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {buckets.length === 0 ? (
            <p className="text-sm text-neutral-500">No investment buckets yet.</p>
          ) : (
            buckets.map((bucket) => (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                availableThrough={availableThroughBucket(bucket)}
                availableCapital={available}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
