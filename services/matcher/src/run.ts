import { calendarDate, type BucketMandate } from "@antecipa/domain"
import { db } from "./db"
import { fetchBrlUsdRate } from "./fx"
import { matchOnce, type MatcherInvoice, type OfferDraft } from "./index"

const PAGE = 1000

type InvoiceRow = {
  id: string
  company_id: string
  amount: number | string
  currency: string
  origin_country: string
  product: string
  due_date: string
  issuer_industries: string[] | null
  risk_low: number
  risk_high: number
}

type BucketRow = {
  id: string
  investor_id: string
  name: string
  status: "active" | "paused"
  risk_low: number
  risk_high: number
  industries: string[] | null
  products: string[] | null
  countries: string[] | null
  currencies: string[] | null
  criteria_mode: "and" | "or"
  apr: number | string
  exposure_kind: "flat_usd" | "portfolio_percent"
  exposure_limit_usd: number | string | null
  exposure_limit_percent: number | string | null
  exposure_used_usd: number | string | null
}

type OpenOffer = { id: string; invoice_id: string }

export type MatchRunResult = {
  candidates: number
  offers: number
  rate: number
}

export async function matchPass(now = new Date()): Promise<MatchRunResult> {
  const today = calendarDate(now)
  const invoices = await loadCandidates(today)
  const rate = await fetchBrlUsdRate()
  const buckets = await loadBuckets()
  const drafts = matchOnce({
    invoices: invoices.map((invoice) => toMatcherInvoice(invoice, rate)),
    buckets,
    nowIso: now.toISOString(),
  })
  await writeOffers(drafts, invoices.map((invoice) => invoice.id))
  return { candidates: invoices.length, offers: drafts.length, rate }
}

function toMatcherInvoice(row: InvoiceRow, rate: number): MatcherInvoice {
  const amount = Number(row.amount)
  return {
    id: row.id,
    eligibleForMatching: true,
    dueDate: row.due_date,
    amount,
    amountUsd: amount * rate,
    originCountry: row.origin_country,
    currency: row.currency,
    industry: row.issuer_industries?.[0] ?? "",
    product: row.product,
    risk: {
      low: Number(row.risk_low),
      high: Number(row.risk_high),
    },
  }
}

async function loadCandidates(today: string): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = []
  for (let from = 0; ; from += PAGE) {
    const result = await db()
      .from("invoices")
      .select("id, company_id, amount, currency, origin_country, product, due_date, issuer_industries")
      .eq("sale_status", "unsold")
      .eq("eligible_for_matching", true)
      .gte("due_date", today)
      .filter("attributes->>paid", "eq", "false")
      .filter("attributes->>received", "eq", "0")
      .range(from, from + PAGE - 1)
    if (result.error) throw new Error(result.error.message)
    const page = (result.data ?? []) as Omit<InvoiceRow, "risk_low" | "risk_high">[]
    rows.push(...page.map((row) => ({ ...row, risk_low: 0, risk_high: 0 })))
    if (page.length < PAGE) break
  }
  const ranges = await loadCompanyRanges([...new Set(rows.map((row) => row.company_id))])
  return rows
    .filter((row) => row.currency === "BRL" && ranges.has(row.company_id))
    .map((row) => {
      const range = ranges.get(row.company_id)
      return { ...row, risk_low: range?.low ?? 0, risk_high: range?.high ?? 0 }
    })
}

async function loadCompanyRanges(companyIds: string[]): Promise<Map<string, { low: number; high: number }>> {
  const ranges = new Map<string, { low: number; high: number }>()
  for (let index = 0; index < companyIds.length; index += 100) {
    const part = companyIds.slice(index, index + 100)
    if (part.length === 0) continue
    const result = await db().from("companies").select("id, risk_low, risk_high").in("id", part)
    if (result.error) throw new Error(result.error.message)
    for (const row of result.data ?? []) {
      ranges.set(String(row.id), { low: Number(row.risk_low), high: Number(row.risk_high) })
    }
  }
  return ranges
}

async function loadBuckets(): Promise<BucketMandate[]> {
  const result = await db()
    .from("buckets")
    .select(
      "id, investor_id, name, status, risk_low, risk_high, industries, products, countries, currencies, criteria_mode, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, exposure_used_usd",
    )
    .eq("status", "active")
  if (result.error) throw new Error(result.error.message)
  return ((result.data ?? []) as BucketRow[]).map(toBucket)
}

function toBucket(row: BucketRow): BucketMandate {
  return {
    id: row.id,
    investorId: row.investor_id,
    name: row.name,
    status: row.status,
    riskLow: Number(row.risk_low),
    riskHigh: Number(row.risk_high),
    industries: row.industries ?? [],
    products: row.products ?? [],
    countries: row.countries ?? [],
    currencies: row.currencies ?? [],
    criteriaMode: row.criteria_mode,
    apr: Number(row.apr),
    exposureKind: row.exposure_kind,
    exposureLimitUsd: Number(row.exposure_limit_usd ?? 0),
    exposureLimitPercent: Number(row.exposure_limit_percent ?? 0),
    exposureUsedUsd: Number(row.exposure_used_usd ?? 0),
  }
}

async function writeOffers(drafts: OfferDraft[], candidateIds: string[]) {
  const winners = new Set(drafts.map((draft) => draft.invoiceId))
  const losers = candidateIds.filter((id) => !winners.has(id))
  await closeOpen(losers)
  if (drafts.length === 0) return

  const existing = await loadOpen(drafts.map((draft) => draft.invoiceId))
  for (const draft of drafts) {
    const current = existing.get(draft.invoiceId)
    const fields = {
      bucket_id: draft.bucketId,
      investor_id: draft.investorId,
      apr: draft.apr,
      due_date: draft.dueDate,
      days: draft.days,
      price: draft.price,
      status: "open",
    }
    if (current) {
      const updated = await db().from("offers").update(fields).eq("id", current.id).eq("status", "open")
      if (updated.error) throw new Error(updated.error.message)
      continue
    }
    const inserted = await db().from("offers").insert({ invoice_id: draft.invoiceId, ...fields })
    if (inserted.error) throw new Error(inserted.error.message)
  }
}

async function closeOpen(invoiceIds: string[]) {
  for (let index = 0; index < invoiceIds.length; index += 100) {
    const part = invoiceIds.slice(index, index + 100)
    if (part.length === 0) continue
    const closed = await db().from("offers").update({ status: "closed" }).eq("status", "open").in("invoice_id", part)
    if (closed.error) throw new Error(closed.error.message)
  }
}

async function loadOpen(invoiceIds: string[]): Promise<Map<string, OpenOffer>> {
  const open = new Map<string, OpenOffer>()
  for (let index = 0; index < invoiceIds.length; index += 100) {
    const part = invoiceIds.slice(index, index + 100)
    const result = await db().from("offers").select("id, invoice_id").eq("status", "open").in("invoice_id", part)
    if (result.error) throw new Error(result.error.message)
    for (const row of (result.data ?? []) as OpenOffer[]) open.set(row.invoice_id, row)
  }
  return open
}
