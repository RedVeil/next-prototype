import type { SellerProfileId } from "./types"

const storageKey = (profile: SellerProfileId) => `antecipa:sold:${profile}`

export type SoldMark = {
  invoiceId: string
  sellerReceived: number
}

function isSoldMark(value: unknown): value is SoldMark {
  if (!value || typeof value !== "object") return false
  const mark = value as SoldMark
  return typeof mark.invoiceId === "string" && typeof mark.sellerReceived === "number"
}

export function readSoldMarks(profile: SellerProfileId): SoldMark[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(profile))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSoldMark)
  } catch {
    return []
  }
}

export function appendSoldMark(profile: SellerProfileId, mark: SoldMark) {
  const marks = readSoldMarks(profile)
  if (marks.some((item) => item.invoiceId === mark.invoiceId)) return
  try {
    window.localStorage.setItem(storageKey(profile), JSON.stringify([...marks, mark]))
  } catch {
    // Ignore quota / private-mode failures in the prototype.
  }
}
