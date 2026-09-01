"use client"

import type { Invoice } from "@/lib/types"
import { formatBRL, formatPercent, formatScore } from "@/lib/format"
import { PricingExplanation } from "./PricingExplanation"

export function FinalOfferCard({
  invoice,
  onSell,
}: {
  invoice: Invoice
  onSell: () => void
}) {
  const price = invoice.finalOffer ?? 0
  const discountAmount = invoice.faceValue - price
  const discountPercentage =
    invoice.faceValue > 0 ? (discountAmount / invoice.faceValue) * 100 : 0

  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Offer</h2>
      <p className="mt-3 text-sm text-neutral-500">You receive today</p>
      <p className="text-3xl font-semibold tracking-tight text-neutral-900">{formatBRL(price)}</p>

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between border-b border-border py-2 sm:block sm:border-0 sm:py-0">
          <dt className="text-neutral-500">Face value</dt>
          <dd className="font-medium">{formatBRL(invoice.faceValue)}</dd>
        </div>
        <div className="flex justify-between border-b border-border py-2 sm:block sm:border-0 sm:py-0">
          <dt className="text-neutral-500">Financing cost</dt>
          <dd className="font-medium">{formatBRL(discountAmount)}</dd>
        </div>
        <div className="flex justify-between border-b border-border py-2 sm:block sm:border-0 sm:py-0">
          <dt className="text-neutral-500">Discount</dt>
          <dd className="font-medium">{formatPercent(discountPercentage)}</dd>
        </div>
        <div className="flex justify-between border-b border-border py-2 sm:block sm:border-0 sm:py-0">
          <dt className="text-neutral-500">Due</dt>
          <dd className="font-medium">{invoice.daysToMaturity} days</dd>
        </div>
        {invoice.score != null && invoice.confidence && (
          <div className="flex justify-between py-2 sm:block sm:py-0">
            <dt className="text-neutral-500">Risk score</dt>
            <dd className="font-medium">
              {formatScore(invoice.score)} · {invoice.confidence} confidence
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-5 text-sm leading-relaxed text-neutral-600">
        This is a firm offer. The invoice remains yours until you sell it.
      </p>

      <button
        type="button"
        onClick={onSell}
        className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Accept offer
      </button>

      <PricingExplanation />
    </section>
  )
}
