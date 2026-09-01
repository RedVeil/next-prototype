"use client"

import { useEffect, useMemo, useState } from "react"
import { formatBRL, formatPercent } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Invoice } from "@/lib/types"
import { MetricCard } from "@/components/ui/MetricCard"
import { InvoiceCard } from "@/components/invoices/InvoiceCard"

const STAGGER_MS = 100
const METRIC_COUNT = 4

type SortField = "rating" | "amount" | "due"
type SortDirection = "desc" | "asc"

const selectClass =
  "h-10 rounded-md border border-border bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-400"

function isEligible(invoice: Invoice) {
  return invoice.status === "eligible" || invoice.status === "offer_available"
}

function sortValue(invoice: Invoice, field: SortField): number | undefined {
  if (field === "rating") return invoice.score
  if (field === "amount") return invoice.faceValue
  return invoice.daysToMaturity
}

function compareInvoices(
  a: Invoice,
  b: Invoice,
  field: SortField,
  direction: SortDirection,
) {
  const aValue = sortValue(a, field)
  const bValue = sortValue(b, field)
  const aMissing = aValue == null
  const bMissing = bValue == null
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  const delta = aValue - bValue
  return direction === "desc" ? -delta : delta
}

export default function OverviewPage() {
  const {
    activeInvoices,
    availableToFinance,
    offersAvailable,
    soldThisMonth,
    averageFinancingCost,
  } = useStore()
  const [revealedMetrics, setRevealedMetrics] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [sortField, setSortField] = useState<SortField>("rating")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const visibleInvoices = useMemo(() => {
    const filtered = showAll ? activeInvoices : activeInvoices.filter(isEligible)
    return [...filtered].sort((a, b) => compareInvoices(a, b, sortField, sortDirection))
  }, [activeInvoices, showAll, sortField, sortDirection])

  useEffect(() => {
    const timers: number[] = []
    for (let i = 0; i < METRIC_COUNT; i++) {
      timers.push(
        window.setTimeout(() => setRevealedMetrics(i + 1), (i + 1) * STAGGER_MS),
      )
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const metrics = [
    { label: "Available to finance", value: formatBRL(availableToFinance) },
    { label: "Offers available", value: String(offersAvailable) },
    { label: "Sold this month", value: formatBRL(soldThisMonth) },
    { label: "Average financing cost", value: formatPercent(averageFinancingCost, 1) },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Eligible receivables from invoices you have issued as sacador.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            loading={index >= revealedMetrics}
          />
        ))}
      </div>

      <section className="mt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {showAll ? "All invoices" : "Eligible invoices"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {showAll
                ? "Includes invoices that have not passed hard eligibility checks."
                : "Financing is available only after hard eligibility checks pass."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(event) => setShowAll(event.target.checked)}
                className="size-4 accent-neutral-900"
              />
              Show all invoices
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <span className="whitespace-nowrap">Sort by</span>
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
                className={selectClass}
                aria-label="Sort invoices by"
              >
                <option value="rating">Rating</option>
                <option value="amount">Invoice amount</option>
                <option value="due">Due date</option>
              </select>
            </label>
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
              className={selectClass}
              aria-label="Sort direction"
            >
              <option value="desc">Largest</option>
              <option value="asc">Smallest</option>
            </select>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {visibleInvoices.length === 0 ? (
            <p className="text-sm text-neutral-500">No invoices to show.</p>
          ) : (
            visibleInvoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
