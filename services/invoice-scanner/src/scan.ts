import { calendarDate, passesCompanyFilter, type CompanyInvoiceFilter, type RiskRange } from "@antecipa/domain"
import { db } from "./db"
import { requireEnv } from "./env"
import { fetchTauriInvoices, hasPayment, receivedAmount, tauriDocumentId, type TauriInvoice } from "./tauri"

export const TAURI_COMPANY_PROFILE_ID = "05525fac-1394-4a73-a502-6102d050045c"
const PRODUCT = "agricultural products"
const PAGE = 1000

type Company = {
  id: string
  profile_id: string | null
  country: string
  industries: string[]
  business_description: string
  risk_low: number
  risk_high: number
}

type StoredInvoice = {
  id: string
  document_id: string
  sale_status: string
  attributes: Record<string, unknown> | null
}

export type ScanResult = {
  inserted: number
  markedPaid: number
}

export async function scanOnce(now = new Date()): Promise<ScanResult> {
  const today = calendarDate(now)
  const companies = await loadCompanies()
  let inserted = 0
  let markedPaid = 0
  for (const company of companies) {
    if (company.profile_id !== TAURI_COMPANY_PROFILE_ID) continue
    const result = await scanTauri(company, today)
    inserted += result.inserted
    markedPaid += result.markedPaid
  }
  return { inserted, markedPaid }
}

async function scanTauri(company: Company, today: string): Promise<ScanResult> {
  const invoices = await fetchTauriInvoices(requireEnv("TAURI_API_KEY"))
  const existing = await loadStored(company.id)
  const filter = await loadFilter(company.id)
  const range: RiskRange = { low: Number(company.risk_low), high: Number(company.risk_high) }
  const rows: Record<string, unknown>[] = []
  let markedPaid = 0

  for (const invoice of invoices) {
    const documentId = tauriDocumentId(invoice.invoice_id)
    const stored = existing.get(documentId)
    const received = receivedAmount(invoice)
    if (stored) {
      if (stored.sale_status === "unsold" && hasPayment(invoice) && stored.attributes?.paid !== true) {
        await markPaid(stored, received)
        markedPaid += 1
      }
      continue
    }
    if (hasPayment(invoice) || invoice.due_date < today) continue
    const eligible = passesCompanyFilter(
      { buyerTaxId: invoice.customer_name, product: PRODUCT, riskAssessment: null },
      range,
      filter,
    )
    rows.push(insertRow(company, invoice, received, eligible))
  }

  await insertRows(rows)
  return { inserted: rows.length, markedPaid }
}

function insertRow(company: Company, invoice: TauriInvoice, received: number, eligible: boolean) {
  return {
    company_id: company.id,
    document_id: tauriDocumentId(invoice.invoice_id),
    origin_country: company.country,
    currency: "BRL",
    amount: invoice.invoice_amount,
    product: PRODUCT,
    due_date: invoice.due_date,
    buyer_name: invoice.customer_name,
    buyer_tax_id: invoice.customer_name,
    issuer_industries: company.industries ?? [],
    issuer_business_description: company.business_description ?? "",
    eligible_for_matching: eligible,
    sale_status: "unsold",
    status: "submitted",
    attributes: {
      source: "tauri",
      paid: false,
      received,
      invoice_number: invoice.invoice_number,
      issue_datetime: invoice.issue_datetime,
    },
  }
}

async function markPaid(stored: StoredInvoice, received: number) {
  const attributes = { ...(stored.attributes ?? {}), source: "tauri", paid: true, received }
  const updated = await db()
    .from("invoices")
    .update({ attributes, eligible_for_matching: false })
    .eq("id", stored.id)
    .eq("sale_status", "unsold")
  if (updated.error) throw new Error(updated.error.message)
}

async function insertRows(rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const part = rows.slice(index, index + 200)
    const inserted = await db().from("invoices").insert(part)
    if (inserted.error) throw new Error(inserted.error.message)
  }
}

async function loadCompanies(): Promise<Company[]> {
  const result = await db()
    .from("companies")
    .select("id, profile_id, country, industries, business_description, risk_low, risk_high")
    .eq("application_status", "accepted")
    .eq("access_status", "allowed")
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as Company[]
}

async function loadFilter(companyId: string): Promise<CompanyInvoiceFilter | null> {
  const result = await db()
    .from("company_invoice_filters")
    .select("customer_tax_ids, products, risk_low, risk_high")
    .eq("company_id", companyId)
    .maybeSingle()
  if (result.error) throw new Error(result.error.message)
  if (!result.data) return null
  return {
    customerTaxIds: result.data.customer_tax_ids ?? [],
    products: result.data.products ?? [],
    riskLow: result.data.risk_low === null ? null : Number(result.data.risk_low),
    riskHigh: result.data.risk_high === null ? null : Number(result.data.risk_high),
  }
}

async function loadStored(companyId: string): Promise<Map<string, StoredInvoice>> {
  const stored = new Map<string, StoredInvoice>()
  for (let from = 0; ; from += PAGE) {
    const result = await db()
      .from("invoices")
      .select("id, document_id, sale_status, attributes")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1)
    if (result.error) throw new Error(result.error.message)
    const rows = (result.data ?? []) as StoredInvoice[]
    for (const row of rows) stored.set(row.document_id, row)
    if (rows.length < PAGE) break
  }
  return stored
}
