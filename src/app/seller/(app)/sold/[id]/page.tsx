"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useParams } from "next/navigation"
import { formatBRL, formatDays, formatPercent } from "@/lib/format"
import { useStore } from "@/lib/store"
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge"
import {
  TransactionTimeline,
  type TimelineItem,
} from "@/components/sold/TransactionTimeline"

export default function SoldInvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const {
    getInvoice,
    getOffer,
    getSettlement,
    simulateBuyerRepayment,
    startInvestorSettlement,
    completeSettlement,
  } = useStore()
  const invoice = getInvoice(id)
  const offer = getOffer(id)
  const settlement = getSettlement(id)

  useEffect(() => {
    if (!settlement) return
    if (settlement.buyerPayment === "received" && settlement.investorSettlement === "waiting") {
      const timeoutId = window.setTimeout(() => startInvestorSettlement(id), 900)
      return () => window.clearTimeout(timeoutId)
    }
    if (settlement.investorSettlement === "processing") {
      const timeoutId = window.setTimeout(() => completeSettlement(id), 1400)
      return () => window.clearTimeout(timeoutId)
    }
  }, [completeSettlement, id, settlement, startInvestorSettlement])

  if (!invoice || (invoice.status !== "sold" && invoice.status !== "repaid") || !settlement) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">Sold invoice not found</h1>
        <Link href="/seller/sold" className="mt-4 inline-block text-sm underline">
          Return to sold invoices
        </Link>
      </div>
    )
  }

  const items: TimelineItem[] = [
    { label: "Invoice verified", status: "complete" },
    { label: "Invoice sold", status: "complete" },
    { label: "Receivable transferred", status: "complete" },
    { label: "Seller funded", status: "complete" },
    {
      label: "Buyer repayment",
      status: settlement.buyerPayment === "received" ? "complete" : "waiting",
      detail:
        settlement.buyerPayment === "received"
          ? `${formatBRL(invoice.faceValue)} received`
          : "Waiting",
    },
    {
      label: "Investor settlement",
      status:
        settlement.investorSettlement === "settled"
          ? "complete"
          : settlement.investorSettlement === "processing"
            ? "processing"
            : "waiting",
      detail:
        settlement.investorSettlement === "settled"
          ? "Investor settled"
          : settlement.investorSettlement === "processing"
            ? "Processing"
            : "Waiting",
    },
  ]

  const repaid = invoice.status === "repaid"

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-neutral-500">
        <Link href="/seller/sold" className="hover:text-neutral-800">
          Sold invoices
        </Link>
        <span className="mx-1.5">/</span>
        {invoice.buyerName}
      </p>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {invoice.buyerName}
          </h1>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900">
            {formatBRL(settlement.sellerReceived)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">Seller received</p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </header>

      <dl className="mt-6 grid gap-4 rounded-lg border border-border bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-neutral-500">Face value</dt>
          <dd className="mt-0.5 font-medium">{formatBRL(invoice.faceValue)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Discount</dt>
          <dd className="mt-0.5 font-medium">
            {offer ? formatPercent(offer.discountPercentage) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Due</dt>
          <dd className="mt-0.5 font-medium">{formatDays(invoice.daysToMaturity)}</dd>
        </div>
      </dl>

      <section className="mt-8 rounded-lg border border-border bg-white p-6">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Transaction timeline
        </h2>
        <div className="mt-5">
          <TransactionTimeline items={items} />
        </div>

        {repaid && (
          <p className="mt-2 text-sm font-medium text-emerald-800">
            Underlying invoice fully repaid.
          </p>
        )}

        {!repaid && settlement.buyerPayment === "waiting" && (
          <button
            type="button"
            onClick={() => simulateBuyerRepayment(id)}
            className="mt-2 inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Simulate buyer repayment
          </button>
        )}
      </section>

      <p className="mt-6 text-sm leading-relaxed text-neutral-500">
        The buyer pays according to the registered receivable payment instructions. Once
        payment is received, the platform handles downstream investor settlement
        automatically.
      </p>
    </div>
  )
}
