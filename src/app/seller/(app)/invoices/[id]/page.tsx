"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { useParams } from "next/navigation"
import { ACCEPT_STEPS, isHardEligible } from "@/lib/mock-data"
import { formatBRL, formatDays, formatScore } from "@/lib/format"
import { useStore } from "@/lib/store"
import { EligibilityChecks } from "@/components/invoices/EligibilityChecks"
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge"
import { FinalOfferCard } from "@/components/offer/FinalOfferCard"
import { ProgressSequence } from "@/components/offer/ProgressSequence"
import { RiskScoreBadge } from "@/components/risk/RiskScoreBadge"
import { RiskScoreBreakdown } from "@/components/risk/RiskScoreBreakdown"
import { StatusBadge } from "@/components/ui/StatusBadge"

type Phase = "idle" | "accepting" | "sold"

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { getInvoice, getOffer, getRiskScore, sellInvoice } = useStore()

  const invoice = getInvoice(id)
  const offer = getOffer(id)
  const risk = getRiskScore(id)
  const [phase, setPhase] = useState<Phase>("idle")
  const [riskOpen, setRiskOpen] = useState(false)

  const onAcceptComplete = useCallback(() => {
    sellInvoice(id)
    setPhase("sold")
  }, [id, sellInvoice])

  if (!invoice) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">Invoice not found</h1>
        <Link href="/seller/invoices" className="mt-4 inline-block text-sm underline">
          Return to invoices
        </Link>
      </div>
    )
  }

  if ((invoice.status === "sold" || invoice.status === "repaid") && phase !== "sold") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">{invoice.buyerName}</h1>
        <p className="mt-2 text-sm text-neutral-500">This invoice has already been financed.</p>
        <Link
          href={`/seller/sold/${invoice.id}`}
          className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          View sold invoice
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-neutral-500">
        <Link href="/seller/invoices" className="hover:text-neutral-800">
          Invoices
        </Link>
        <span className="mx-1.5">/</span>
        {invoice.buyerName}
      </p>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {invoice.buyerName}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Buyer / sacado · CNPJ {invoice.buyerCnpj}
          </p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900">
            {formatBRL(invoice.faceValue)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Due in {formatDays(invoice.daysToMaturity)} · NF-e {invoice.nfeKey}
          </p>
        </div>
        <InvoiceStatusBadge status={phase === "sold" ? "sold" : invoice.status} />
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {invoice.nfeVerified && <StatusBadge tone="positive">Verified NF-e</StatusBadge>}
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

      {invoice.score != null && invoice.confidence && (
        <div className="mt-4">
          <p className="text-xs text-neutral-500">Risk</p>
          <RiskScoreBadge
            score={invoice.score}
            confidence={invoice.confidence}
            onClick={() => setRiskOpen(true)}
          />
        </div>
      )}

      <div className="mt-8 space-y-6">
        {phase === "sold" && (
          <section className="rounded-lg border border-border bg-white p-6">
            <h2 className="text-lg font-semibold text-neutral-900">Invoice sold</h2>
            <p className="mt-1 text-sm text-neutral-500">You received</p>
            <p className="text-3xl font-semibold tracking-tight text-neutral-900">
              {formatBRL(offer?.finalPrice ?? invoice.finalOffer ?? 0)}
            </p>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Receivable face value</dt>
                <dd className="font-medium">{formatBRL(invoice.faceValue)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Buyer</dt>
                <dd className="font-medium">{invoice.buyerName}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Due</dt>
                <dd className="font-medium">{formatDays(invoice.daysToMaturity)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="font-medium text-emerald-800">Funded</dd>
              </div>
            </dl>
            <Link
              href={`/seller/sold/${invoice.id}`}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              View sold invoice
            </Link>
          </section>
        )}

        {phase === "accepting" && (
          <ProgressSequence
            title="Assigning receivable"
            steps={ACCEPT_STEPS}
            onComplete={onAcceptComplete}
          />
        )}

        {phase === "idle" && !isHardEligible(invoice) && (
          <section className="rounded-lg border border-border bg-white p-6">
            <h2 className="text-lg font-semibold text-neutral-900">Not eligible</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              This invoice has not passed hard eligibility checks, so no financing offer is
              available. Buyer acceptance of the registered duplicata is still pending. The buyer
              does not need an account on this platform.
            </p>
            <div className="mt-5">
              <EligibilityChecks invoice={invoice} />
            </div>
          </section>
        )}

        {phase === "idle" && isHardEligible(invoice) && invoice.finalOffer != null && (
          <FinalOfferCard invoice={invoice} onSell={() => setPhase("accepting")} />
        )}
      </div>

      {invoice.score != null && (
        <p className="mt-6 text-xs text-neutral-400">
          {formatScore(invoice.score)} is an indicative automated risk score, not a final
          credit decision.
        </p>
      )}

      {riskOpen && risk && (
        <RiskScoreBreakdown invoice={invoice} score={risk} onClose={() => setRiskOpen(false)} />
      )}
    </div>
  )
}
