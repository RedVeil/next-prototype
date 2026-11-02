import type { ReactNode } from "react"
import { formatAmount, formatApr, formatDateOnly } from "./format"
import type { CompanyInvoiceRow, CompanyRole } from "./market-data"
import { MoneyGroup } from "./money-value"
import { type CapacityLevel, type InvoiceStats, type RiskBar, type SoldDay } from "./market-stats"

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

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </section>
  )
}

export function CapacityChart({
  levels,
  label,
  mark,
}: {
  levels: CapacityLevel[]
  label: string
  mark?: number | null
}) {
  const total = levels[levels.length - 1]?.cumulative ?? 0
  const invoiceSum = mark !== null && mark !== undefined && Number.isFinite(mark) && mark > 0 ? mark : null
  if (levels.length === 0 || total <= 0) return null
  const width = 640
  const height = 220
  const pad = { l: 76, r: 16, t: 16, b: 36 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const ceiling = Math.max(total, invoiceSum ?? 0)
  const slot = plotW / levels.length
  const barW = Math.min(48, Math.max(8, slot * 0.62))
  const ticks = [ceiling, ceiling / 2, 0]
  const labelEvery = Math.max(1, Math.ceil(levels.length / 10))

  function yAt(value: number) {
    return pad.t + ((ceiling - value) / ceiling) * plotH
  }

  function barX(index: number) {
    return pad.l + slot * index + (slot - barW) / 2
  }

  const base = pad.t + plotH

  return (
    <div className="mt-4 rounded-lg border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
        <p className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-neutral-900" />
            At this APR
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-neutral-300" />
            Lower APRs
          </span>
          {invoiceSum !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 bg-red-700" />
              Eligible invoices
            </span>
          ) : null}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-52 w-full" role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={pad.l - 8} y={yAt(tick) + 4} textAnchor="end" fill="#737373" fontSize="11">
              {formatAmount(tick)}
            </text>
          </g>
        ))}
        {levels.map((level, index) => {
          const x = barX(index)
          const top = yAt(level.cumulative)
          const split = yAt(level.cumulative - level.amount)
          const priorH = Math.max(base - split, 0)
          const sizeH = Math.max(split - top, 1)
          const showLabel = index % labelEvery === 0 || index === levels.length - 1
          return (
            <g key={level.apr}>
              <title>
                {`${formatApr(level.apr)} · ${formatUsd(level.amount)} at this APR · ${formatUsd(level.cumulative)} total`}
              </title>
              {priorH > 0 ? <rect x={x} y={split} width={barW} height={priorH} fill="#d6d3d1" /> : null}
              <rect x={x} y={top} width={barW} height={sizeH} rx={priorH > 0 ? 0 : 2} fill="#171717" />
              {showLabel ? (
                <text x={x + barW / 2} y={height - 10} textAnchor="middle" fill="#737373" fontSize="11">
                  {formatApr(level.apr)}
                </text>
              ) : null}
            </g>
          )
        })}
        {invoiceSum !== null ? (
          <g>
            <title>{`Eligible invoices · ${formatUsd(invoiceSum)}`}</title>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={yAt(invoiceSum)}
              y2={yAt(invoiceSum)}
              stroke="#b91c1c"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={width - pad.r}
              y={yAt(invoiceSum) < pad.t + 14 ? yAt(invoiceSum) + 14 : yAt(invoiceSum) - 6}
              textAnchor="end"
              fill="#b91c1c"
              fontSize="11"
            >
              {formatAmount(invoiceSum)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}

function AmountBars({
  points,
  label,
  eachTick,
}: {
  points: { id: string; amount: number; tick: string }[]
  label: string
  eachTick: boolean
}) {
  if (points.length === 0) return null
  const width = 640
  const height = 220
  const pad = { l: 76, r: 16, t: 28, b: 36 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const max = Math.max(...points.map((point) => point.amount))
  const ceiling = max > 0 ? max : 1
  const slot = plotW / points.length
  const barW = Math.min(36, Math.max(4, slot * 0.62))
  const ticks = [ceiling, ceiling / 2, 0]
  const labelEvery = eachTick ? Math.max(1, Math.ceil(points.length / 10)) : points.length

  function yAt(value: number) {
    return pad.t + ((ceiling - value) / ceiling) * plotH
  }

  function barX(index: number) {
    return pad.l + slot * index + (slot - barW) / 2
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-52 w-full" role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={pad.l - 8} y={yAt(tick) + 4} textAnchor="end" fill="#737373" fontSize="11">
              {formatAmount(tick)}
            </text>
          </g>
        ))}
        {points.map((point, index) => {
          const x = barX(index)
          const y = yAt(point.amount)
          const showTick = eachTick && (index % labelEvery === 0 || index === points.length - 1)
          return (
            <g key={point.id}>
              <title>{`${point.tick} · ${formatUsd(point.amount)}`}</title>
              <rect x={x} y={y} width={barW} height={Math.max(pad.t + plotH - y, 1)} rx="2" fill="#171717" />
              {showTick ? (
                <text x={x + barW / 2} y={height - 10} textAnchor="middle" fill="#737373" fontSize="11">
                  {point.tick}
                </text>
              ) : null}
            </g>
          )
        })}
        {eachTick ? null : points.length === 1 ? (
          <text x={barX(0) + barW / 2} y={height - 10} textAnchor="middle" fill="#737373" fontSize="11">
            {points[0]?.tick}
          </text>
        ) : (
          <>
            <text x={barX(0)} y={height - 10} textAnchor="start" fill="#737373" fontSize="11">
              {points[0]?.tick}
            </text>
            <text x={barX(points.length - 1) + barW} y={height - 10} textAnchor="end" fill="#737373" fontSize="11">
              {points[points.length - 1]?.tick}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

export function AmountByDayChart({ points, label }: { points: SoldDay[]; label: string }) {
  return (
    <AmountBars
      label={label}
      eachTick={false}
      points={points.map((point) => ({ id: point.date, amount: point.amount, tick: formatDateOnly(point.date) }))}
    />
  )
}

export function FaceByRiskChart({ points }: { points: RiskBar[] }) {
  return (
    <AmountBars
      label="Face by risk"
      eachTick
      points={points.map((point) => ({ id: String(point.score), amount: point.amount, tick: formatScore(point.score) }))}
    />
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
