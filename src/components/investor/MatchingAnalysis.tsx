"use client"

import { formatBRL, formatCompactBRL, formatDays, formatPercent } from "@/lib/format"
import type { BucketMatchStats, MarketInvoice } from "@/lib/types"

export function MatchingAnalysis({
  stats,
  previews,
}: {
  stats: BucketMatchStats
  previews: MarketInvoice[]
}) {
  return (
    <aside className="rounded-lg border border-border bg-white p-5 lg:sticky lg:top-6">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        Estimated opportunity
      </p>
      <h2 className="mt-1 text-lg font-semibold text-neutral-900">Live matching analysis</h2>
      <p className="mt-1 text-sm leading-relaxed text-neutral-500">
        Tightening risk or return rules reduces available volume. These figures update as you
        change the mandate.
      </p>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-neutral-900">Current invoices</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Invoices currently available on the platform that satisfy every active rule.
        </p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">
          {stats.currentInvoiceCount}
        </p>
        <p className="text-sm text-neutral-600">matching invoices</p>
        <p className="mt-2 text-sm font-medium text-neutral-900">
          {formatCompactBRL(stats.currentFaceValue)} total face value
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Avg score</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.currentInvoiceCount ? stats.averageScore.toFixed(1) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Avg tenor</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.currentInvoiceCount ? formatDays(Math.round(stats.averageTenor)) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Avg APR</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.currentInvoiceCount ? formatPercent(stats.averageApr, 1) : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-neutral-900">Historical invoices</h3>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          Backtest based on historical platform invoice data. Past volume is not a guarantee of
          future flow.
        </p>
        <p className="mt-3 text-sm text-neutral-500">Past 12 months</p>
        <p className="text-2xl font-semibold tracking-tight text-neutral-900">
          {stats.historicalInvoiceCount}
        </p>
        <p className="text-sm text-neutral-600">matching invoices</p>
        <p className="mt-2 text-sm font-medium text-neutral-900">
          {formatCompactBRL(stats.historicalFaceValue)} total face value
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Avg monthly volume</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {formatCompactBRL(stats.averageMonthlyVolume)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Average invoice</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.historicalInvoiceCount
                ? formatBRL(Math.round(stats.historicalAverageInvoice))
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Average tenor</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.historicalInvoiceCount
                ? formatDays(Math.round(stats.historicalAverageTenor))
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Repayment rate</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {stats.historicalInvoiceCount
                ? formatPercent(stats.historicalRepaymentRate, 1)
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {previews.length > 0 && (
        <section className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">Matching invoice preview</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Informational only. An active bucket allocates automatically — no manual approval.
          </p>
          <ul className="mt-3 space-y-3">
            {previews.map((invoice) => (
              <li key={invoice.id} className="rounded-md border border-border px-3 py-2">
                <p className="text-sm font-medium text-neutral-900">{invoice.buyerName}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Score {invoice.score} · {formatDays(invoice.tenorDays)} · {invoice.industry} ·{" "}
                  {formatPercent(invoice.availableApr, 1)} APR · {formatCompactBRL(invoice.faceValue)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
