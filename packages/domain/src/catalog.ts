export const INDUSTRIES = [
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

export type Industry = (typeof INDUSTRIES)[number]

export const GOODS_AND_SERVICES = [
  "raw materials",
  "finished goods",
  "wholesale distribution",
  "equipment",
  "professional services",
  "logistics services",
  "maintenance and repair",
  "construction services",
  "agricultural products",
  "food products",
  "software and IT services",
  "other",
] as const

export type GoodOrService = (typeof GOODS_AND_SERVICES)[number]

export const COUNTRIES = [
  { code: "BR", name: "Brazil" },
  { code: "US", name: "United States" },
  { code: "MX", name: "Mexico" },
] as const

export const CURRENCIES = ["BRL", "USD", "EUR"] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

export const BRAZIL_COUNTRY = "BR"
export const BRAZIL_CURRENCY = "BRL"
