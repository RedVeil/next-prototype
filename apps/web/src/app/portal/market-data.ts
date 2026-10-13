import { loadUsdRate } from "@/app/match/rate"
import { featureChoicesByBucket, loadBucketFeatureLinks } from "@/lib/bucket-features"
import { createServiceClient } from "@/lib/supabase/service"
import {
  activeSelection,
  companySelection,
  constraint,
  featureSelection,
  type FeatureChoice,
  type MarketFilter,
  type MarketQuery,
} from "./market-query"
import {
  bucketOverlaps,
  invoiceMatches,
  invoiceStats,
  organisationMatches,
  productTotals,
  remainingCapacity,
  tenorDays,
  type InvoiceStats,
  type MarketBucket,
  type MarketInvoice,
  type MarketOrganisation,
  type ProductTotal,
} from "./market-stats"

export type MarketBucketRow = {
  id: string
  apr: number
  remainingUsd: number | null
}

export type MarketCompanyOption = {
  id: string
  legalName: string
  companyId: string
}

export type MarketData = {
  regions: string[]
  currencies: string[]
  industries: string[]
  companyOptions: MarketCompanyOption[]
  checkedRegions: string[]
  checkedCurrencies: string[]
  checkedIndustries: string[]
  checkedCompanies: string[]
  features: { id: string; name: string }[]
  featureChoices: FeatureChoice[]
  companies: MarketOrganisation[]
  invoices: InvoiceStats
  buckets: MarketBucketRow[]
  capacityUsd: number | null
  unpricedBuckets: number
  usdRate: number | null
}

export type CompanyInvoiceRow = {
  id: string
  documentId: string
  counterparty: string
  faceValue: number
  currency: string
  riskScore: number
  tenorDays: number | null
  dueDate: string
  repaid: boolean
}

export type CompanyRole = {
  stats: InvoiceStats
  invoices: CompanyInvoiceRow[]
  products: ProductTotal[]
}

export type CompanyProfile = {
  organisation: MarketOrganisation
  seller: CompanyRole
  obligor: CompanyRole
  usdRate: number | null
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function dateOnly(value: unknown) {
  return String(value ?? "").slice(0, 10)
}

function sortedUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  )
}

type Loaded = {
  organisations: MarketOrganisation[]
  investorIds: Set<string>
  sellerIds: Set<string>
  industryNames: string[]
  invoices: MarketInvoice[]
  buckets: MarketBucket[]
  portfolios: Map<string, number>
  features: { id: string; name: string }[]
}

