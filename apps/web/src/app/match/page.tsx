import type { ReactNode } from "react"
import { RunForm } from "./forms"
import { loadCatalogue, type ListedBucket } from "./load"
import type { MatchInvoice } from "./match"

export const dynamic = "force-dynamic"

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function invoiceLine(invoice: MatchInvoice) {
  const industries = invoice.sellerIndustries.length > 0 ? invoice.sellerIndustries.join(", ") : "no industries"
  return `${invoice.documentId} · ${invoice.seller} → ${invoice.obligor} · ${invoice.faceValue} ${invoice.currency} · score ${invoice.riskScore} · due ${invoice.dueDate} · ${invoice.sellerCountry} · ${industries}`
}

function bucketLine(bucket: ListedBucket) {
  const tenor =
    bucket.tenorMin === null && bucket.tenorMax === null
      ? "any tenor"
      : `${bucket.tenorMin ?? "…"}–${bucket.tenorMax ?? "…"} days`
  const exposure =
    bucket.exposureKind === "flat_usd"
      ? `${bucket.exposureLimitUsd ?? "missing"} USD flat, ${bucket.exposureUsedUsd} used`
      : `${bucket.exposureLimitPercent ?? "missing"}% of portfolio, ${bucket.exposureUsedUsd} used`
  const features = bucket.features.length > 0 ? ` · ${bucket.features.join(", ")}` : ""
  return `${bucket.name} · ${bucket.investor} · ${bucket.status} · risk ${bucket.riskLow}–${bucket.riskHigh} · face ${bucket.faceMin}–${bucket.faceMax} · ${tenor} · industries ${bucket.industries.join(", ") || "any"} · countries ${bucket.countries.join(", ") || "any"} · currencies ${bucket.currencies.join(", ") || "any"} · APR ${bucket.apr} · ${exposure}${features}`
}

export default async function MatchPage() {
  let data: Awaited<ReturnType<typeof loadCatalogue>> | null = null
  let detail = ""
  try {
    data = await loadCatalogue()
  } catch (error) {
    detail = error instanceof Error ? error.message : "The match tables did not respond."
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm text-muted">Match</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Matching</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Available invoices are unsold, unpaid, and due today or later. The lowest price wins. A
          blank industry, country, or currency list is not a filter.
        </p>
        <a href="/sandbox" className="mt-3 inline-block text-sm text-muted underline">
          Demo data
        </a>
      </div>
      {detail ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-red-700">{detail}</p>
      ) : data ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Invoices">
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {data.invoices.length === 0 ? <li>None yet.</li> : null}
                {data.invoices.map((invoice) => (
                  <li key={invoice.id}>{invoiceLine(invoice)}</li>
                ))}
              </ul>
            </Card>
            <Card title="Buckets">
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {data.buckets.length === 0 ? <li>None yet.</li> : null}
                {data.buckets.map((bucket) => (
                  <li key={bucket.id}>{bucketLine(bucket)}</li>
                ))}
              </ul>
            </Card>
          </div>
          <RunForm />
        </>
      ) : null}
    </main>
  )
}
