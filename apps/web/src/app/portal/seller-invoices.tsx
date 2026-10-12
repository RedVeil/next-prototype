"use client"

import { useMemo, useState } from "react"
import { money } from "./metrics"

export type SellerInvoice = {
  id: string
  documentId: string
  obligor: string
  faceValue: number
  currency: string
  riskScore: number
  dueDate: string
  soldPrice: number | null
  repaid: boolean
  unsold: boolean
  offer: number | null
  offerInvestor: string
}

type SortField = "rating" | "amount" | "due"
type SortDirection = "desc" | "asc"

const selectClass =
  "h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-foreground"

function sortValue(invoice: SellerInvoice, field: SortField) {
  if (field === "rating") return invoice.riskScore
  if (field === "amount") return invoice.faceValue
  return invoice.dueDate
}

export function SellerInvoices({ invoices }: { invoices: SellerInvoice[] }) {
  const [showAll, setShowAll] = useState(false)
  const [sortField, setSortField] = useState<SortField>("rating")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const visible = useMemo(() => {
    const filtered = showAll ? invoices : invoices.filter((invoice) => invoice.unsold && !invoice.repaid)
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sortField)
      const right = sortValue(b, sortField)
      if (left === right) return 0
      const delta = left < right ? -1 : 1
      return sortDirection === "desc" ? -delta : delta
    })
  }, [invoices, showAll, sortField, sortDirection])

  return (
    <section className="mt-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{showAll ? "All invoices" : "Unsold invoices"}</h2>
          <p className="mt-1 text-sm text-muted">
            {showAll ? "Includes sold and repaid invoices." : "Invoices that have not been sold and have not been repaid."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
              className="size-4 accent-foreground"
            />
            Show all invoices
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
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
        {visible.length === 0 ? (
          <p className="text-sm text-muted">No invoices to show.</p>
        ) : (
          visible.map((invoice) => {
            const state = invoice.repaid ? "Repaid" : invoice.unsold ? "Unsold" : "Sold"
            const priced = invoice.unsold && !invoice.repaid ? invoice.offer : invoice.soldPrice
            const priceLabel = invoice.unsold && !invoice.repaid ? "Offer" : "Sold price"
            return (
              <article key={invoice.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{invoice.obligor || "Obligor"}</h3>
                    <p className="mt-1 text-sm text-muted">{invoice.documentId}</p>
                  </div>
                  <p className="text-sm text-muted">{state}</p>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted">Face value</dt>
                    <dd className="mt-0.5 font-medium">{money(invoice.faceValue, invoice.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Due</dt>
                    <dd className="mt-0.5 font-medium">{invoice.dueDate}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Risk score</dt>
                    <dd className="mt-0.5 font-medium">{invoice.riskScore}</dd>
                  </div>
                  {priced !== null ? (
                    <div>
                      <dt className="text-muted">{priceLabel}</dt>
                      <dd className="mt-0.5 font-medium">{money(priced, invoice.currency)}</dd>
                    </div>
                  ) : null}
                </dl>
                {invoice.unsold && !invoice.repaid && invoice.offer !== null && invoice.offerInvestor ? (
                  <p className="mt-4 text-sm text-muted">{invoice.offerInvestor}</p>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
