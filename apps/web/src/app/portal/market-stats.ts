import { roundMoney, toRlusd } from "@/app/sandbox/settle"
import type { FeatureChoice, MarketFilter } from "./market-query"

export type MarketOrganisation = {
  id: string
  legalName: string
  companyId: string
  country: string
  description: string
  riskScore: number
  industries: string[]
  invoiceCurrencies: string[]
}

export type MarketInvoice = {
  id: string
  documentId: string
  sellerId: string
  obligorId: string
  faceValue: number
  currency: string
  riskScore: number
  originationDate: string
  dueDate: string
  repaid: boolean
  soldPrice: number | null
  soldDate: string | null
  buyerBucketId: string | null
}

export type MarketBucket = {
  id: string
  organisationId: string
  name: string
  status: string
  riskLow: number
  riskHigh: number
  industries: string[]
  countries: string[]
  currencies: string[]
  featureChoices: FeatureChoice[]
  apr: number
  exposureKind: string
  exposureLimitUsd: number | null
  exposureLimitPercent: number | null
  exposureUsedUsd: number
}

export type CurrencyFace = {
  currency: string
  sum: number
  average: number
  median: number
}

export type InvoiceStats = {
  count: number
  face: CurrencyFace[]
  usd: { sum: number; average: number | null; median: number | null } | null
  averageTenor: number | null
  medianTenor: number | null
  averageRisk: number | null
  medianRisk: number | null
}

export type ProductTotal = {
  product: string
  unit: string
  count: number
  amount: number
}

function norm(value: string) {
  return value.trim().toLowerCase()
}

function listed(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function overlaps(left: string[], right: string[]) {
  const wanted = new Set(right.map(norm).filter(Boolean))
  return listed(left).some((value) => wanted.has(norm(value)))
}

export function weightedAverage(rows: { apr: number; amount: number }[]) {
  const usable = rows.filter((row) => row.amount > 0)
  const total = usable.reduce((sum, row) => sum + row.amount, 0)
  if (total <= 0) return null
  return usable.reduce((sum, row) => sum + row.apr * row.amount, 0) / total
}

export type CapacityLevel = {
  apr: number
  amount: number
  cumulative: number
}

export function capacityLadder(rows: { apr: number; amount: number }[]): CapacityLevel[] {
  const usable = rows
    .filter((row) => Number.isFinite(row.apr) && Number.isFinite(row.amount) && row.amount > 0)
    .sort((left, right) => left.apr - right.apr)
  const levels: CapacityLevel[] = []
  for (const row of usable) {
    const previous = levels[levels.length - 1]
    if (previous && previous.apr === row.apr) {
      previous.amount += row.amount
      previous.cumulative += row.amount
      continue
    }
    levels.push({
      apr: row.apr,
      amount: row.amount,
      cumulative: (previous?.cumulative ?? 0) + row.amount,
    })
  }
  return levels
}

export type SoldDay = {
  date: string
  amount: number
}

export function saleApr(face: number, soldPrice: number, soldDate: string, dueDate: string, bucketApr: number | null) {
  if (bucketApr !== null && Number.isFinite(bucketApr)) return bucketApr
  const days = tenorDays(soldDate, dueDate)
  if (days === null || days <= 0 || face <= 0) return null
  const apr = ((face - soldPrice) * 365) / (face * days)
  return Number.isFinite(apr) ? apr : null
}

function faceUsd(face: number, currency: string, rate: number | null) {
  const code = currency.trim().toUpperCase()
  if (code === "USD" || code === "RLUSD") return roundMoney(face)
  if (rate === null) return null
  return toRlusd(face, currency, rate)
}

export function soldBooks(invoices: MarketInvoice[], bucketApr: Map<string, number>, rate: number | null) {
  const days = new Map<string, number>()
  const levels: { apr: number; amount: number }[] = []
  let skipped = 0
  for (const invoice of invoices) {
    if (invoice.soldPrice === null || !invoice.soldDate) continue
    const amount = faceUsd(invoice.faceValue, invoice.currency, rate)
    if (amount === null || amount <= 0) {
      skipped += 1
      continue
    }
    days.set(invoice.soldDate, (days.get(invoice.soldDate) ?? 0) + amount)
    const apr = saleApr(
      invoice.faceValue,
      invoice.soldPrice,
      invoice.soldDate,
      invoice.dueDate,
      invoice.buyerBucketId ? (bucketApr.get(invoice.buyerBucketId) ?? null) : null,
    )
    if (apr !== null) levels.push({ apr, amount })
  }
  return {
    days: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, amount]) => ({ date, amount })),
    levels: capacityLadder(levels),
    skipped,
  }
}

