import { calendarDate } from "@antecipa/domain"
import { createClient } from "@/lib/supabase/server"

export const INVOICE_PAGE_SIZE = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ListedInvoice = {
  id: string
  number: string
  customer: string
  issued: string | null
  dueDate: string | null
  amount: number
  currency: string
  saleStatus: "unsold" | "sold"
  invoiceStatus: string
  offered: number | null
  offerStatus: "open" | "accepted" | null
  riskLow: number | null
  riskHigh: number | null
}

export type InvoiceSaleFilter = "all" | "unsold" | "sold"
export type InvoiceOfferFilter = "any" | "open" | "accepted" | "none"
export type InvoiceSort = "number" | "customer" | "issued" | "due" | "amount"
export type InvoiceSortDir = "asc" | "desc"

export type InvoiceListQuery = {
  page: number
  q: string
  sale: InvoiceSaleFilter
  offer: InvoiceOfferFilter
  sort: InvoiceSort
  dir: InvoiceSortDir
}

export type InvoiceListSearchParams = {
  page?: string
  q?: string
  sale?: string
  offer?: string
  sort?: string
  dir?: string
}

const SORT_COLUMNS: Record<InvoiceSort, string> = {
  number: "attributes->invoice_number",
  customer: "buyer_name",
  issued: "attributes->>issue_datetime",
  due: "due_date",
  amount: "amount",
}

