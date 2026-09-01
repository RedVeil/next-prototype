"use client"

import { formatSignedBRL, formatSignedRLUSD } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { InvestorTransactionKind } from "@/lib/types"

const KIND_LABEL: Record<InvestorTransactionKind, string> = {
  capital_deposited: "RLUSD deposited",
  capital_withdrawn: "RLUSD withdrawn",
  invoice_purchased: "Invoice investment",
  invoice_repaid: "Invoice repayment",
  investor_repayment: "Investor repayment",
  bucket_changed: "Bucket changed",
}

const RLUSD_KINDS: InvestorTransactionKind[] = ["capital_deposited", "capital_withdrawn"]

export default function TransactionsPage() {
  const { investorTransactions } = useStore()

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Transactions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Capital movements, invoice purchases, repayments, and bucket changes.
        </p>
      </div>

      <div className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
        {investorTransactions.length === 0 ? (
          <p className="px-4 py-8 text-sm text-neutral-500">No transactions yet.</p>
        ) : (
          investorTransactions.map((transaction) => (
            <div key={transaction.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
              <div>
                <p className="text-xs text-neutral-500">{transaction.at}</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">
                  {KIND_LABEL[transaction.kind]}
                </p>
                {(transaction.counterparty || transaction.note) && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {transaction.counterparty}
                    {transaction.counterparty && transaction.note ? " · " : ""}
                    {transaction.note}
                  </p>
                )}
              </div>
              {transaction.amount !== 0 && (
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    transaction.amount > 0 ? "text-emerald-800" : "text-neutral-900"
                  }`}
                >
                  {RLUSD_KINDS.includes(transaction.kind)
                    ? formatSignedRLUSD(transaction.amount)
                    : formatSignedBRL(transaction.amount)}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
