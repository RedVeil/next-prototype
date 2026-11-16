import { loadUsdRate } from "@/app/match/rate"
import { sellerRounds } from "@/auction/domain"
import { readDisplayedFunds } from "@/portfolio/capture"
import { createServiceClient } from "@/lib/supabase/service"
import { MoneyGroup } from "./money-value"
import { AddInvoiceButton, AuctionDurationForm } from "./seller-controls"
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

async function sellerRlusd(supabase: ReturnType<typeof createServiceClient>, organisationId: string) {
  try {
    const wallet = await readDisplayedFunds(supabase, organisationId)
    return wallet ? wallet.available : null
  } catch {
    const snapshot = await supabase
      .from("organisation_portfolio_snapshots")
      .select("available_rlusd")
      .eq("organisation_id", organisationId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (snapshot.error) throw new Error(snapshot.error.message)
    return snapshot.data ? num(snapshot.data.available_rlusd) : 0
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
  const [organisation, invoicesResult, organisationsResult, usdRate, rlusd, rounds] = await Promise.all([
    supabase.from("organisations").select("legal_name, company_id, country, auction_duration_hours").eq("id", organisationId).maybeSingle(),
    supabase
      .from("organisation_invoices")
      .select(
        "id, document_id, obligor_organisation_id, buyer_organisation_id, face_value, currency, risk_score, origination_date, due_date, sold_price, repaid",
      )
      .eq("seller_organisation_id", organisationId),
    supabase.from("organisations").select("id, legal_name").order("legal_name"),
    loadUsdRate(),
    sellerRlusd(supabase, organisationId),
    sellerRounds(organisationId),
  ])
  if (organisation.error) throw new Error(organisation.error.message)
  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (organisationsResult.error) throw new Error(organisationsResult.error.message)

  const names = new Map(
    (organisationsResult.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )
  const rows = invoicesResult.data ?? []
  const activeAuction = new Set(["setup_pending", "open", "accepting", "submitted"])

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
      offer: null,
      auctionStatus: unsold && !row.repaid ? (rounds.get(id) ?? null) : null,
    }
  })

  const filtered = invoices.filter((invoice) => {
    if (parsed.q) {
      const haystack = `${invoice.documentId} ${invoice.obligor}`.toLowerCase()
      if (!haystack.includes(parsed.q.toLowerCase())) return false
    }
    if (parsed.sale === "sold" && invoice.unsold) return false
    if (parsed.sale === "unsold" && !invoice.unsold) return false
    const offerState = !invoice.unsold ? "accepted" : invoice.auctionStatus && activeAuction.has(invoice.auctionStatus) ? "open" : "none"
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
        <AuctionDurationForm hours={num(organisation.data?.auction_duration_hours) || 24} />
        <AddInvoiceButton
          organisations={(organisationsResult.data ?? []).map((row) => ({
            id: row.id as string,
            legalName: row.legal_name as string,
          }))}
        />
      </div>
      <section className="mt-6 max-w-sm rounded-lg border border-border bg-white p-5">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Available RLUSD</p>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
          {rlusd === null ? "—" : <MoneyGroup rows={[{ amount: rlusd, currency: "RLUSD" }]} rate={usdRate} />}
        </div>
      </section>
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
