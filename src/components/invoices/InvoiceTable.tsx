"use client"

import Link from "next/link"
import { useState } from "react"
import type { Invoice } from "@/lib/types"
import { formatBRL, formatDays } from "@/lib/format"
import { InvoiceStatusBadge } from "./InvoiceStatusBadge"
import { RiskScoreBadge } from "@/components/risk/RiskScoreBadge"
import { RiskScoreBreakdown } from "@/components/risk/RiskScoreBreakdown"
import { useStore } from "@/lib/store"

function Cell({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
}

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const { getRiskScore, sellInvoice } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const openInvoice = invoices.find((invoice) => invoice.id === openId)
  const openScore = openId ? getRiskScore(openId) : undefined

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium tracking-wide text-neutral-500 uppercase">
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">NF-e</th>
              <th className="px-4 py-3">Face value</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Buyer acceptance</th>
              <th className="px-4 py-3">Ownership</th>
              <th className="px-4 py-3">History</th>
              <th className="px-4 py-3">Risk score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const canFinance =
                invoice.status === "eligible" || invoice.status === "offer_available"
              return (
                <tr key={invoice.id} className="border-b border-border last:border-0">
                  <Cell>
                    <Link
                      href={`/seller/invoices/${invoice.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {invoice.buyerName}
                    </Link>
                    <p className="text-xs text-neutral-500">{invoice.buyerCnpj}</p>
                    <p className="text-xs text-neutral-400">
                      {invoice.knownBuyer ? "Known buyer" : "New buyer"}
                    </p>
                  </Cell>
                  <Cell className="font-mono text-xs text-neutral-700">{invoice.nfeKey}</Cell>
                  <Cell className="font-medium text-neutral-900">
                    {formatBRL(invoice.faceValue)}
                  </Cell>
                  <Cell className="font-medium text-neutral-900">
                    {canFinance && invoice.finalOffer != null ? formatBRL(invoice.finalOffer) : "—"}
                  </Cell>
                  <Cell>{formatDays(invoice.daysToMaturity)}</Cell>
                  <Cell>
                    {invoice.buyerAccepted ? (
                      <span className="text-emerald-800">Confirmed</span>
                    ) : (
                      <span className="text-amber-800">Pending</span>
                    )}
                  </Cell>
                  <Cell>
                    {invoice.ownershipClean ? (
                      <span className="text-emerald-800">Clean</span>
                    ) : (
                      <span className="text-red-800">Issue</span>
                    )}
                  </Cell>
                  <Cell className="text-neutral-600">
                    {invoice.historicalInvoices > 0 ? (
                      <>
                        <p>{invoice.historicalInvoices} prior invoices</p>
                        <p className="text-xs text-neutral-500">
                          {invoice.matchedPayments} matched buyer payments
                        </p>
                      </>
                    ) : (
                      <span className="text-neutral-400">No history</span>
                    )}
                  </Cell>
                  <Cell>
                    {invoice.score != null && invoice.confidence ? (
                      <RiskScoreBadge
                        score={invoice.score}
                        confidence={invoice.confidence}
                        onClick={() => setOpenId(invoice.id)}
                      />
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </Cell>
                  <Cell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </Cell>
                  <Cell>
                    {canFinance && invoice.finalOffer != null ? (
                      <button
                        type="button"
                        onClick={() => sellInvoice(invoice.id)}
                        className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline"
                      >
                        Accept offer
                      </button>
                    ) : (
                      <span className="text-sm text-neutral-400" title="Financing unavailable until eligibility checks pass">
                        Disabled
                      </span>
                    )}
                  </Cell>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {openInvoice && openScore && (
        <RiskScoreBreakdown
          invoice={openInvoice}
          score={openScore}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}
