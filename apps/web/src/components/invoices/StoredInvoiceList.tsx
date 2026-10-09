import Link from "next/link"
import { AcceptOfferButton } from "@/components/invoices/AcceptOfferButton"
import { formatDateOnly } from "@/lib/format"
import {
  INVOICE_PAGE_SIZE,
  invoiceListHref,
  type InvoiceListQuery,
  type InvoiceSort,
  type ListedInvoice,
} from "@/lib/stored-invoices"

const SORTABLE: { key: InvoiceSort; label: string }[] = [
  { key: "number", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "issued", label: "Issued" },
  { key: "due", label: "Due" },
  { key: "amount", label: "Amount" },
]

export function StoredInvoiceList({
  invoices,
  page,
  total,
  query,
  basePath = "/seller/invoices",
  embedded = false,
  canAccept = true,
}: {
  invoices: ListedInvoice[]
  page: number
  total: number
  query: InvoiceListQuery
  basePath?: string
  embedded?: boolean
  canAccept?: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE))
  const current = Math.min(Math.max(page, 1), pageCount)
  const from = total === 0 ? 0 : (current - 1) * INVOICE_PAGE_SIZE + 1
  const to = (current - 1) * INVOICE_PAGE_SIZE + invoices.length
  const controlsActive = query.q !== "" || query.sale !== "all" || query.offer !== "any" || query.sort !== "due" || query.dir !== "asc"

  const Heading = embedded ? "h2" : "h1"
  return (
    <div className={embedded ? "" : "mx-auto max-w-6xl"}>
      <Heading className={embedded ? "text-lg font-semibold tracking-tight text-neutral-900" : "text-2xl font-semibold tracking-tight text-neutral-900"}>
        Invoices
      </Heading>
      <p className="mt-2 text-sm text-neutral-500">Invoices that are still due, plus any that are already sold.</p>
      <form method="get" action={basePath} className="mt-4 flex flex-wrap items-center gap-3">
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
        {query.sort !== "due" && <input type="hidden" name="sort" value={query.sort} />}
        {query.dir !== "asc" && <input type="hidden" name="dir" value={query.dir} />}
        <button type="submit" className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
          Search
        </button>
        {controlsActive && (
          <Link href={basePath} className="text-sm font-medium text-neutral-900 underline">
            Clear
          </Link>
        )}
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
                      href={invoiceListHref(basePath, query, { sort: column.key, dir: nextDir, page: 1 })}
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
              invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{invoice.number}</td>
                  <td className="px-4 py-3">{invoice.customer}</td>
                  <td className="px-4 py-3">{formatDateOnly(invoice.issued)}</td>
                  <td className="px-4 py-3">{formatDateOnly(invoice.dueDate)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(invoice.amount, invoice.currency)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {invoice.offered === null ? "—" : formatMoney(invoice.offered, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatRisk(invoice.riskLow, invoice.riskHigh)}</td>
                  <td className="px-4 py-3">{offerAction(invoice, canAccept)}</td>
                </tr>
              ))
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
            <Link href={invoiceListHref(basePath, query, { page: current - 1 })} className="font-medium text-neutral-900 underline">
              Previous
            </Link>
          ) : (
            <span className="text-neutral-400">Previous</span>
          )}
          {current < pageCount ? (
            <Link href={invoiceListHref(basePath, query, { page: current + 1 })} className="font-medium text-neutral-900 underline">
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

function offerAction(invoice: ListedInvoice, canAccept: boolean) {
  if (invoice.saleStatus === "sold" || invoice.invoiceStatus === "accepted" || invoice.offerStatus === "accepted") {
    return <span className="text-xs font-medium text-emerald-800">Accepted</span>
  }
  if (invoice.offerStatus === "open" && canAccept) return <AcceptOfferButton invoiceId={invoice.id} />
  return null
}

function formatRisk(low: number | null, high: number | null): string {
  if (low === null || high === null) return "—"
  return `${low}–${high}`
}

function formatMoney(value: number, currency: string): string {
  if (currency === "BRL") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`
}
