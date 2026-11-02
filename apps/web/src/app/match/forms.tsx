"use client"

import { useActionState } from "react"
import { runMatching, type ActionState } from "./actions"

const field =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
const button =
  "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"

function money(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function share(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`
}

function offerLine(offer: number, discount: number, discountPercent: number, currency: string) {
  return `Offer ${money(offer)} ${currency} · discount ${money(discount)} ${currency} (${share(discountPercent)})`
}

export function RunForm() {
  const [state, action, pending] = useActionState(runMatching, null)
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight">Run</h2>
      <p className="mt-2 text-sm text-muted">
        This compares every invoice with every bucket and does not save an offer or change exposure.
      </p>
      <form action={action} className="mt-4 grid gap-3">
        <label className="block text-sm">
          BRL to USD
          <input name="brl_usd" type="number" min="0" step="any" placeholder="Ask Frankfurter" className={field} />
        </label>
        <p className="text-sm text-muted">Leave the rate blank to ask Frankfurter once for this run.</p>
        {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Running" : "Run match"}
        </button>
      </form>
      {state?.invoices ? <Results state={state} /> : null}
    </div>
  )
}

function Results({ state }: { state: ActionState }) {
  if (!state?.invoices) return null
  return (
    <div className="mt-6 space-y-8">
      <p className="text-sm text-muted">
        Rate {state.rate} · day {state.today}
      </p>
      {state.invoices.length === 0 ? <p className="text-sm text-muted">No invoices.</p> : null}
      {state.invoices.map((invoice) => (
        <article key={invoice.invoiceId}>
          <p className="text-sm font-medium">{invoice.documentId}</p>
          <p className="mt-1 text-sm text-muted">
            {invoice.seller} → {invoice.obligor} · risk {invoice.riskScore}
            {invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}
            {invoice.days !== null ? ` · ${invoice.days} days` : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            Face {money(invoice.faceValue)} {invoice.currency}
            {invoice.currency.trim().toUpperCase() === "USD" || invoice.usdAmount === null
              ? ""
              : ` · ${money(invoice.usdAmount)} USD`}
          </p>
          {invoice.skipped ? (
            <p className="mt-2 text-sm text-red-700">{invoice.skipped}</p>
          ) : (
            <>
              <p className={`mt-2 text-sm ${invoice.winnerLabel ? "text-emerald-800" : "text-red-700"}`}>
                {invoice.winnerLabel ? `Assigned to ${invoice.winnerLabel}` : "Assigned to none"}
                {invoice.tiedLabels.length > 0 ? ` · tied with ${invoice.tiedLabels.join(", ")}` : ""}
              </p>
              {invoice.winnerLabel && invoice.offer !== null && invoice.price !== null && invoice.discountPercent !== null ? (
                <p className="mt-1 text-sm text-emerald-800">
                  {offerLine(invoice.offer, invoice.price, invoice.discountPercent, invoice.currency)}
                </p>
              ) : null}
              {invoice.priceDetail ? <p className="mt-1 text-sm text-muted">{invoice.priceDetail}</p> : null}
            </>
          )}
          {invoice.buckets.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {invoice.buckets.map((bucket) => (
                <section
                  key={bucket.bucketId}
                  className={`rounded-xl border p-3 ${
                    bucket.winner ? "border-emerald-600" : "border-border"
                  }`}
                >
                  <p className="text-sm font-medium">{bucket.label}</p>
                  {bucket.winner || bucket.price !== null ? (
                    <p className={`mt-1 text-sm ${bucket.winner ? "text-emerald-800" : "text-muted"}`}>
                      {bucket.winner ? "Winner" : bucket.tied ? "Tied" : "Eligible"}
                      {bucket.offer !== null && bucket.price !== null && bucket.discountPercent !== null
                        ? ` · ${offerLine(bucket.offer, bucket.price, bucket.discountPercent, invoice.currency)}`
                        : ""}
                    </p>
                  ) : null}
                  {bucket.priceDetail ? <p className="mt-1 text-sm text-muted">{bucket.priceDetail}</p> : null}
                  <ul className="mt-3 space-y-1">
                    {bucket.checks.map((check) => (
                      <li
                        key={check.name}
                        className={`flex gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          check.pass ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span aria-hidden="true" className="font-medium">
                          {check.pass ? "✓" : "✗"}
                        </span>
                        <span>
                          <span className="font-medium">{check.name}.</span> {check.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
