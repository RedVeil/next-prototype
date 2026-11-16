import { rlusdValue } from "../ledger/rlusd"

const SCALE = BigInt("1000000000")
const ZERO = BigInt(0)
const TWO = BigInt(2)
const HUNDRED = BigInt(100)
const YEAR = BigInt(365)

export const DEFAULT_AUCTION_HOURS = 24
export const MIN_AUCTION_HOURS = 24
export const MAX_AUCTION_HOURS = 48
export const FX_SOURCE = "frankfurter"

export type RankedBid = {
  id: string
  rlusdCents: number
  signedAt: string
}

export type PricedInvoice = {
  faceCents: number
  discountCents: number
  proceedsCents: number
  rlusdCents: number
  discount: number
  proceeds: number
  rlusd: number
  rlusdText: string
}

function scaled(value: number) {
  if (!Number.isFinite(value)) throw new Error("The amount is not a number.")
  return BigInt(Math.round(value * Number(SCALE)))
}

function halfUp(numerator: bigint, denominator: bigint) {
  if (denominator <= ZERO) throw new Error("The divisor must be positive.")
  const negative = numerator < ZERO
  const absolute = negative ? -numerator : numerator
  const rounded = (absolute + denominator / TWO) / denominator
  return negative ? -rounded : rounded
}

export function cents(amount: number) {
  return Number(halfUp(scaled(amount), SCALE / HUNDRED))
}

export function discountCents(faceCents: number, apr: number, days: number) {
  if (!Number.isInteger(faceCents) || faceCents < 0) throw new Error("Face cents must be a whole number.")
  if (!Number.isFinite(apr) || apr < 0) throw new Error("APR must be zero or greater.")
  if (!Number.isInteger(days) || days < 0) throw new Error("Days must be a whole number.")
  const numerator = BigInt(faceCents) * scaled(apr) * BigInt(days)
  const denominator = YEAR * SCALE
  return Number(halfUp(numerator, denominator))
}

export function rlusdCentsFromProceeds(proceedsCents: number, rate: number) {
  if (!Number.isInteger(proceedsCents) || proceedsCents < 0) throw new Error("Proceeds cents must be a whole number.")
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("The FX rate must be greater than zero.")
  return Number(halfUp(BigInt(proceedsCents) * scaled(rate), SCALE))
}

export function quoteInvoice(input: {
  face: number
  apr: number
  days: number
  rate: number
  currency: string
}): PricedInvoice {
  const faceCents = cents(input.face)
  const discount = discountCents(faceCents, input.apr, input.days)
  const proceeds = faceCents - discount
  if (proceeds < 0) throw new Error("The discount is larger than the face.")
  const code = input.currency.trim().toUpperCase()
  const rlusd =
    code === "BRL"
      ? rlusdCentsFromProceeds(proceeds, input.rate)
      : code === "USD" || code === "RLUSD"
        ? proceeds
        : null
  if (rlusd === null) throw new Error(`${input.currency} is not converted. Only BRL, USD, and RLUSD are.`)
  const priced = {
    faceCents,
    discountCents: discount,
    proceedsCents: proceeds,
    rlusdCents: rlusd,
    discount: discount / 100,
    proceeds: proceeds / 100,
    rlusd: rlusd / 100,
    rlusdText: "",
  }
  priced.rlusdText = rlusdValue(priced.rlusd)
  return priced
}

export function compareBids(left: RankedBid, right: RankedBid) {
  if (left.rlusdCents !== right.rlusdCents) return right.rlusdCents - left.rlusdCents
  if (left.signedAt !== right.signedAt) return left.signedAt < right.signedAt ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function rankBids<T extends RankedBid>(bids: T[]) {
  return [...bids].sort(compareBids)
}

export function bidIsFunded(input: { bidCents: number; balanceCents: number; otherSignedCents: number }) {
  return input.balanceCents - input.otherSignedCents >= input.bidCents
}

export function chooseNextBid<T extends RankedBid & { investorId: string }>(
  bids: T[],
  failed: ReadonlySet<string>,
  funded: (bid: T) => boolean,
) {
  for (const bid of rankBids(bids)) {
    if (failed.has(bid.id)) continue
    if (!funded(bid)) continue
    return bid
  }
  return null
}

export function auctionHours(value: number) {
  if (!Number.isInteger(value) || value < MIN_AUCTION_HOURS || value > MAX_AUCTION_HOURS) {
    throw new Error("The auction length must be a whole number of hours from 24 to 48.")
  }
  return value
}
