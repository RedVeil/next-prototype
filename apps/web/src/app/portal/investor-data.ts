import { loadUsdRate } from "@/app/match/rate"
import { readDisplayedFunds } from "@/portfolio/capture"
import type { FeatureChoice } from "./market-query"
import { roundMoney, toRlusd } from "@/app/sandbox/settle"
import { featureChoicesByBucket, loadBucketFeatureLinks } from "@/lib/bucket-features"
import { createServiceClient } from "@/lib/supabase/service"
import type { PortfolioPoint } from "./chart-model"
import type { MoneyRow } from "./money-value"

export type DashboardBucket = {
  id: string
  name: string
  status: string
  riskLow: number
  riskHigh: number
  faceMin: number
  faceMax: number
  tenorMin: number | null
  tenorMax: number | null
  industries: string[]
  countries: string[]
  currencies: string[]
  apr: number
  exposureKind: string
  exposureLimitUsd: number | null
  exposureLimitPercent: number | null
  featureChoices: FeatureChoice[]
}

export type DashboardFeature = {
  id: string
  name: string
}

export type DashboardPosition = {
  id: string
  buyerName: string
  bucketName: string
  faceValue: number
  currency: string
  soldPrice: number | null
  dueDate: string
  status: string
}

export type DashboardHistoryItem = {
  id: string
  type: "deposit" | "withdrawal" | "purchase" | "repayment"
  amount: number | null
  unit: string
  at: string | null
  status: string
  detail: string
}

export type DashboardStats = {
  profitLoss: number | null
  profitRows: MoneyRow[]
  volumeRows: MoneyRow[]
  positions: number
  biggestWin: MoneyRow | null
  joined: string | null
}

export type InvestorShell = {
  movementsReady: boolean
  legalName: string
  available: number
  reserved: number
  portfolio: number | null
  series: PortfolioPoint[]
  usdRate: number | null
}

export type InvestorBuckets = {
  buckets: DashboardBucket[]
  features: DashboardFeature[]
}

type ServiceClient = ReturnType<typeof createServiceClient>

type InvoiceRow = {
  id: unknown
  obligor_organisation_id: unknown
  buyer_bucket_id: unknown
  face_value: unknown
  currency: unknown
  sold_price: unknown
  sold_date: unknown
  due_date: unknown
  repayment_amount: unknown
  repaid: unknown
  repaid_date: unknown
  created_at: unknown
}

type MovementRow = {
  id: unknown
  kind: unknown
  amount: unknown
  created_at: unknown
  invoice_id: unknown
}

const invoiceColumns =
  "id, obligor_organisation_id, buyer_bucket_id, face_value, currency, sold_price, sold_date, due_date, repayment_amount, repaid, repaid_date, created_at"

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

function addMoney(rows: Map<string, number>, currency: string, amount: number) {
  const code = currency.trim().toUpperCase() || currency
  rows.set(code, (rows.get(code) ?? 0) + amount)
}

function moneyRows(rows: Map<string, number>): MoneyRow[] {
  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }))
}

function movementsMissing(message: string | undefined) {
  return Boolean(message?.includes("organisation_cash_movements"))
}

async function loadInvoices(supabase: ServiceClient, organisationId: string, repaid?: boolean) {
  let query = supabase.from("organisation_invoices").select(invoiceColumns).eq("buyer_organisation_id", organisationId)
  if (repaid !== undefined) query = query.eq("repaid", repaid)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as InvoiceRow[]
}

async function loadMovements(supabase: ServiceClient, organisationId: string) {
  const result = await supabase
    .from("organisation_cash_movements")
    .select("id, kind, amount, created_at, invoice_id")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
  if (result.error && !movementsMissing(result.error.message)) throw new Error(result.error.message)
  return movementsMissing(result.error?.message) ? [] : ((result.data ?? []) as MovementRow[])
}

async function obligorNames(supabase: ServiceClient, rows: InvoiceRow[]) {
  const ids = [...new Set(rows.map((row) => String(row.obligor_organisation_id)))]
  if (ids.length === 0) return new Map<string, string>()
  const result = await supabase.from("organisations").select("id, legal_name").in("id", ids)
  if (result.error) throw new Error(result.error.message)
  return new Map((result.data ?? []).map((row) => [row.id as string, row.legal_name as string]))
}

async function bucketNames(supabase: ServiceClient, organisationId: string, rows: InvoiceRow[]) {
  const ids = [...new Set(rows.map((row) => String(row.buyer_bucket_id ?? "")).filter((id) => id.length > 0))]
  if (ids.length === 0) return new Map<string, string>()
  const result = await supabase
    .from("organisation_buckets")
    .select("id, name")
    .eq("organisation_id", organisationId)
    .in("id", ids)
  if (result.error) throw new Error(result.error.message)
  return new Map((result.data ?? []).map((row) => [row.id as string, row.name as string]))
}