export function parseInvoiceListQuery(params: InvoiceListSearchParams): InvoiceListQuery {
  const requested = Number(params.page)
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1
  const q = (params.q ?? "").trim().replace(/[\u0000-\u001f"]/g, "").slice(0, 100)
  const sale: InvoiceSaleFilter = params.sale === "unsold" || params.sale === "sold" ? params.sale : "all"
  const offer: InvoiceOfferFilter =
    params.offer === "open" || params.offer === "accepted" || params.offer === "none" ? params.offer : "any"
  const sort: InvoiceSort =
    params.sort === "number" || params.sort === "customer" || params.sort === "issued" || params.sort === "due" || params.sort === "amount"
      ? params.sort
      : "due"
  const dir: InvoiceSortDir = params.dir === "desc" ? "desc" : "asc"
  return { page, q, sale, offer, sort, dir }
}

export function invoiceQueryHasFilters(query: InvoiceListQuery): boolean {
  return query.q !== "" || query.sale !== "all" || query.offer !== "any"
}

export function invoiceListHref(basePath: string, query: InvoiceListQuery, patch: Partial<InvoiceListQuery> = {}): string {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  if (next.sale !== "all") params.set("sale", next.sale)
  if (next.offer !== "any") params.set("offer", next.offer)
  if (next.sort !== "due") params.set("sort", next.sort)
  if (next.dir !== "asc") params.set("dir", next.dir)
  if (next.page > 1) params.set("page", String(next.page))
  const text = params.toString()
  return text ? `${basePath}?${text}` : basePath
}

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function listVisibleInvoices(
  companyId: string,
  query: InvoiceListQuery,
): Promise<{ rows: ListedInvoice[]; total: number; unfilteredTotal: number }> {
  const today = calendarDate()
  const from = (query.page - 1) * INVOICE_PAGE_SIZE
  const supabase = await createClient()
  const offerIds = query.offer === "any" ? null : await listOfferInvoiceIds(supabase, companyId, query.offer)

  if (offerIds && offerIds.length === 0 && query.offer !== "none") {
    return { rows: [], total: 0, unfilteredTotal: await countVisibleInvoices(supabase, companyId, today) }
  }

  let request = supabase
    .from("invoices")
    .select("id, buyer_name, amount, currency, due_date, sale_status, status, attributes", { count: "exact" })
    .eq("company_id", companyId)
    .or(visibilityFilter(today, query.sale))

  const search = query.q ? searchFilter(query.q) : null
  if (search) request = request.or(search)
  if (offerIds && query.offer === "none" && offerIds.length > 0) {
    request = request.not("id", "in", `(${offerIds.join(",")})`)
  } else if (offerIds && query.offer !== "none") {
    request = request.in("id", offerIds)
  }

  const result = await request.order(SORT_COLUMNS[query.sort], { ascending: query.dir === "asc" }).range(from, from + INVOICE_PAGE_SIZE - 1)
  if (result.error) throw new Error(result.error.message)
  const invoiceRows = result.data ?? []
  const total = result.count ?? 0
  const ids = invoiceRows.map((row) => String(row.id))
  const [offers, assessments, company] = await Promise.all([
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("offers").select("invoice_id, price, status").in("invoice_id", ids).in("status", ["open", "accepted"]),
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("risk_assessments").select("invoice_id, low, high").in("invoice_id", ids).eq("is_current", true),
    supabase.from("companies").select("risk_low, risk_high").eq("id", companyId).maybeSingle(),
  ])
  if (offers.error) throw new Error(offers.error.message)
  if (assessments.error) throw new Error(assessments.error.message)
  if (company.error) throw new Error(company.error.message)

  const offerByInvoice = new Map<string, { price: number; status: "open" | "accepted" }>()
  for (const offer of offers.data ?? []) {
    const status = offer.status === "accepted" ? "accepted" : offer.status === "open" ? "open" : null
    if (!status) continue
    const current = offerByInvoice.get(String(offer.invoice_id))
    if (!current || status === "open") offerByInvoice.set(String(offer.invoice_id), { price: Number(offer.price), status })
  }
  const assessmentByInvoice = new Map<string, { low: number; high: number }>()
  for (const assessment of assessments.data ?? []) {
    assessmentByInvoice.set(String(assessment.invoice_id), { low: Number(assessment.low), high: Number(assessment.high) })
  }
  const companyRisk =
    company.data && company.data.risk_low !== null && company.data.risk_high !== null
      ? { low: Number(company.data.risk_low), high: Number(company.data.risk_high) }
      : null

  const unfilteredTotal =
    total === 0 && invoiceQueryHasFilters(query) ? await countVisibleInvoices(supabase, companyId, today) : total

  return {
    total,
    unfilteredTotal,
    rows: invoiceRows.map((row) => {
      const attributes = isRecord(row.attributes) ? row.attributes : {}
      const number = attributes.invoice_number
      const offer = offerByInvoice.get(String(row.id))
      const amount = Number(row.amount)
      const risk = assessmentByInvoice.get(String(row.id)) ?? companyRisk
      return {
        id: String(row.id),
        number: typeof number === "number" ? String(number) : "—",
        customer: String(row.buyer_name ?? ""),
        issued: typeof attributes.issue_datetime === "string" ? attributes.issue_datetime : null,
        dueDate: row.due_date ? String(row.due_date) : null,
        amount,
        currency: String(row.currency),
        saleStatus: row.sale_status === "sold" ? "sold" : "unsold",
        invoiceStatus: String(row.status ?? ""),
        offered: offer ? amount - offer.price : null,
        offerStatus: offer?.status ?? null,
        riskLow: risk?.low ?? null,
        riskHigh: risk?.high ?? null,
      }
    }),
  }
}

function visibilityFilter(today: string, sale: InvoiceSaleFilter): string {
  const unsold = `and(sale_status.eq.unsold,due_date.gte.${today},attributes->>paid.eq.false,attributes->>received.eq.0)`
  if (sale === "sold") return "sale_status.eq.sold"
  if (sale === "unsold") return unsold
  return `sale_status.eq.sold,${unsold}`
}

function searchFilter(q: string): string | null {
  const pattern = quotedIlike(q)
  if (!pattern) return null
  return `buyer_name.ilike.${pattern},attributes->>invoice_number.ilike.${pattern}`
}

function quotedIlike(value: string): string | null {
  const withoutQuotes = value.replaceAll('"', "")
  if (!withoutQuotes) return null
  const literal = withoutQuotes.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
  return `"%${literal}%"`
}

async function countVisibleInvoices(supabase: Supabase, companyId: string, today: string): Promise<number> {
  const result = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .or(visibilityFilter(today, "all"))
  if (result.error) throw new Error(result.error.message)
  return result.count ?? 0
}

async function listOfferInvoiceIds(supabase: Supabase, companyId: string, offer: Exclude<InvoiceOfferFilter, "any">): Promise<string[]> {
  const statuses = offer === "none" ? (["open", "accepted"] as const) : ([offer] as const)
  const ids = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("offers")
      .select("invoice_id, invoices!inner(company_id)")
      .eq("invoices.company_id", companyId)
      .in("status", [...statuses])
      .range(from, from + pageSize - 1)
    if (result.error) throw new Error(result.error.message)
    const rows = result.data ?? []
    for (const row of rows) {
      const id = String(row.invoice_id)
      if (UUID.test(id)) ids.add(id)
    }
    if (rows.length < pageSize) break
  }
  return [...ids]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
