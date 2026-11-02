import Link from "next/link"
import { formatDateOnly } from "./format"
import { MoneyGroup } from "./money-value"
import { AcceptOfferButton } from "./seller-controls"
import { SELLER_PAGE_SIZE, sellerHref, type SellerQuery } from "./seller-query"

export type SellerInvoiceRow = {
  id: string
  documentId: string
  obligor: string
  faceValue: number
  currency: string
  riskScore: number
  issued: string
  dueDate: string
  soldPrice: number | null
  repaid: boolean
  unsold: boolean
  offer: number | null
}

const SORTABLE: { key: SellerQuery["sort"]; label: string }[] = [
  { key: "number", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "issued", label: "Issued" },
  { key: "due", label: "Due" },
  { key: "amount", label: "Amount" },
]

export function SellerInvoices({
  invoices,
  total,
  unfilteredTotal,
  query,
  rate,
}: {
  invoices: SellerInvoiceRow[]
  total: number
  unfilteredTotal: number
  query: SellerQuery
  rate: number | null
}) {
  const filtersActive = query.q !== "" || query.sale !== "all" || query.offer !== "any" || query.sort !== "due" || query.dir !== "asc"
  if (unfilteredTotal === 0) {
    return <p className="mt-6 text-sm leading-relaxed text-neutral-600">Invoices appear here after one is added for this organisation.</p>
  }
  if (total === 0 && !filtersActive) {
    return <p className="mt-6 text-sm leading-relaxed text-neutral-600">Invoices appear here after one is added for this organisation.</p>
  }

  const pageCount = Math.max(1, Math.ceil(total / SELLER_PAGE_SIZE))
  const current = Math.min(Math.max(query.page, 1), pageCount)
  const from = total === 0 ? 0 : (current - 1) * SELLER_PAGE_SIZE + 1
  const to = (current - 1) * SELLER_PAGE_SIZE + invoices.length

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Invoices</h2>
      <p className="mt-2 text-sm text-neutral-500">Invoices that are still due, plus any that are already sold.</p>
      <form method="get" action="/seller" className="mt-4 flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Invoice or customer"
          aria-label="Search invoices"
          className="h-10 w-64 max-w-full rounded-md border border-border bg-white px-3 text-sm"
        />
        <select name="sale" defaultValue={query.sale} aria-label="Sale status" className="h-10 rounded-md border border-border bg-white px-3 text-sm">
          <option value="all">All sales</option>
          <option value="unsold">Unsold</option>
          <option value="sold">Sold</option>
        </select>
        <select name="offer" defaultValue={query.offer} aria-label="Offer status" className="h-10 rounded-md border border-border bg-white px-3 text-sm">
          <option value="any">Any offer</option>
          <option value="open">Open offer</option>
          <option value="accepted">Accepted</option>
          <option value="none">No offer</option>
        </select>
        {query.sort !== "due" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}
        <button type="submit" className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
          Search
        </button>
        {filtersActive ? (
          <Link href="/seller" className="text-sm font-medium text-neutral-900 underline">
            Clear
          </Link>
        ) : null}
      </form>
      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              {SORTABLE.map((column) => {
                const active = query.sort === column.key
                const nextDir = active && query.dir === "asc" ? "desc" : "asc"
                return (
                  <th
                    key={column.key}
                    className="px-4 py-3 font-medium"
                    aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <Link
                      href={sellerHref(query, { sort: column.key, dir: nextDir, page: 1 })}
                      className={active ? "text-neutral-900" : "hover:text-neutral-800"}
                    >
                      {column.label}
                      {active ? (query.dir === "asc" ? " ↑" : " ↓") : ""}
                    </Link>
                  </th>
                )
              })}
              <th className="px-4 py-3 font-medium">Offered</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const offered = invoice.unsold ? invoice.offer : invoice.soldPrice
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900">{invoice.documentId}</td>
                    <td className="px-4 py-3">{invoice.obligor}</td>
                    <td className="px-4 py-3">{formatDateOnly(invoice.issued)}</td>
                    <td className="px-4 py-3">{formatDateOnly(invoice.dueDate)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <MoneyGroup rows={[{ amount: invoice.faceValue, currency: invoice.currency }]} rate={rate} compact />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {offered === null ? (
                        "—"
                      ) : (
                        <MoneyGroup rows={[{ amount: offered, currency: invoice.currency }]} rate={rate} compact />
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{invoice.riskScore}</td>
                    <td className="px-4 py-3">
                      {!invoice.unsold ? (
                        <span className="text-xs font-medium text-emerald-800">Accepted</span>
                      ) : invoice.offer !== null && !invoice.repaid ? (
                        <AcceptOfferButton invoiceId={invoice.id} />
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
        <p>
          {from}–{to} of {new Intl.NumberFormat("en-US").format(total)}
        </p>
        <div className="flex gap-3">
          {current > 1 ? (
            <Link href={sellerHref(query, { page: current - 1 })} className="font-medium text-neutral-900 underline">
              Previous
            </Link>
          ) : (
            <span className="text-neutral-400">Previous</span>
          )}
          {current < pageCount ? (
            <Link href={sellerHref(query, { page: current + 1 })} className="font-medium text-neutral-900 underline">
              Next
            </Link>
          ) : (
            <span className="text-neutral-400">Next</span>
          )}
        </div>
      </div>
    </div>
  )
}
