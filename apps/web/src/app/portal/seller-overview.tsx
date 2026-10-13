import { loadCatalogue } from "@/app/match/load"
import { runMatch } from "@/app/match/match"
import { frankfurterRate, loadUsdRate } from "@/app/match/rate"
import { createServiceClient } from "@/lib/supabase/service"
import { AddInvoiceButton } from "./seller-controls"
import { SellerInvoices, type SellerInvoiceRow } from "./seller-invoices"
import { SELLER_PAGE_SIZE, parseSellerQuery, type SellerQuery } from "./seller-query"

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
    const byId = new Map<string, number | null>()
    for (const outcome of outcomes) {
      if (!invoiceIds.has(outcome.invoiceId)) continue
      byId.set(outcome.invoiceId, outcome.offer)
    }
    return { detail: null as string | null, byId }
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : "The offer could not be priced.",
      byId: new Map<string, number | null>(),
    }
  }
}

function sortValue(invoice: SellerInvoiceRow, field: SellerQuery["sort"]) {
  if (field === "number") return invoice.documentId
  if (field === "customer") return invoice.obligor
  if (field === "issued") return invoice.issued
  if (field === "amount") return invoice.faceValue
  return invoice.dueDate
}

export async function SellerOverview({
  organisationId,
  query,
}: {
  organisationId: string
  organisation: string
  query: Record<string, string | string[] | undefined>
}) {
  const parsed = parseSellerQuery(query)
  const supabase = createServiceClient()
  const [organisation, invoicesResult, organisationsResult, usdRate] = await Promise.all([
    supabase.from("organisations").select("legal_name, company_id, country").eq("id", organisationId).maybeSingle(),
    supabase
      .from("organisation_invoices")
      .select(
        "id, document_id, obligor_organisation_id, buyer_organisation_id, face_value, currency, risk_score, origination_date, due_date, sold_price, repaid",
      )
      .eq("seller_organisation_id", organisationId),
    supabase.from("organisations").select("id, legal_name").order("legal_name"),
    loadUsdRate(),
  ])
  if (organisation.error) throw new Error(organisation.error.message)
  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (organisationsResult.error) throw new Error(organisationsResult.error.message)

  const names = new Map(
    (organisationsResult.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )
  const rows = invoicesResult.data ?? []
  const openIds = new Set(
    rows.filter((row) => !row.buyer_organisation_id && !row.repaid).map((row) => row.id as string),
  )
  const offers =
    openIds.size === 0
      ? { detail: null, byId: new Map<string, number | null>() }
      : await pricedOffers(openIds)

  const invoices: SellerInvoiceRow[] = rows.map((row) => {
    const id = row.id as string
    const unsold = !row.buyer_organisation_id
    return {
      id,
      documentId: row.document_id as string,
      obligor: names.get(row.obligor_organisation_id as string) ?? "",
      faceValue: num(row.face_value),
      currency: row.currency as string,
      riskScore: num(row.risk_score),
      issued: dateOnly(row.origination_date),
      dueDate: dateOnly(row.due_date),
      soldPrice: optionalNum(row.sold_price),
      repaid: Boolean(row.repaid),
      unsold,
      offer: unsold && !row.repaid ? (offers.byId.get(id) ?? null) : null,
    }
  })

  const filtered = invoices.filter((invoice) => {
    if (parsed.q) {
      const haystack = `${invoice.documentId} ${invoice.obligor}`.toLowerCase()
      if (!haystack.includes(parsed.q.toLowerCase())) return false
    }
    if (parsed.sale === "sold" && invoice.unsold) return false
    if (parsed.sale === "unsold" && !invoice.unsold) return false
    const offerState = !invoice.unsold ? "accepted" : invoice.offer !== null ? "open" : "none"
    if (parsed.offer !== "any" && offerState !== parsed.offer) return false
    return true
  })
  filtered.sort((left, right) => {
    const a = sortValue(left, parsed.sort)
    const b = sortValue(right, parsed.sort)
    if (a === b) return 0
    const delta = a < b ? -1 : 1
    return parsed.dir === "desc" ? -delta : delta
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / SELLER_PAGE_SIZE))
  const page = Math.min(parsed.page, pageCount)
  const visible = filtered.slice((page - 1) * SELLER_PAGE_SIZE, page * SELLER_PAGE_SIZE)
  const legalName = (organisation.data?.legal_name as string) || "Seller"
  const companyId = (organisation.data?.company_id as string) || ""
  const country = (organisation.data?.country as string) || ""

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{legalName}</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Company id {companyId}. Country {country}.
          </p>
        </div>
        <AddInvoiceButton
          organisations={(organisationsResult.data ?? []).map((row) => ({
            id: row.id as string,
            legalName: row.legal_name as string,
          }))}
        />
      </div>
      {offers.detail ? <p className="mt-6 text-sm text-red-700">{offers.detail}</p> : null}
      <SellerInvoices
        invoices={visible}
        total={filtered.length}
        unfilteredTotal={invoices.length}
        query={{ ...parsed, page }}
        rate={usdRate}
      />
    </main>
  )
}