export function dueByDay(invoices: MarketInvoice[], rate: number | null) {
  const days = new Map<string, number>()
  let skipped = 0
  for (const invoice of invoices) {
    if (!invoice.dueDate) {
      skipped += 1
      continue
    }
    const amount = faceUsd(invoice.faceValue, invoice.currency, rate)
    if (amount === null || amount <= 0) {
      skipped += 1
      continue
    }
    days.set(invoice.dueDate, (days.get(invoice.dueDate) ?? 0) + amount)
  }
  return {
    days: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, amount]) => ({ date, amount })),
    skipped,
  }
}

export type RiskBar = {
  score: number
  amount: number
}

export function faceByRisk(invoices: MarketInvoice[], rate: number | null) {
  const groups = new Map<number, number>()
  let skipped = 0
  for (const invoice of invoices) {
    const amount = faceUsd(invoice.faceValue, invoice.currency, rate)
    if (amount === null || amount <= 0 || !Number.isFinite(invoice.riskScore)) {
      skipped += 1
      continue
    }
    groups.set(invoice.riskScore, (groups.get(invoice.riskScore) ?? 0) + amount)
  }
  return {
    bars: [...groups.entries()]
      .sort(([left], [right]) => left - right)
      .map(([score, amount]) => ({ score, amount })),
    skipped,
  }
}

export function weightedMedian(rows: { apr: number; amount: number }[]) {
  const usable = rows.filter((row) => row.amount > 0).sort((left, right) => left.apr - right.apr)
  const total = usable.reduce((sum, row) => sum + row.amount, 0)
  if (total <= 0) return null
  let seen = 0
  const half = total / 2
  for (const row of usable) {
    seen += row.amount
    if (seen >= half) return row.apr
  }
  return usable[usable.length - 1]?.apr ?? null
}

export function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

