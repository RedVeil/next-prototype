import type { ReactNode } from "react"
import { formatAmount, formatApr, formatDateOnly } from "./format"
import type { CompanyInvoiceRow, CompanyRole } from "./market-data"
import { MoneyGroup } from "./money-value"
import { weightedAverage, weightedMedian, type InvoiceStats } from "./market-stats"

export function joinList(values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(", ") : "—"
}

function FaceValue({ stats, pick }: { stats: InvoiceStats; pick: "sum" | "average" | "median" }) {
  if (pick !== "sum" && stats.count === 0) return <span>—</span>
  const usd = stats.usd?.[pick] ?? null
  return (
    <span className="block">
      <span className="block">{usd === null ? "—" : `${formatAmount(usd)} USD`}</span>
      {stats.face.some((row) => row.currency.trim().toUpperCase() !== "USD") ? (
        <span className="mt-1 block text-sm font-normal tracking-normal text-neutral-500">
          {stats.face.map((row) => `${formatAmount(row[pick])} ${row.currency.trim().toUpperCase() || row.currency}`).join(" · ")}
        </span>
      ) : null}
    </span>
  )
}

export function formatDays(value: number | null) {
  if (value === null) return "—"
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 1 })
  return `${text} days`
}

export function formatScore(value: number | null) {
  if (value === null) return "—"
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 })
}

export function formatUsd(value: number | null) {
  if (value === null) return "—"
  return `${formatAmount(value)} USD`
}

export function weightedRateText(rows: { apr: number; amount: number }[], pick: "average" | "median") {
  const value = pick === "average" ? weightedAverage(rows) : weightedMedian(rows)
  return value === null ? "—" : formatApr(value)
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </section>
  )
}

export function InvoiceStatsGrid({ stats }: { stats: InvoiceStats }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Invoices" value={new Intl.NumberFormat("en-US").format(stats.count)} />
      <Stat label="Total face" value={<FaceValue stats={stats} pick="sum" />} />
      <Stat label="Average face" value={<FaceValue stats={stats} pick="average" />} />
      <Stat label="Median face" value={<FaceValue stats={stats} pick="median" />} />
      <Stat label="Average tenor" value={formatDays(stats.averageTenor)} />
      <Stat label="Median tenor" value={formatDays(stats.medianTenor)} />
      <Stat label="Average risk" value={formatScore(stats.averageRisk)} />
      <Stat label="Median risk" value={formatScore(stats.medianRisk)} />
    </div>
  )
}

export function InvoiceTable({ invoices, rate }: { invoices: CompanyInvoiceRow[]; rate: number | null }) {
  if (invoices.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">No invoices in this role.</p>
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Invoice</th>
            <th className="px-4 py-3 font-medium">Counterparty</th>
            <th className="px-4 py-3 font-medium">Face</th>
            <th className="px-4 py-3 font-medium">Risk</th>
            <th className="px-4 py-3 font-medium">Tenor</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-neutral-900">{invoice.documentId}</td>
              <td className="px-4 py-3">{invoice.counterparty}</td>
              <td className="px-4 py-3 tabular-nums">
                <MoneyGroup rows={[{ amount: invoice.faceValue, currency: invoice.currency }]} rate={rate} compact />
              </td>
              <td className="px-4 py-3 tabular-nums">{invoice.riskScore}</td>
              <td className="px-4 py-3 tabular-nums">{formatDays(invoice.tenorDays)}</td>
              <td className="px-4 py-3">{formatDateOnly(invoice.dueDate)}</td>
              <td className="px-4 py-3">{invoice.repaid ? "Repaid" : "Open"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProductTable({ products }: { products: CompanyRole["products"] }) {
  if (products.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">No product lines on these invoices.</p>
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">Unit</th>
            <th className="px-4 py-3 font-medium">Lines</th>
            <th className="px-4 py-3 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={`${product.product}-${product.unit}`} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-neutral-900">{product.product}</td>
              <td className="px-4 py-3">{product.unit}</td>
              <td className="px-4 py-3 tabular-nums">{product.count}</td>
              <td className="px-4 py-3 tabular-nums">{formatAmount(product.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
