import type { Confidence, MarketInvoice } from "./types"

const INDUSTRY_POOL = [
  "Agriculture",
  "Food",
  "Manufacturing",
  "Logistics",
  "Retail",
  "Automotive",
  "Chemicals",
  "Construction",
  "Healthcare",
  "Other",
] as const

const BUYERS = [
  { name: "Rede Brasil Foods", industry: "Agriculture", invoices: 38, repayments: 37, lateRate: 2.6 },
  { name: "Mercado Sul", industry: "Agriculture", invoices: 22, repayments: 20, lateRate: 4.5 },
  { name: "Agro Distribuição", industry: "Agriculture", invoices: 31, repayments: 30, lateRate: 1.8 },
  { name: "Agro Norte", industry: "Agriculture", invoices: 18, repayments: 17, lateRate: 3.2 },
  { name: "Fazenda Sul", industry: "Agriculture", invoices: 14, repayments: 13, lateRate: 5.0 },
  { name: "Cooperativa Vale", industry: "Agriculture", invoices: 26, repayments: 25, lateRate: 2.1 },
  { name: "Grãos do Cerrado", industry: "Agriculture", invoices: 11, repayments: 10, lateRate: 6.4 },
  { name: "Atlas Atacado", industry: "Retail", invoices: 16, repayments: 15, lateRate: 3.8 },
  { name: "Litoral Pack", industry: "Manufacturing", invoices: 9, repayments: 8, lateRate: 7.1 },
  { name: "Costa Imports", industry: "Logistics", invoices: 12, repayments: 11, lateRate: 4.0 },
  { name: "Grupo Norte", industry: "Food", invoices: 20, repayments: 19, lateRate: 2.9 },
  { name: "Norte Alimentos", industry: "Food", invoices: 15, repayments: 14, lateRate: 3.5 },
  { name: "Via Log Brasil", industry: "Logistics", invoices: 8, repayments: 7, lateRate: 8.2 },
  { name: "Auto Minas", industry: "Automotive", invoices: 13, repayments: 12, lateRate: 4.8 },
  { name: "Quimica Rio", industry: "Chemicals", invoices: 7, repayments: 6, lateRate: 9.1 },
  { name: "Obras Paulista", industry: "Construction", invoices: 10, repayments: 8, lateRate: 11.0 },
  { name: "Clinica Horizonte", industry: "Healthcare", invoices: 19, repayments: 19, lateRate: 0.8 },
  { name: "Retail Prime", industry: "Retail", invoices: 6, repayments: 5, lateRate: 10.4 },
  { name: "Metal Sul", industry: "Manufacturing", invoices: 21, repayments: 20, lateRate: 3.0 },
  { name: "Outros Serviços", industry: "Other", invoices: 4, repayments: 3, lateRate: 12.5 },
] as const

