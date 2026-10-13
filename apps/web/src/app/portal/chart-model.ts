export type ChartRange = "1D" | "1W" | "1M" | "3M" | "ALL"
export type ChartSeriesKey = "cash" | "invoices" | "portfolio"

export type PortfolioPoint = {
  capturedAt: string
  cash: number
  invoices: number
  portfolio: number
}

export const CHART_RANGES: { id: ChartRange; label: string; ms: number | null; caption: string }[] = [
  { id: "1D", label: "1D", ms: 24 * 60 * 60 * 1000, caption: "Past day" },
  { id: "1W", label: "1W", ms: 7 * 24 * 60 * 60 * 1000, caption: "Past week" },
  { id: "1M", label: "1M", ms: 30 * 24 * 60 * 60 * 1000, caption: "Past month" },
  { id: "3M", label: "3M", ms: 90 * 24 * 60 * 60 * 1000, caption: "Past 3 months" },
  { id: "ALL", label: "ALL", ms: null, caption: "All time" },
]

export const CHART_SERIES: { key: ChartSeriesKey; label: string; color: string }[] = [
  { key: "cash", label: "Cash", color: "#737373" },
  { key: "invoices", label: "Invoices", color: "#0f766e" },
  { key: "portfolio", label: "Portfolio", color: "#171717" },
]

export function pointsInRange(series: PortfolioPoint[], range: ChartRange, now = Date.now()) {
  const spec = CHART_RANGES.find((item) => item.id === range)
  if (!spec?.ms) return series
  const start = now - spec.ms
  return series.filter((point) => Date.parse(point.capturedAt) >= start)
}

export function rangeChange(points: PortfolioPoint[]) {
  if (points.length === 0) return null
  const first = points[0]?.portfolio
  const last = points[points.length - 1]?.portfolio
  if (first === undefined || last === undefined || !Number.isFinite(first) || !Number.isFinite(last)) return null
  return {
    delta: last - first,
    percent: first === 0 ? null : ((last - first) / first) * 100,
  }
}

export function parseInvestorTab(value: string | undefined) {
  if (value === "positions" || value === "history" || value === "stats" || value === "buckets") return value
  return "buckets"
}