async function loadRows(): Promise<Loaded> {
  const supabase = createServiceClient()
  const [organisations, industries, links, currencies, members, roles, invoices, buckets, snapshots, featureRows, featureLinks] =
    await Promise.all([
    supabase.from("organisations").select("id, legal_name, company_id, country, description, risk_score"),
    supabase.from("industries").select("id, name"),
    supabase.from("organisation_industries").select("organisation_id, industry_id"),
    supabase.from("organisation_currencies").select("organisation_id, currency, use"),
    supabase.from("organisation_members").select("id, organisation_id"),
    supabase.from("membership_roles").select("member_id, role"),
    supabase
      .from("organisation_invoices")
      .select(
        "id, document_id, seller_organisation_id, obligor_organisation_id, face_value, currency, risk_score, origination_date, due_date, repaid",
      ),
    supabase
      .from("organisation_buckets")
      .select(
        "id, organisation_id, name, status, risk_low, risk_high, industries, countries, currencies, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, exposure_used_usd",
      ),
    supabase
      .from("organisation_portfolio_snapshots")
      .select("organisation_id, captured_at, portfolio_rlusd")
      .order("captured_at", { ascending: false }),
    supabase.from("bucket_features").select("id, name").order("name"),
    loadBucketFeatureLinks(supabase),
  ])

  const failed = [organisations, industries, links, currencies, members, roles, invoices, buckets, snapshots, featureRows].find(
    (result) => result.error,
  )
  if (failed?.error) throw new Error(failed.error.message)

  const industryName = new Map((industries.data ?? []).map((row) => [row.id as string, row.name as string]))
  const industriesByOrg = new Map<string, string[]>()
  for (const link of links.data ?? []) {
    const name = industryName.get(link.industry_id as string)
    if (!name) continue
    const list = industriesByOrg.get(link.organisation_id as string) ?? []
    list.push(name)
    industriesByOrg.set(link.organisation_id as string, list)
  }
  const currenciesByOrg = new Map<string, string[]>()
  for (const row of currencies.data ?? []) {
    if (row.use !== "invoices") continue
    const list = currenciesByOrg.get(row.organisation_id as string) ?? []
    list.push(String(row.currency))
    currenciesByOrg.set(row.organisation_id as string, list)
  }

  const organisationRows: MarketOrganisation[] = (organisations.data ?? []).map((row) => ({
    id: row.id as string,
    legalName: row.legal_name as string,
    companyId: row.company_id as string,
    country: row.country as string,
    description: (row.description as string) || "",
    riskScore: num(row.risk_score),
    industries: sortedUnique(industriesByOrg.get(row.id as string) ?? []),
    invoiceCurrencies: sortedUnique((currenciesByOrg.get(row.id as string) ?? []).map((code) => code.toUpperCase())),
  }))

  const invoiceRows: MarketInvoice[] = (invoices.data ?? []).map((row) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    sellerId: row.seller_organisation_id as string,
    obligorId: row.obligor_organisation_id as string,
    faceValue: num(row.face_value),
    currency: String(row.currency),
    riskScore: num(row.risk_score),
    originationDate: dateOnly(row.origination_date),
    dueDate: dateOnly(row.due_date),
    repaid: Boolean(row.repaid),
  }))

  const featureChoices = featureChoicesByBucket(featureLinks)

  const bucketRows: MarketBucket[] = (buckets.data ?? []).map((row) => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    name: row.name as string,
    status: row.status as string,
    riskLow: num(row.risk_low),
    riskHigh: num(row.risk_high),
    industries: textList(row.industries),
    countries: textList(row.countries),
    currencies: textList(row.currencies),
    featureChoices: featureChoices.get(row.id as string) ?? [],
    apr: num(row.apr),
    exposureKind: row.exposure_kind as string,
    exposureLimitUsd: optionalNum(row.exposure_limit_usd),
    exposureLimitPercent: optionalNum(row.exposure_limit_percent),
    exposureUsedUsd: num(row.exposure_used_usd),
  }))

  const portfolios = new Map<string, number>()
  for (const row of snapshots.data ?? []) {
    const id = row.organisation_id as string
    if (portfolios.has(id)) continue
    portfolios.set(id, num(row.portfolio_rlusd))
  }

  const investorMembers = new Set<string>()
  const sellerMembers = new Set<string>()
  for (const row of roles.data ?? []) {
    if (row.role === "investor") investorMembers.add(row.member_id as string)
    if (row.role === "seller") sellerMembers.add(row.member_id as string)
  }
  const investorIds = new Set<string>()
  const sellerIds = new Set<string>()
  for (const member of members.data ?? []) {
    const organisationId = member.organisation_id as string
    if (investorMembers.has(member.id as string)) investorIds.add(organisationId)
    if (sellerMembers.has(member.id as string)) sellerIds.add(organisationId)
  }

  return {
    organisations: organisationRows,
    investorIds,
    sellerIds,
    industryNames: sortedUnique((industries.data ?? []).map((row) => String(row.name))),
    invoices: invoiceRows,
    buckets: bucketRows,
    portfolios,
    features: (featureRows.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string })),
  }
}

async function loadLines(invoiceIds: string[]) {
  const lines = new Map<string, { product: string; unit: string; amount: number }[]>()
  if (invoiceIds.length === 0) return lines
  const supabase = createServiceClient()
  const lineResult = await supabase
    .from("organisation_invoice_lines")
    .select("invoice_id, product, amount, unit")
    .in("invoice_id", invoiceIds)
  if (lineResult.error) throw new Error(lineResult.error.message)
  for (const row of lineResult.data ?? []) {
    const list = lines.get(row.invoice_id as string) ?? []
    list.push({ product: String(row.product), unit: String(row.unit), amount: num(row.amount) })
    lines.set(row.invoice_id as string, list)
  }
  return lines
}

function invoiceCurrencies(invoices: MarketInvoice[]) {
  return invoices.map((invoice) => invoice.currency.trim().toUpperCase()).filter(Boolean)
}

function includeCompany(id: string, investorIds: Set<string>, sellerIds: Set<string>) {
  return !investorIds.has(id) || sellerIds.has(id)
}

function marketFilter(
  query: MarketQuery,
  regions: string[],
  currencies: string[],
  industries: string[],
  companies: string[],
  features: FeatureChoice[],
): MarketFilter {
  return {
    regions: constraint(regions, activeSelection(query.applied, regions, query.regions)),
    currencies: constraint(currencies, activeSelection(query.applied, currencies, query.currencies)),
    industries: constraint(industries, activeSelection(query.applied, industries, query.industries)),
    companies: constraint(companies, companySelection(query.companyScope, companies, query.companies)),
    features,
    riskLow: query.riskLow,
    riskHigh: query.riskHigh,
  }
}