const SELLERS = [
  "ABC Industrial Ltda.",
  "Nova Comércio Ltda.",
  "Serrana Alimentos Ltda.",
  "Campo Forte Ltda.",
  "Leste Distribuidora Ltda.",
  "Planalto Indústria Ltda.",
  "Costa Exportadora Ltda.",
  "Vale Verde Ltda.",
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

function roundMoney(value: number): number {
  return Math.round(value / 1000) * 1000
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}

function roundApr(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function confidenceFromScore(score: number): Confidence {
  if (score >= 86) return "High"
  if (score >= 70) return "Medium"
  return "Low"
}

function industryWeight(industry: string): number {
  if (industry === "Agriculture") return 3.1
  if (industry === "Food") return 1.4
  if (industry === "Manufacturing") return 1.2
  if (industry === "Logistics") return 1.1
  return 1
}

function pickIndustry(rand: () => number): string {
  const weighted = INDUSTRY_POOL.flatMap((industry) =>
    Array.from({ length: Math.round(industryWeight(industry) * 10) }, () => industry),
  )
  return pick(rand, weighted)
}

function pickBuyer(rand: () => number, industry: string) {
  const matching = BUYERS.filter((buyer) => buyer.industry === industry)
  return pick(rand, matching.length > 0 && rand() > 0.15 ? matching : BUYERS)
}

function scoreFromRand(rand: () => number, historical: boolean): number {
  const bias = historical ? 0.92 : 1
  const base = 48 + rand() * 50 * bias
  const lift = rand() > 0.35 ? rand() * 18 : 0
  return roundScore(clamp(base + lift, 42, 99.2))
}

function tenorFromRand(rand: () => number, score: number): number {
  const shortBias = score >= 88 ? 0.45 : 0.18
  if (rand() < shortBias) return 7 + Math.floor(rand() * 14)
  if (rand() < 0.7) return 16 + Math.floor(rand() * 30)
  return 45 + Math.floor(rand() * 50)
}

function aprFromScore(rand: () => number, score: number, tenor: number): number {
  const base = 16.4 - score * 0.062
  const tenorAdj = tenor > 40 ? 0.6 : tenor < 20 ? -0.4 : 0
  return roundApr(clamp(base + tenorAdj + (rand() - 0.5) * 1.8, 8.2, 16.5))
}

function faceFromRand(rand: () => number, score: number): number {
  const base = score >= 90 ? 80_000 + rand() * 280_000 : 30_000 + rand() * 520_000
  return roundMoney(base)
}

type Crafted = {
  id: string
  buyerName: string
  sellerName: string
  industry: string
  score: number
  tenorDays: number
  availableApr: number
  faceValue: number
  historical?: boolean
  repaid?: boolean
  daysLate?: number
}

const CRAFTED_CURRENT: Crafted[] = [
  {
    id: "mkt-cur-rede-ag",
    buyerName: "Rede Brasil Foods",
    sellerName: "ABC Industrial Ltda.",
    industry: "Agriculture",
    score: 91,
    tenorDays: 21,
    availableApr: 11.6,
    faceValue: 220_000,
  },
  {
    id: "mkt-cur-mercado-ag",
    buyerName: "Mercado Sul",
    sellerName: "ABC Industrial Ltda.",
    industry: "Agriculture",
    score: 86,
    tenorDays: 28,
    availableApr: 12.1,
    faceValue: 180_000,
  },
  {
    id: "mkt-cur-agro-dist",
    buyerName: "Agro Distribuição",
    sellerName: "Campo Forte Ltda.",
    industry: "Agriculture",
    score: 94,
    tenorDays: 16,
    availableApr: 10.9,
    faceValue: 310_000,
  },
  {
    id: "mkt-cur-agro-norte",
    buyerName: "Agro Norte",
    sellerName: "Serrana Alimentos Ltda.",
    industry: "Agriculture",
    score: 78,
    tenorDays: 34,
    availableApr: 11.8,
    faceValue: 250_000,
  },
  {
    id: "mkt-cur-fazenda",
    buyerName: "Fazenda Sul",
    sellerName: "Vale Verde Ltda.",
    industry: "Agriculture",
    score: 64,
    tenorDays: 48,
    availableApr: 12.6,
    faceValue: 190_000,
  },
  {
    id: "mkt-cur-coop",
    buyerName: "Cooperativa Vale",
    sellerName: "Campo Forte Ltda.",
    industry: "Agriculture",
    score: 88,
    tenorDays: 24,
    availableApr: 11.2,
    faceValue: 275_000,
  },
  {
    id: "mkt-cur-graos",
    buyerName: "Grãos do Cerrado",
    sellerName: "Planalto Indústria Ltda.",
    industry: "Agriculture",
    score: 71,
    tenorDays: 41,
    availableApr: 12.0,
    faceValue: 165_000,
  },
  {
    id: "mkt-cur-norte-food",
    buyerName: "Grupo Norte",
    sellerName: "ABC Industrial Ltda.",
    industry: "Food",
    score: 89,
    tenorDays: 30,
    availableApr: 10.4,
    faceValue: 210_000,
  },
  {
    id: "mkt-cur-costa-mfg",
    buyerName: "Costa Imports",
    sellerName: "Leste Distribuidora Ltda.",
    industry: "Manufacturing",
    score: 92,
    tenorDays: 22,
    availableApr: 10.2,
    faceValue: 150_000,
  },
  {
    id: "mkt-cur-atlas-log",
    buyerName: "Atlas Atacado",
    sellerName: "Nova Comércio Ltda.",
    industry: "Logistics",
    score: 85,
    tenorDays: 35,
    availableApr: 10.8,
    faceValue: 175_000,
  },
  {
    id: "mkt-cur-litoral",
    buyerName: "Litoral Pack",
    sellerName: "ABC Industrial Ltda.",
    industry: "Retail",
    score: 81,
    tenorDays: 40,
    availableApr: 11.0,
    faceValue: 160_000,
  },
  {
    id: "mkt-cur-clinica",
    buyerName: "Clinica Horizonte",
    sellerName: "Nova Comércio Ltda.",
    industry: "Healthcare",
    score: 96,
    tenorDays: 14,
    availableApr: 8.7,
    faceValue: 95_000,
  },
  {
    id: "mkt-cur-rede-short",
    buyerName: "Rede Brasil Foods",
    sellerName: "ABC Industrial Ltda.",
    industry: "Food",
    score: 93,
    tenorDays: 12,
    availableApr: 9.2,
    faceValue: 140_000,
  },
  {
    id: "mkt-cur-costa-short",
    buyerName: "Costa Imports",
    sellerName: "Costa Exportadora Ltda.",
    industry: "Manufacturing",
    score: 96,
    tenorDays: 8,
    availableApr: 8.8,
    faceValue: 90_000,
  },
  {
    id: "mkt-cur-atlas-short",
    buyerName: "Atlas Atacado",
    sellerName: "Nova Comércio Ltda.",
    industry: "Logistics",
    score: 91,
    tenorDays: 18,
    availableApr: 9.0,
    faceValue: 120_000,
  },
  {
    id: "mkt-cur-metal",
    buyerName: "Metal Sul",
    sellerName: "Planalto Indústria Ltda.",
    industry: "Manufacturing",
    score: 83,
    tenorDays: 38,
    availableApr: 10.6,
    faceValue: 230_000,
  },
  {
    id: "mkt-cur-auto",
    buyerName: "Auto Minas",
    sellerName: "Leste Distribuidora Ltda.",
    industry: "Automotive",
    score: 76,
    tenorDays: 44,
    availableApr: 12.3,
    faceValue: 205_000,
  },
  {
    id: "mkt-cur-quimica",
    buyerName: "Quimica Rio",
    sellerName: "ABC Industrial Ltda.",
    industry: "Chemicals",
    score: 69,
    tenorDays: 52,
    availableApr: 13.1,
    faceValue: 145_000,
  },
]

function buyerRecord(name: string) {
  return BUYERS.find((buyer) => buyer.name === name) ?? BUYERS[BUYERS.length - 1]!
}

function toInvoice(spec: Crafted, historical: boolean): MarketInvoice {
  const buyer = buyerRecord(spec.buyerName)
  return {
    id: spec.id,
    buyerName: spec.buyerName,
    sellerName: spec.sellerName,
    faceValue: spec.faceValue,
    score: spec.score,
    confidence: confidenceFromScore(spec.score),
    industry: spec.industry,
    tenorDays: spec.tenorDays,
    availableApr: spec.availableApr,
    historical,
    repaid: spec.repaid,
    daysLate: spec.daysLate,
    buyerHistoricalInvoices: buyer.invoices,
    buyerPlatformRepayments: buyer.repayments,
    buyerLatePaymentRate: buyer.lateRate,
  }
}

function generateInvoice(
  rand: () => number,
  id: string,
  historical: boolean,
  bias: {
    industry?: string
    minScore?: number
    maxScore?: number
    maxTenor?: number
    minApr?: number
  } = {},
): MarketInvoice {
  const industry = bias.industry ?? pickIndustry(rand)
  const buyer = pickBuyer(rand, industry)
  let score = scoreFromRand(rand, historical)
  if (bias.minScore != null) score = roundScore(clamp(Math.max(score, bias.minScore + rand() * 8), bias.minScore, bias.maxScore ?? 99.2))
  if (bias.maxScore != null) score = Math.min(score, bias.maxScore)
  let tenorDays = tenorFromRand(rand, score)
  if (bias.maxTenor != null) tenorDays = Math.min(tenorDays, 7 + Math.floor(rand() * Math.max(1, bias.maxTenor - 7)))
  let availableApr = aprFromScore(rand, score, tenorDays)
  if (bias.minApr != null) availableApr = roundApr(Math.max(availableApr, bias.minApr + rand() * 1.4))
  const repaid = historical ? rand() > 0.01 : undefined
  const daysLate =
    historical && repaid && rand() < 0.03
      ? 1 + Math.floor(rand() * 6)
      : historical && !repaid
        ? 12
        : undefined
  return {
    id,
    buyerName: buyer.name,
    sellerName: pick(rand, SELLERS),
    faceValue: faceFromRand(rand, score),
    score,
    confidence: confidenceFromScore(score),
    industry: bias.industry ?? (rand() > 0.18 ? buyer.industry : industry),
    tenorDays,
    availableApr,
    historical,
    repaid,
    daysLate,
    buyerHistoricalInvoices: buyer.invoices,
    buyerPlatformRepayments: buyer.repayments,
    buyerLatePaymentRate: buyer.lateRate,
  }
}

function generateBatch(
  rand: () => number,
  start: number,
  count: number,
  prefix: string,
  historical: boolean,
  bias?: Parameters<typeof generateInvoice>[3],
): MarketInvoice[] {
  return Array.from({ length: count }, (_, index) =>
    generateInvoice(rand, `${prefix}-${start + index + 1}`, historical, bias),
  )
}

function buildMarketInvoices(): MarketInvoice[] {
  const rand = mulberry32(20260901)
  const current = CRAFTED_CURRENT.map((spec) => toInvoice(spec, false))
  current.push(
    ...generateBatch(rand, current.length, 12, "mkt-cur-ag", false, {
      industry: "Agriculture",
      minScore: 78,
      maxTenor: 32,
      minApr: 11,
    }),
  )
  current.push(
    ...generateBatch(rand, current.length, 10, "mkt-cur-hq", false, {
      minScore: 82,
      maxTenor: 42,
      minApr: 10,
    }),
  )
  current.push(
    ...generateBatch(rand, current.length, 8, "mkt-cur-st", false, {
      minScore: 90,
      maxTenor: 20,
      minApr: 8.5,
    }),
  )
  while (current.length < 64) {
    current.push(generateInvoice(rand, `mkt-cur-${current.length + 1}`, false))
  }

  const historical = [
    ...generateBatch(rand, 0, 140, "mkt-hist-ag", true, {
      industry: "Agriculture",
      minScore: 55,
      maxTenor: 55,
      minApr: 10.5,
    }),
    ...generateBatch(rand, 140, 120, "mkt-hist-hq", true, {
      minScore: 80,
      maxTenor: 45,
      minApr: 10,
    }),
    ...generateBatch(rand, 260, 80, "mkt-hist-st", true, {
      minScore: 90,
      maxTenor: 20,
      minApr: 8.5,
    }),
    ...generateBatch(rand, 340, 80, "mkt-hist-mix", true),
  ]

  return [...current, ...historical]
}

export const MARKET_INVOICES: MarketInvoice[] = buildMarketInvoices()

export const CURRENT_MARKET_INVOICES = MARKET_INVOICES.filter((invoice) => !invoice.historical)
export const HISTORICAL_MARKET_INVOICES = MARKET_INVOICES.filter((invoice) => invoice.historical)