function invoiceLabels(row: InvoiceRow, obligorName: Map<string, string>, bucketName: Map<string, string>) {
  const obligor = obligorName.get(String(row.obligor_organisation_id)) || "Invoice"
  const bucket = bucketName.get(String(row.buyer_bucket_id ?? "")) ?? "Bucket"
  return { obligor, bucket, currency: String(row.currency) }
}

function positionsFrom(rows: InvoiceRow[], obligorName: Map<string, string>, bucketName: Map<string, string>) {
  const positions: DashboardPosition[] = []
  for (const row of rows) {
    if (row.repaid) continue
    const { obligor, bucket, currency } = invoiceLabels(row, obligorName, bucketName)
    positions.push({
      id: String(row.id),
      buyerName: obligor,
      bucketName: bucket,
      faceValue: num(row.face_value),
      currency,
      soldPrice: optionalNum(row.sold_price),
      dueDate: dateOnly(row.due_date),
      status: "open",
    })
  }
  return positions
}

function historyFrom(
  rows: InvoiceRow[],
  obligorName: Map<string, string>,
  bucketName: Map<string, string>,
  movementRows: MovementRow[],
) {
  const history: DashboardHistoryItem[] = []
  const repaymentInvoices = new Set(
    movementRows
      .filter((row) => row.kind === "repayment" && typeof row.invoice_id === "string")
      .map((row) => row.invoice_id as string),
  )
  const obligorByInvoice = new Map<string, string>()

  for (const row of rows) {
    const sold = optionalNum(row.sold_price)
    const { obligor, bucket, currency } = invoiceLabels(row, obligorName, bucketName)
    obligorByInvoice.set(String(row.id), obligor)
    history.push({
      id: `purchase:${String(row.id)}`,
      type: "purchase",
      amount: sold,
      unit: currency,
      at: row.sold_date ? dateOnly(row.sold_date) : String(row.created_at ?? ""),
      status: "bought",
      detail: `${obligor} · ${bucket}`,
    })
    if (row.repaid && sold !== null && !repaymentInvoices.has(String(row.id))) {
      history.push({
        id: `repayment:${String(row.id)}`,
        type: "repayment",
        amount: num(row.repayment_amount),
        unit: currency,
        at: row.repaid_date ? dateOnly(row.repaid_date) : dateOnly(row.due_date) || null,
        status: "repaid",
        detail: obligor,
      })
    }
  }

  for (const row of movementRows) {
    const kind = row.kind === "withdrawal" ? "withdrawal" : row.kind === "repayment" ? "repayment" : "deposit"
    const invoiceId = typeof row.invoice_id === "string" ? row.invoice_id : ""
    history.push({
      id: `${kind}:${String(row.id)}`,
      type: kind,
      amount: num(row.amount),
      unit: "RLUSD",
      at: String(row.created_at),
      status: kind === "repayment" ? "repaid" : "recorded",
      detail:
        kind === "repayment"
          ? obligorByInvoice.get(invoiceId) || "Repayment"
          : kind === "deposit"
            ? "Deposit"
            : "Withdrawal",
    })
  }

  history.sort((left, right) => {
    const leftAt = left.at ? Date.parse(left.at) : 0
    const rightAt = right.at ? Date.parse(right.at) : 0
    return rightAt - leftAt
  })
  return history
}

function statsFrom(rows: InvoiceRow[], usdRate: number | null, joined: string | null): DashboardStats {
  const volumeByCurrency = new Map<string, number>()
  const profitByCurrency = new Map<string, number>()
  let profit = 0
  let profitUsd = 0
  let profitConvertible = usdRate !== null
  let counted = false
  let openPositions = 0
  let biggest: { amount: number; currency: string; score: number } | null = null

  for (const row of rows) {
    const sold = optionalNum(row.sold_price)
    const currency = String(row.currency)
    if (sold !== null) addMoney(volumeByCurrency, currency, sold)
    if (!row.repaid) openPositions += 1
    if (row.repaid && sold !== null) {
      const gain = num(row.repayment_amount) - sold
      profit += gain
      addMoney(profitByCurrency, currency, gain)
      counted = true
      const gainUsd = usdRate === null ? null : toRlusd(gain, currency, usdRate)
      if (gainUsd === null) profitConvertible = false
      else profitUsd += gainUsd
      const score = gainUsd ?? gain
      if (gain > 0 && (biggest === null || score > biggest.score)) biggest = { amount: gain, currency, score }
    }
  }

  return {
    profitLoss: counted ? (profitConvertible ? roundMoney(profitUsd) : profit) : null,
    profitRows: moneyRows(profitByCurrency),
    volumeRows: moneyRows(volumeByCurrency),
    positions: openPositions,
    biggestWin: biggest ? { amount: biggest.amount, currency: biggest.currency } : null,
    joined,
  }
}

