import { loadUsdRate } from "@/app/match/rate"
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

export type InvestorDashboardData = {
  movementsReady: boolean
  legalName: string
  available: number
  reserved: number
  portfolio: number | null
  series: PortfolioPoint[]
  buckets: DashboardBucket[]
  features: { id: string; name: string }[]
  positions: DashboardPosition[]
  history: DashboardHistoryItem[]
  stats: DashboardStats
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

function addMoney(rows: Map<string, number>, currency: string, amount: number) {
  const code = currency.trim().toUpperCase() || currency
  rows.set(code, (rows.get(code) ?? 0) + amount)
}

function moneyRows(rows: Map<string, number>): MoneyRow[] {
  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }))
}

export async function loadInvestorDashboard(organisationId: string): Promise<InvestorDashboardData> {
  const supabase = createServiceClient()
  const [organisation, snapshots, bucketsResult, featuresResult, linksResult, invoicesResult, movementsResult, usdRate] =
    await Promise.all([
      supabase.from("organisations").select("legal_name, created_at").eq("id", organisationId).maybeSingle(),
      supabase
        .from("organisation_portfolio_snapshots")
        .select("captured_at, available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd")
        .eq("organisation_id", organisationId)
        .order("captured_at", { ascending: true }),
      supabase
        .from("organisation_buckets")
        .select(
          "id, name, status, risk_low, risk_high, face_min, face_max, tenor_min, tenor_max, industries, countries, currencies, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, created_at",
        )
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false }),
      supabase.from("bucket_features").select("id, name").order("name"),
      loadBucketFeatureLinks(supabase),
      supabase
        .from("organisation_invoices")
        .select(
          "id, obligor_organisation_id, buyer_bucket_id, face_value, currency, sold_price, sold_date, due_date, repayment_amount, repaid, repaid_date, created_at",
        )
        .eq("buyer_organisation_id", organisationId),
      supabase
        .from("organisation_cash_movements")
        .select("id, kind, amount, created_at")
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false }),
      loadUsdRate(),
    ])

  const failed = [organisation, snapshots, bucketsResult, featuresResult, invoicesResult].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  const movementsMissing = Boolean(movementsResult.error?.message.includes("organisation_cash_movements"))
  if (movementsResult.error && !movementsMissing) throw new Error(movementsResult.error.message)

  const bucketRows = bucketsResult.data ?? []
  const bucketIds = new Set(bucketRows.map((row) => row.id as string))
  const featuresByBucket = featureChoicesByBucket(linksResult.filter((link) => bucketIds.has(link.bucketId)))

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
  const bucketName = new Map(buckets.map((bucket) => [bucket.id, bucket.name]))

  const invoiceRows = invoicesResult.data ?? []
  const obligorIds = [...new Set(invoiceRows.map((row) => row.obligor_organisation_id as string))]
  const namesResult =
    obligorIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("organisations").select("id, legal_name").in("id", obligorIds)
  if (namesResult.error) throw new Error(namesResult.error.message)
  const obligorName = new Map((namesResult.data ?? []).map((row) => [row.id as string, row.legal_name as string]))

  const series: PortfolioPoint[] = (snapshots.data ?? []).map((row) => ({
    capturedAt: String(row.captured_at),
    cash: num(row.available_rlusd),
    invoices: num(row.outstanding_rlusd),
    portfolio: num(row.portfolio_rlusd),
  }))
  const latest = series[series.length - 1]
  const reserved = num(snapshots.data?.[snapshots.data.length - 1]?.reserved_rlusd)

  const positions: DashboardPosition[] = []
  const history: DashboardHistoryItem[] = []
  const volumeByCurrency = new Map<string, number>()
  const profitByCurrency = new Map<string, number>()
  let profit = 0
  let profitUsd = 0
  let profitConvertible = usdRate !== null
  let counted = false
  let biggest: { amount: number; currency: string; score: number } | null = null

  for (const row of invoiceRows) {
    const sold = optionalNum(row.sold_price)
    const repayment = num(row.repayment_amount)
    const obligor = obligorName.get(row.obligor_organisation_id as string) || "Invoice"
    const bucket = bucketName.get(String(row.buyer_bucket_id ?? "")) ?? "Bucket"
    const currency = row.currency as string
    if (sold !== null) addMoney(volumeByCurrency, currency, sold)
    if (!row.repaid) {
      positions.push({
        id: row.id as string,
        buyerName: obligor,
        bucketName: bucket,
        faceValue: num(row.face_value),
        currency,
        soldPrice: sold,
        dueDate: dateOnly(row.due_date),
        status: "open",
      })
    }
    history.push({
      id: `purchase:${row.id as string}`,
      type: "purchase",
      amount: sold,
      unit: currency,
      at: row.sold_date ? dateOnly(row.sold_date) : String(row.created_at ?? ""),
      status: "bought",
      detail: `${obligor} · ${bucket}`,
    })
    if (row.repaid && sold !== null) {
      const gain = repayment - sold
      profit += gain
      addMoney(profitByCurrency, currency, gain)
      counted = true
      const gainUsd = usdRate === null ? null : toRlusd(gain, currency, usdRate)
      if (gainUsd === null) profitConvertible = false
      else profitUsd += gainUsd
      const score = gainUsd ?? gain
      if (gain > 0 && (biggest === null || score > biggest.score)) biggest = { amount: gain, currency, score }
      history.push({
        id: `repayment:${row.id as string}`,
        type: "repayment",
        amount: repayment,
        unit: currency,
        at: row.repaid_date ? dateOnly(row.repaid_date) : dateOnly(row.due_date) || null,
        status: "repaid",
        detail: obligor,
      })
    }
  }

  for (const row of movementsMissing ? [] : (movementsResult.data ?? [])) {
    const kind = row.kind === "withdrawal" ? "withdrawal" : "deposit"
    history.push({
      id: `${kind}:${row.id as string}`,
      type: kind,
      amount: num(row.amount),
      unit: "RLUSD",
      at: String(row.created_at),
      status: "recorded",
      detail: kind === "deposit" ? "Deposit" : "Withdrawal",
    })
  }

  history.sort((left, right) => {
    const leftAt = left.at ? Date.parse(left.at) : 0
    const rightAt = right.at ? Date.parse(right.at) : 0
    return rightAt - leftAt
  })

  return {
    movementsReady: !movementsMissing,
    legalName: (organisation.data?.legal_name as string) || "",
    available: latest?.cash ?? 0,
    reserved,
    portfolio: latest ? latest.portfolio : null,
    series,
    buckets,
    features: (featuresResult.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string })),
    positions,
    history,
    stats: {
      profitLoss: counted ? (profitConvertible ? roundMoney(profitUsd) : profit) : null,
      profitRows: moneyRows(profitByCurrency),
      volumeRows: moneyRows(volumeByCurrency),
      positions: positions.length,
      biggestWin: biggest ? { amount: biggest.amount, currency: biggest.currency } : null,
      joined: organisation.data?.created_at ? String(organisation.data.created_at) : null,
    },
    usdRate,
  }
}
