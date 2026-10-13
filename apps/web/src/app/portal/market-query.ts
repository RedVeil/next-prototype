export type FeatureMode = "any" | "yes" | "no"

export type FeatureChoice = {
  id: string
  mode: FeatureMode
}

export type MarketQuery = {
  applied: boolean
  regions: string[]
  currencies: string[]
  industries: string[]
  companies: string[]
  features: FeatureChoice[]
  companyScope: string
  riskLow: number | null
  riskHigh: number | null
}

export type MarketFilter = {
  regions: string[] | null
  currencies: string[] | null
  industries: string[] | null
  companies: string[] | null
  features: FeatureChoice[]
  riskLow: number | null
  riskHigh: number | null
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

function many(value: string | string[] | undefined) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))]
}

function featureChoices(value: string | string[] | undefined): FeatureChoice[] {
  const byId = new Map<string, FeatureMode>()
  for (const item of many(value)) {
    const split = item.lastIndexOf(":")
    if (split <= 0) continue
    const id = item.slice(0, split)
    const mode = item.slice(split + 1)
    if (mode !== "any" && mode !== "yes" && mode !== "no") continue
    byId.set(id, mode)
  }
  return [...byId.entries()].map(([id, mode]) => ({ id, mode }))
}

export const RISK_LOW_DEFAULT = 0
export const RISK_HIGH_DEFAULT = 10000

function bound(value: string | string[] | undefined, fallback: number) {
  const text = one(value).trim()
  if (!text) return fallback
  const parsed = Number(text)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) return fallback
  return parsed
}

export function parseMarketQuery(query: Record<string, string | string[] | undefined>): MarketQuery {
  let riskLow = bound(query.riskLow, RISK_LOW_DEFAULT)
  let riskHigh = bound(query.riskHigh, RISK_HIGH_DEFAULT)
  if (riskLow !== null && riskHigh !== null && riskLow > riskHigh) {
    const swap = riskLow
    riskLow = riskHigh
    riskHigh = swap
  }
  return {
    applied: one(query.applied) === "1",
    regions: many(query.region),
    currencies: many(query.currency),
    industries: many(query.industry),
    companies: many(query.company),
    features: featureChoices(query.feature),
    companyScope: one(query.companyScope),
    riskLow,
    riskHigh,
  }
}

export function companySelection(scope: string, options: string[], picked: string[]) {
  if (scope === "none") return []
  if (scope === "some") return activeSelection(true, options, picked)
  return options
}

export function activeSelection(applied: boolean, options: string[], picked: string[]) {
  if (!applied) return options
  const wanted = new Set(picked.map((item) => item.trim().toLowerCase()).filter(Boolean))
  return options.filter((option) => wanted.has(option.trim().toLowerCase()))
}

export function constraint(options: string[], checked: string[]) {
  if (options.length === 0 || checked.length === options.length) return null
  return checked
}

export function featureSelection(options: string[], picked: FeatureChoice[]): FeatureChoice[] {
  const modes = new Map(picked.map((choice) => [choice.id, choice.mode]))
  return options.map((id) => ({ id, mode: modes.get(id) ?? "any" }))
}

export function marketFiltersActive(query: MarketQuery) {
  const riskChanged = query.riskLow !== RISK_LOW_DEFAULT || query.riskHigh !== RISK_HIGH_DEFAULT
  const featuresChanged = query.features.some((feature) => feature.mode !== "any")
  return query.applied || riskChanged || featuresChanged
}