export async function loadMarket(query: MarketQuery): Promise<MarketData> {
  const [loaded, usdRate] = await Promise.all([loadRows(), loadUsdRate()])
  const regions = sortedUnique(loaded.organisations.map((org) => org.country))
  const currencies = sortedUnique([
    ...loaded.organisations.flatMap((org) => org.invoiceCurrencies),
    ...invoiceCurrencies(loaded.invoices),
  ])
  const industries = loaded.industryNames
  const companyOptions = loaded.organisations
    .filter((org) => includeCompany(org.id, loaded.investorIds, loaded.sellerIds))
    .map((org) => ({ id: org.id, legalName: org.legalName, companyId: org.companyId }))
    .sort((left, right) => left.legalName.localeCompare(right.legalName))
  const companyIds = companyOptions.map((company) => company.id)
  const featureChoices = featureSelection(
    loaded.features.map((feature) => feature.id),
    query.features,
  )
  const filter = marketFilter(query, regions, currencies, industries, companyIds, featureChoices)
  const byId = new Map(loaded.organisations.map((org) => [org.id, org]))
  const matchedInvoices = loaded.invoices.filter((invoice) => invoiceMatches(invoice, byId.get(invoice.sellerId), filter))
  const bucketRows = loaded.buckets
    .filter((bucket) => bucketOverlaps(bucket, filter))
    .map((bucket) => ({
      id: bucket.id,
      apr: bucket.apr,
      remainingUsd: remainingCapacity(bucket, loaded.portfolios.get(bucket.organisationId) ?? null),
    }))
  const priced = bucketRows.filter((bucket) => bucket.remainingUsd !== null)
  const companies = loaded.organisations
    .filter((org) => includeCompany(org.id, loaded.investorIds, loaded.sellerIds) && organisationMatches(org, filter))
    .sort((left, right) => left.legalName.localeCompare(right.legalName))

  return {
    regions,
    currencies,
    industries,
    companyOptions,
    checkedRegions: activeSelection(query.applied, regions, query.regions),
    checkedCurrencies: activeSelection(query.applied, currencies, query.currencies),
    checkedIndustries: activeSelection(query.applied, industries, query.industries),
    checkedCompanies: companySelection(query.companyScope, companyIds, query.companies),
    features: loaded.features,
    featureChoices,
    companies,
    invoices: invoiceStats(matchedInvoices, usdRate),
    buckets: bucketRows,
    capacityUsd: priced.length === 0 ? null : priced.reduce((sum, bucket) => sum + (bucket.remainingUsd ?? 0), 0),
    unpricedBuckets: bucketRows.length - priced.length,
    usdRate,
  }
}

function roleInvoices(
  invoices: MarketInvoice[],
  lines: Map<string, { product: string; unit: string; amount: number }[]>,
  names: Map<string, string>,
  counterpartyId: (invoice: MarketInvoice) => string,
  rate: number | null,
): CompanyRole {
  const rows = [...invoices].sort((left, right) => right.dueDate.localeCompare(left.dueDate) || left.documentId.localeCompare(right.documentId))
  return {
    stats: invoiceStats(rows, rate),
    invoices: rows.map((invoice) => ({
      id: invoice.id,
      documentId: invoice.documentId,
      counterparty: names.get(counterpartyId(invoice)) || "Company",
      faceValue: invoice.faceValue,
      currency: invoice.currency,
      riskScore: invoice.riskScore,
      tenorDays: tenorDays(invoice.originationDate, invoice.dueDate),
      dueDate: invoice.dueDate,
      repaid: invoice.repaid,
    })),
    products: productTotals(rows.flatMap((invoice) => lines.get(invoice.id) ?? [])),
  }
}

export async function loadCompanyProfile(id: string): Promise<CompanyProfile | null> {
  const [loaded, usdRate] = await Promise.all([loadRows(), loadUsdRate()])
  const organisation = loaded.organisations.find((org) => org.id === id)
  if (!organisation) return null
  const names = new Map(loaded.organisations.map((org) => [org.id, org.legalName]))
  const related = loaded.invoices.filter((invoice) => invoice.sellerId === id || invoice.obligorId === id)
  const lines = await loadLines(related.map((invoice) => invoice.id))
  return {
    organisation,
    usdRate,
    seller: roleInvoices(
      related.filter((invoice) => invoice.sellerId === id),
      lines,
      names,
      (invoice) => invoice.obligorId,
      usdRate,
    ),
    obligor: roleInvoices(
      related.filter((invoice) => invoice.obligorId === id),
      lines,
      names,
      (invoice) => invoice.sellerId,
      usdRate,
    ),
  }
}
