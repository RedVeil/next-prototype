import { loadCatalogue } from "@/app/match/load"
import { runMatch } from "@/app/match/match"
import { frankfurterRate } from "@/app/match/rate"
import { createServiceClient } from "@/lib/supabase/service"
import { Metric, moneyByCurrency, percent } from "./metrics"
import { SellerInvoices, type SellerInvoice } from "./seller-invoices"

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dateOnly(value: unknown) {
  return String(value ?? "").slice(0, 10)
}

async function pricedOffers(invoiceIds: Set<string>) {
  try {
    const rate = await frankfurterRate()
    const catalogue = await loadCatalogue()
    const outcomes = runMatch({
      today: new Date().toISOString().slice(0, 10),
      rate,
      invoices: catalogue.invoices,
      buckets: catalogue.buckets,
      random: () => 0,
    })
    const byId = new Map<string, { offer: number | null; investor: string }>()
    for (const outcome of outcomes) {
      if (!invoiceIds.has(outcome.invoiceId)) continue
      byId.set(outcome.invoiceId, {
        offer: outcome.offer,
        investor: outcome.winnerLabel ?? "",
      })
    }
    return { detail: null as string | null, byId }
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : "The offer could not be priced.",
      byId: new Map<string, { offer: number | null; investor: string }>(),
    }
  }
}

export async function SellerOverview({
  organisationId,
  organisation,
}: {
  organisationId: string
  organisation: string
}) {
  const supabase = createServiceClient()
  const [invoicesResult, organisationsResult] = await Promise.all([
    supabase
      .from("organisation_invoices")
      .select(
        "id, document_id, obligor_organisation_id, buyer_organisation_id, face_value, currency, risk_score, due_date, sold_price, sold_date, repaid",
      )
      .eq("seller_organisation_id", organisationId),
    supabase.from("organisations").select("id, legal_name"),
  ])
  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (organisationsResult.error) throw new Error(organisationsResult.error.message)

  const names = new Map(
    (organisationsResult.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )
  const rows = invoicesResult.data ?? []
  const openIds = new Set(
    rows
      .filter((row) => !row.buyer_organisation_id && !row.repaid)
      .map((row) => row.id as string),
  )
  const offers = openIds.size === 0 ? { detail: null, byId: new Map<string, { offer: number | null; investor: string }>() } : await pricedOffers(openIds)
  const month = new Date().toISOString().slice(0, 7)
  const invoices: SellerInvoice[] = rows.map((row) => {
    const id = row.id as string
    const unsold = !row.buyer_organisation_id
    const priced = offers.byId.get(id)
    return {
      id,
      documentId: row.document_id as string,
      obligor: names.get(row.obligor_organisation_id as string) ?? "",
      faceValue: num(row.face_value),
      currency: row.currency as string,
      riskScore: num(row.risk_score),
      dueDate: dateOnly(row.due_date),
      soldPrice: optionalNum(row.sold_price),
      repaid: Boolean(row.repaid),
      unsold,
      offer: unsold && !row.repaid ? (priced?.offer ?? null) : null,
      offerInvestor: priced?.investor ?? "",
    }
  })

  const open = invoices.filter((invoice) => invoice.unsold && !invoice.repaid)
  const monthSales = rows.filter((row) => dateOnly(row.sold_date).startsWith(month) && optionalNum(row.sold_price) !== null)
  const soldCosts = rows.flatMap((row) => {
    const sold = optionalNum(row.sold_price)
    const face = num(row.face_value)
    if (sold === null || face <= 0 || !row.buyer_organisation_id) return []
    return [(face - sold) / face]
  })
  const averageCost = soldCosts.length === 0 ? 0 : soldCosts.reduce((sum, cost) => sum + cost, 0) / soldCosts.length

  const metrics = [
    {
      label: "Available to finance",
      value: moneyByCurrency(open.map((invoice) => ({ amount: invoice.faceValue, currency: invoice.currency }))),
    },
    { label: "Offers available", value: String(open.filter((invoice) => invoice.offer !== null).length) },
    {
      label: "Sold this month",
      value: moneyByCurrency(
        monthSales.map((row) => ({ amount: num(row.sold_price), currency: row.currency as string })),
      ),
    },
    { label: "Average financing cost", value: percent(averageCost) },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <div>
        <p className="text-sm text-muted">{organisation || "Seller"}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">Receivables from invoices issued by this organisation.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      {offers.detail ? <p className="mt-6 text-sm text-red-700">{offers.detail}</p> : null}
      <SellerInvoices invoices={invoices} />
    </main>
  )
}
