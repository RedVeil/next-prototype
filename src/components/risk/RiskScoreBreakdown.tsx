"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import type { Invoice, RiskScore } from "@/lib/types"
import { formatBRL, formatScore, scoreBand } from "@/lib/format"
import { SCORE_WEIGHTS } from "@/lib/mock-data"
import { getPlatformHistory } from "@/lib/pricing"

function Factor({
  title,
  score,
  weight,
  children,
}: {
  title: string
  score: number
  weight: number
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border py-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium text-neutral-900">{title}</h3>
        <p className="text-sm tabular-nums text-neutral-700">
          {score}
          <span className="ml-2 text-xs text-neutral-400">{Math.round(weight * 100)}%</span>
        </p>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600">{children}</div>
    </div>
  )
}

type RiskScoreBreakdownProps = {
  invoice: Invoice
  score: RiskScore
  onClose: () => void
}

export function RiskScoreBreakdown({ invoice, score, onClose }: RiskScoreBreakdownProps) {
  const platform = getPlatformHistory(invoice)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 sm:p-8">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-title"
        className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-white"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Indicative automated risk score
            </p>
            <h2 id="risk-title" className="mt-1 text-lg font-semibold text-neutral-900">
              {invoice.buyerName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-neutral-900">
                {formatScore(score.overall)}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {scoreBand(score.overall)} · {score.confidence} confidence
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            Weights are illustrative. Invoices must still pass hard eligibility checks
            (valid NF-e, buyer acceptance, registered duplicata, clean ownership) before a
            score is produced.
          </p>

          <Factor
            title="Invoice integrity"
            score={score.invoiceIntegrity}
            weight={SCORE_WEIGHTS.invoiceIntegrity}
          >
            <p>Based on documentary and registry checks for this receivable:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Valid NF-e for the underlying commercial transaction</li>
              <li>Buyer acceptance of the duplicata</li>
              <li>Registered Duplicata Escritural</li>
              <li>Seller is the current owner of the receivable</li>
              <li>No prior assignment</li>
              <li>No lien</li>
            </ul>
            <p>
              NF-e confirms the commercial sale. Current legal ownership is taken from the
              registered duplicata, not from the NF-e itself.
            </p>
          </Factor>

          <Factor
            title="Buyer external risk"
            score={score.buyerExternal}
            weight={SCORE_WEIGHTS.buyerExternal}
          >
            <p>Public and bureau signals on the buyer (sacado), including:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Legal company status</li>
              <li>Litigation</li>
              <li>Bankruptcy / restructuring</li>
              <li>Tax problems</li>
              <li>Credit bureau information</li>
              <li>Company age and structure</li>
            </ul>
            <p>
              This does not include the buyer’s current bank liquidity. We do not access
              the buyer’s bank accounts.
            </p>
          </Factor>

          <Factor
            title="Seller → buyer history"
            score={score.sellerBuyerHistory}
            weight={SCORE_WEIGHTS.sellerBuyerHistory}
          >
            {invoice.historicalInvoices > 0 ? (
              <>
                <p>
                  {invoice.historicalInvoices} previous invoices to this buyer
                  {invoice.historicValue
                    ? `, ${formatBRL(invoice.historicValue)} total historic value`
                    : ""}
                  .
                </p>
                <p>
                  {invoice.matchedPayments} settled normally
                  {invoice.latePaymentNote ? `. ${invoice.latePaymentNote}.` : "."}
                </p>
              </>
            ) : (
              <p>No prior invoices observed between this seller and buyer.</p>
            )}
          </Factor>

          <Factor
            title="Bank repayment evidence"
            score={score.openFinanceEvidence}
            weight={SCORE_WEIGHTS.openFinanceEvidence}
          >
            <p>
              We matched historical payments received in the seller&apos;s bank accounts to
              this buyer and corresponding invoices.
            </p>
            <p>
              {invoice.matchedPayments} of {invoice.historicalInvoices} historical payments
              matched.
            </p>
            <p>
              Open Finance is connected to the seller&apos;s company accounts. It does not
              provide access to the buyer&apos;s private bank balances.
            </p>
          </Factor>

          <Factor
            title="Platform history"
            score={score.platformHistory}
            weight={SCORE_WEIGHTS.platformHistory}
          >
            {platform ? (
              <>
                <p>Across all sellers on the platform:</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>{platform.observed} previously observed invoices against this buyer</li>
                  <li>{platform.onTime} paid on time</li>
                  <li>{platform.lateWithin5} paid within 5 days after due date</li>
                  <li>{platform.defaults} defaults</li>
                </ul>
                <p>This is proprietary platform data, not a public bureau score.</p>
              </>
            ) : (
              <p>Limited platform history for this buyer.</p>
            )}
          </Factor>
        </div>
      </section>
    </div>
  )
}