export async function loadInvestorShell(organisationId: string): Promise<InvestorShell> {
  const supabase = createServiceClient()
  let wallet: { available: number; reserved: number } | null = null
  try {
    wallet = await readDisplayedFunds(supabase, organisationId)
  } catch {
    wallet = null
  }
  const [organisation, snapshots, movementsResult, usdRate] = await Promise.all([
    supabase.from("organisations").select("legal_name").eq("id", organisationId).maybeSingle(),
    supabase
      .from("organisation_portfolio_snapshots")
      .select("captured_at, available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd")
      .eq("organisation_id", organisationId)
      .order("captured_at", { ascending: true }),
    supabase.from("organisation_cash_movements").select("id").eq("organisation_id", organisationId).limit(1),
    loadUsdRate(),
  ])

  const failed = [organisation, snapshots].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  if (movementsResult.error && !movementsMissing(movementsResult.error.message)) {
    throw new Error(movementsResult.error.message)
  }

  const series: PortfolioPoint[] = (snapshots.data ?? []).map((row) => ({
    capturedAt: String(row.captured_at),
    cash: num(row.available_rlusd),
    invoices: num(row.outstanding_rlusd),
    portfolio: num(row.portfolio_rlusd),
  }))
  const latest = series[series.length - 1]
  const reserved = num(snapshots.data?.[snapshots.data.length - 1]?.reserved_rlusd)

  return {
    movementsReady: !movementsMissing(movementsResult.error?.message),
    legalName: (organisation.data?.legal_name as string) || "",
    available: wallet?.available ?? latest?.cash ?? 0,
    reserved: wallet?.reserved ?? reserved,
    portfolio: latest ? latest.portfolio : null,
    series,
    usdRate,
  }
}

export async function loadInvestorBuckets(organisationId: string): Promise<InvestorBuckets> {
  const supabase = createServiceClient()
  const [bucketsResult, featuresResult] = await Promise.all([
    supabase
      .from("organisation_buckets")
      .select(
        "id, name, status, risk_low, risk_high, face_min, face_max, tenor_min, tenor_max, industries, countries, currencies, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, created_at",
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false }),
    supabase.from("bucket_features").select("id, name").order("name"),
  ])
  const failed = [bucketsResult, featuresResult].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const bucketRows = bucketsResult.data ?? []
  const links = await loadBucketFeatureLinks(
    supabase,
    bucketRows.map((row) => row.id as string),
  )
  const featuresByBucket = featureChoicesByBucket(links)
  const buckets: DashboardBucket[] = bucketRows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    status: row.status as string,
    riskLow: num(row.risk_low),
    riskHigh: num(row.risk_high),
    faceMin: num(row.face_min),
    faceMax: num(row.face_max),
    tenorMin: optionalNum(row.tenor_min),
    tenorMax: optionalNum(row.tenor_max),
    industries: textList(row.industries),
    countries: textList(row.countries),
    currencies: textList(row.currencies),
    apr: num(row.apr),
    exposureKind: row.exposure_kind as string,
    exposureLimitUsd: optionalNum(row.exposure_limit_usd),
    exposureLimitPercent: optionalNum(row.exposure_limit_percent),
    featureChoices: featuresByBucket.get(row.id as string) ?? [],
  }))

  return {
    buckets,
    features: (featuresResult.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string })),
  }
}

export async function loadInvestorPositions(organisationId: string): Promise<DashboardPosition[]> {
  const supabase = createServiceClient()
  const rows = await loadInvoices(supabase, organisationId, false)
  const [obligors, buckets] = await Promise.all([
    obligorNames(supabase, rows),
    bucketNames(supabase, organisationId, rows),
  ])
  return positionsFrom(rows, obligors, buckets)
}

export async function loadInvestorHistory(organisationId: string): Promise<DashboardHistoryItem[]> {
  const supabase = createServiceClient()
  const [rows, movements] = await Promise.all([
    loadInvoices(supabase, organisationId),
    loadMovements(supabase, organisationId),
  ])
  const [obligors, buckets] = await Promise.all([
    obligorNames(supabase, rows),
    bucketNames(supabase, organisationId, rows),
  ])
  return historyFrom(rows, obligors, buckets, movements)
}

export async function loadInvestorStats(organisationId: string): Promise<DashboardStats> {
  const supabase = createServiceClient()
  const [organisation, rows, usdRate] = await Promise.all([
    supabase.from("organisations").select("created_at").eq("id", organisationId).maybeSingle(),
    loadInvoices(supabase, organisationId),
    loadUsdRate(),
  ])
  if (organisation.error) throw new Error(organisation.error.message)
  const joined = organisation.data?.created_at ? String(organisation.data.created_at) : null
  return statsFrom(rows, usdRate, joined)
}
