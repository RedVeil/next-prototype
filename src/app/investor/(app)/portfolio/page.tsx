"use client"

import { formatBRL, formatDays, formatPercent } from "@/lib/format"
import { useStore } from "@/lib/store"
import { MetricCard } from "@/components/ui/MetricCard"
import { StatusBadge } from "@/components/ui/StatusBadge"

export default function PortfolioPage() {
  const { holdings, buckets, investor, weightedApr } = useStore()
  const open = holdings.filter((holding) => holding.status !== "Settled")
  const invested = open.reduce((sum, holding) => sum + holding.amountInvested, 0)
  const face = open.reduce((sum, holding) => sum + holding.faceValue, 0)
  const tenorRemaining =
    invested > 0
      ? open.reduce((sum, holding) => sum + holding.daysToMaturity * holding.amountInvested, 0) /
        invested
      : 0
  const buyers = new Set(open.map((holding) => holding.buyerName))

  const byBucket = buckets.map((bucket) => ({
    name: bucket.name,
    amount: holdings
      .filter((holding) => holding.bucketId === bucket.id && holding.status !== "Settled")
      .reduce((sum, holding) => sum + holding.amountInvested, 0),
  }))
  const orphaned = holdings.filter(
    (holding) =>
      holding.status !== "Settled" && !buckets.some((bucket) => bucket.id === holding.bucketId),
  )
  if (orphaned.length > 0) {
    const grouped = new Map<string, number>()
    for (const holding of orphaned) {
      grouped.set(holding.bucketName, (grouped.get(holding.bucketName) ?? 0) + holding.amountInvested)
    }
    for (const [name, amount] of grouped) {
      byBucket.push({ name: `${name} (closed)`, amount })
    }
  }

  const buyerExposure = new Map<string, number>()
  for (const holding of open) {
    buyerExposure.set(holding.buyerName, (buyerExposure.get(holding.buyerName) ?? 0) + holding.amountInvested)
  }
  const topBuyers = [...buyerExposure.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const metrics = [
    { label: "Total invested", value: formatBRL(invested || investor?.deployedCapital || 0) },
    { label: "Current face value", value: formatBRL(face) },
    { label: "Weighted APR", value: formatPercent(weightedApr, 1) },
    { label: "Average tenor remaining", value: formatDays(Math.round(tenorRemaining)) },
    { label: "Invoices", value: String(open.length) },
    { label: "Unique buyers", value: String(buyers.size) },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Portfolio</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Invoices currently funded from committed capital. Deleting a bucket does not unwind these
          positions.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium tracking-wide text-neutral-500 uppercase">
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">Amount invested</th>
              <th className="px-4 py-3">Face value</th>
              <th className="px-4 py-3">APR</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Bucket</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-sm text-neutral-500">
                  No holdings yet.
                </td>
              </tr>
            ) : (
              holdings.map((holding) => (
                <tr key={holding.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{holding.buyerName}</td>
                  <td className="px-4 py-3 text-neutral-700">{holding.sellerName}</td>
                  <td className="px-4 py-3">{formatBRL(holding.amountInvested)}</td>
                  <td className="px-4 py-3">{formatBRL(holding.faceValue)}</td>
                  <td className="px-4 py-3">{formatPercent(holding.apr, 1)}</td>
                  <td className="px-4 py-3">{holding.score}</td>
                  <td className="px-4 py-3">{formatDays(holding.daysToMaturity)}</td>
                  <td className="px-4 py-3">{holding.bucketName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={holding.status === "Current" ? "positive" : "neutral"}>
                      {holding.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">By bucket</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {byBucket.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-4">
                <span className="text-neutral-600">{row.name}</span>
                <span className="font-medium text-neutral-900">{formatBRL(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Top buyer exposure</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {topBuyers.map(([name, amount]) => (
              <li key={name} className="flex items-center justify-between gap-4">
                <span className="text-neutral-600">{name}</span>
                <span className="font-medium text-neutral-900">{formatBRL(amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
