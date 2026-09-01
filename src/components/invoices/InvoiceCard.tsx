"use client"

import type { Invoice } from "@/lib/types"
import { formatBRL, formatDays, formatPercent } from "@/lib/format"
import { useStore } from "@/lib/store"
import { InvoiceStatusBadge } from "./InvoiceStatusBadge"
import { RiskScoreBadge } from "@/components/risk/RiskScoreBadge"
import { StatusBadge } from "@/components/ui/StatusBadge"

export function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const { sellInvoice } = useStore()
  const eligible = invoice.status === "eligible" || invoice.status === "offer_available"
  const offer = invoice.finalOffer
  const discountPercent =
    offer != null && invoice.faceValue > 0
      ? ((invoice.faceValue - offer) / invoice.faceValue) * 100
      : undefined

  return (
    <article className="flex flex-col rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">{invoice.buyerName}</h3>
          <p className="mt-1 text-sm text-neutral-500">NF-e {invoice.nfeKey}</p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-neutral-500">Face value</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatBRL(invoice.faceValue)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Due</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {formatDays(invoice.daysToMaturity)}
          </dd>
        </div>
        {eligible && offer != null && (
          <div>
            <dt className="text-neutral-500">Offer</dt>
            <dd className="mt-0.5 text-base font-semibold text-neutral-900">{formatBRL(offer)}</dd>
          </div>
        )}
        {eligible && discountPercent != null && (
          <div>
            <dt className="text-neutral-500">Discount</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {formatPercent(discountPercent)}
            </dd>
          </div>
        )}
        {invoice.score != null && invoice.confidence && (
          <div>
            <dt className="text-neutral-500">Risk score</dt>
            <dd className="mt-0.5">
              <RiskScoreBadge score={invoice.score} confidence={invoice.confidence} />
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {invoice.nfeVerified && <StatusBadge tone="positive">NF-e verified</StatusBadge>}
        {invoice.knownBuyer ? (
          <StatusBadge tone="neutral">Known buyer</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">New buyer</StatusBadge>
        )}
        {invoice.buyerAccepted ? (
          <StatusBadge tone="positive">Buyer accepted</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Buyer acceptance pending</StatusBadge>
        )}
        {invoice.ownershipClean && <StatusBadge tone="positive">Ownership clean</StatusBadge>}
      </div>

      {!eligible && (
        <p className="mt-4 text-sm text-neutral-500">This invoice is not yet eligible.</p>
      )}

      {eligible && offer != null && (
        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={() => sellInvoice(invoice.id)}
            className="inline-flex h-9 items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Accept offer
          </button>
        </div>
      )}
    </article>
  )
}

export function InvoiceCardSkeleton() {
  return (
    <article className="flex min-h-[280px] flex-col rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-200" />
          <div className="h-4 w-28 animate-pulse rounded bg-neutral-100" />
        </div>
        <div className="h-5 w-16 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-16 animate-pulse rounded bg-neutral-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
          <div className="h-5 w-24 animate-pulse rounded bg-neutral-200" />
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        <div className="h-5 w-24 animate-pulse rounded bg-neutral-100" />
        <div className="h-5 w-20 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-auto pt-5">
        <div className="h-9 w-28 animate-pulse rounded bg-neutral-200" />
      </div>
    </article>
  )
}