export function tenorDays(origin: string, due: string) {
  const start = Date.parse(`${origin.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${due.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.round((end - start) / 86_400_000)
}

function categoryPass(values: string[], selected: string[] | null) {
  if (selected === null) return true
  if (selected.length === 0) return false
  return overlaps(values, selected)
}

export function featuresPass(bucketChoices: FeatureChoice[], filter: FeatureChoice[]) {
  const modes = new Map(bucketChoices.map((choice) => [choice.id, choice.mode]))
  return filter.every((choice) => {
    if (choice.mode === "any") return true
    return (modes.get(choice.id) ?? "any") === choice.mode
  })
}

export function organisationMatches(org: MarketOrganisation, filter: MarketFilter) {
  if (!categoryPass([org.id], filter.companies)) return false
  if (!categoryPass([org.country], filter.regions)) return false
  if (filter.riskLow !== null && org.riskScore < filter.riskLow) return false
  if (filter.riskHigh !== null && org.riskScore > filter.riskHigh) return false
  if (!categoryPass(org.industries, filter.industries)) return false
  if (!categoryPass(org.invoiceCurrencies, filter.currencies)) return false
  return true
}

export function invoiceMatches(invoice: MarketInvoice, seller: MarketOrganisation | undefined, filter: MarketFilter) {
  if (!seller) return false
  if (filter.companies !== null) {
    const parties = [invoice.sellerId, invoice.obligorId]
    if (!categoryPass(parties, filter.companies)) return false
  }
  if (!categoryPass([seller.country], filter.regions)) return false
  if (!categoryPass(seller.industries, filter.industries)) return false
  if (!categoryPass([invoice.currency], filter.currencies)) return false
  if (filter.riskLow !== null && invoice.riskScore < filter.riskLow) return false
  if (filter.riskHigh !== null && invoice.riskScore > filter.riskHigh) return false
  return true
}

export function bucketOverlaps(bucket: MarketBucket, filter: MarketFilter) {
  if (bucket.status !== "active") return false
  if (filter.riskLow !== null && bucket.riskHigh < filter.riskLow) return false
  if (filter.riskHigh !== null && bucket.riskLow > filter.riskHigh) return false
  if (filter.industries !== null) {
    if (filter.industries.length === 0) return false
    if (listed(bucket.industries).length > 0 && !overlaps(bucket.industries, filter.industries)) return false
  }
  if (filter.regions !== null && !categoryPass(bucket.countries, filter.regions)) return false
  if (filter.currencies !== null && !categoryPass(bucket.currencies, filter.currencies)) return false
  if (!featuresPass(bucket.featureChoices, filter.features)) return false
  return true
}

export function remainingCapacity(bucket: MarketBucket, portfolioRlusd: number | null) {
  if (bucket.exposureKind === "flat_usd") {
    if (bucket.exposureLimitUsd === null) return null
    return bucket.exposureLimitUsd - bucket.exposureUsedUsd
  }
  if (bucket.exposureKind === "portfolio_percent") {
    if (portfolioRlusd === null || bucket.exposureLimitPercent === null) return null
    return (portfolioRlusd * bucket.exposureLimitPercent) / 100 - bucket.exposureUsedUsd
  }
  return null
}

export function invoiceStats(invoices: MarketInvoice[], rate: number | null, today: string): InvoiceStats {
  const byCurrency = new Map<string, number[]>()
  const tenors: number[] = []
  const risks: number[] = []
  const usdFaces: number[] = []
  let convertible = rate !== null
  for (const invoice of invoices) {
    const currency = invoice.currency.trim().toUpperCase() || invoice.currency
    const faces = byCurrency.get(currency) ?? []
    faces.push(invoice.faceValue)
    byCurrency.set(currency, faces)
    const tenor = tenorDays(today, invoice.dueDate)
    if (tenor !== null) tenors.push(tenor)
    risks.push(invoice.riskScore)
    const usd = rate === null ? null : toRlusd(invoice.faceValue, currency, rate)
    if (usd === null) convertible = false
    else usdFaces.push(usd)
  }
  const face = [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, values]) => ({
      currency,
      sum: values.reduce((total, value) => total + value, 0),
      average: average(values) ?? 0,
      median: median(values) ?? 0,
    }))
  return {
    count: invoices.length,
    face,
    usd: convertible
      ? {
          sum: roundMoney(usdFaces.reduce((total, value) => total + value, 0)),
          average: average(usdFaces),
          median: median(usdFaces),
        }
      : null,
    averageTenor: average(tenors),
    medianTenor: median(tenors),
    averageRisk: average(risks),
    medianRisk: median(risks),
  }
}

export function productTotals(lines: { product: string; unit: string; amount: number }[]): ProductTotal[] {
  const groups = new Map<string, ProductTotal>()
  for (const line of lines) {
    const product = line.product.trim() || "Product"
    const unit = line.unit.trim() || "unit"
    const key = `${product.toLowerCase()}::${unit.toLowerCase()}`
    const current = groups.get(key) ?? { product, unit, count: 0, amount: 0 }
    current.count += 1
    current.amount += line.amount
    groups.set(key, current)
  }
  return [...groups.values()].sort((left, right) => {
    const product = left.product.localeCompare(right.product)
    if (product !== 0) return product
    return left.unit.localeCompare(right.unit)
  })
}
