export const SELLER_PAGE_SIZE = 50

export type SellerSale = "all" | "unsold" | "sold"
export type SellerOffer = "any" | "open" | "accepted" | "none"
export type SellerSort = "number" | "customer" | "issued" | "due" | "amount"
export type SellerDir = "asc" | "desc"

export type SellerQuery = {
  q: string
  sale: SellerSale
  offer: SellerOffer
  sort: SellerSort
  dir: SellerDir
  page: number
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

export function parseSellerQuery(query: Record<string, string | string[] | undefined>): SellerQuery {
  const sale = one(query.sale)
  const offer = one(query.offer)
  const sort = one(query.sort)
  const dir = one(query.dir)
  const page = Number(one(query.page))
  return {
    q: one(query.q).trim(),
    sale: sale === "unsold" || sale === "sold" ? sale : "all",
    offer: offer === "open" || offer === "accepted" || offer === "none" ? offer : "any",
    sort: sort === "number" || sort === "customer" || sort === "issued" || sort === "amount" ? sort : "due",
    dir: dir === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

export function sellerHref(query: SellerQuery, patch: Partial<SellerQuery> = {}) {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  if (next.sale !== "all") params.set("sale", next.sale)
  if (next.offer !== "any") params.set("offer", next.offer)
  if (next.sort !== "due") params.set("sort", next.sort)
  if (next.dir !== "asc") params.set("dir", next.dir)
  if (next.page > 1) params.set("page", String(next.page))
  const text = params.toString()
  return text ? `/seller?${text}` : "/seller"
}
