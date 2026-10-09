import { db } from "./db"
import { readRlusdBalance } from "./xrpl-ops"

const MICRO = BigInt(1_000_000)
const ZERO = BigInt(0)
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000
const CLOSED_INVOICE_STATUSES = new Set(["settled", "declined", "expired", "failed"])

export function toMicro(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return ZERO
  const raw = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return ZERO
  const negative = raw.startsWith("-")
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, frac = ""] = unsigned.split(".")
  const frac6 = (frac + "000000").slice(0, 6)
  let micro = BigInt(whole || "0") * MICRO + BigInt(frac6 || "0")
  if (frac.length > 6 && frac[6] >= "5") micro += BigInt(1)
  return negative ? -micro : micro
}

export function fromMicro(value: bigint): string {
  const negative = value < ZERO
  const abs = negative ? -value : value
  const whole = abs / MICRO
  const frac = (abs % MICRO).toString().padStart(6, "0").replace(/0+$/, "")
  const text = frac ? `${whole.toString()}.${frac}` : whole.toString()
  return negative ? `-${text}` : text
}

export type SnapshotReading = {
  cashRlusd: string
  invoicesRlusd: string
  portfolioRlusd: string
  captured: boolean
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function sumOpenExpectedRepaymentRlusd(investorId: string): Promise<string> {
  const buckets = await db().from("buckets").select("id").eq("investor_id", investorId)
  if (buckets.error) throw new Error(buckets.error.message)
  const ids = (buckets.data ?? []).map((row) => String(row.id))
  if (ids.length === 0) return "0"

  const purchases = await db()
    .from("bucket_purchases")
    .select("expected_repayment_rlusd, invoices(status)")
    .in("bucket_id", ids)
  if (purchases.error) throw new Error(purchases.error.message)

  let total = ZERO
  for (const row of purchases.data ?? []) {
    const invoice = one(row.invoices as { status?: string } | { status?: string }[] | null)
    const status = invoice?.status ? String(invoice.status) : ""
    if (CLOSED_INVOICE_STATUSES.has(status)) continue
    total += toMicro(row.expected_repayment_rlusd as string | number | null)
  }
  return fromMicro(total)
}

async function walletAddress(investorId: string): Promise<string | null> {
  const multisig = await db()
    .from("multisig_accounts")
    .select("classic_address")
    .eq("investor_id", investorId)
    .eq("role", "investor_wallet")
    .maybeSingle()
  if (multisig.error) throw new Error(multisig.error.message)
  return multisig.data?.classic_address ? String(multisig.data.classic_address) : null
}

/**
 * Stores cash, outstanding expected repayments, and their sum.
 * Writes immediately when those figures change, and at most every 15 minutes when they do not.
 * Skips the write when multisig 1 does not exist yet.
 */
export async function capturePortfolioSnapshot(
  investorId: string,
  options?: { cashRlusd?: string },
): Promise<SnapshotReading> {
  const invoicesRlusd = await sumOpenExpectedRepaymentRlusd(investorId)
  const invoices = toMicro(invoicesRlusd)

  let cashRlusd = options?.cashRlusd
  if (cashRlusd === undefined) {
    const address = await walletAddress(investorId)
    if (!address) {
      return {
        cashRlusd: "0",
        invoicesRlusd,
        portfolioRlusd: fromMicro(invoices),
        captured: false,
      }
    }
    cashRlusd = await readRlusdBalance(address)
  }

  const cash = toMicro(cashRlusd)
  const portfolio = cash + invoices
  const reading: SnapshotReading = {
    cashRlusd: fromMicro(cash),
    invoicesRlusd: fromMicro(invoices),
    portfolioRlusd: fromMicro(portfolio),
    captured: false,
  }

  const latest = await db()
    .from("portfolio_snapshots")
    .select("captured_at, cash_rlusd, invoices_rlusd")
    .eq("investor_id", investorId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest.error) throw new Error(latest.error.message)

  const changed =
    !latest.data ||
    toMicro(latest.data.cash_rlusd as string | number) !== cash ||
    toMicro(latest.data.invoices_rlusd as string | number) !== invoices
  const capturedAt = latest.data?.captured_at ? Date.parse(String(latest.data.captured_at)) : Number.NaN
  const stale = !latest.data || Number.isNaN(capturedAt) || Date.now() - capturedAt >= SNAPSHOT_INTERVAL_MS
  if (!changed && !stale) return reading

  const write = await db().from("portfolio_snapshots").insert({
    investor_id: investorId,
    cash_rlusd: reading.cashRlusd,
    invoices_rlusd: reading.invoicesRlusd,
    portfolio_rlusd: reading.portfolioRlusd,
  })
  if (write.error) throw new Error(write.error.message)
  return { ...reading, captured: true }
}

export async function captureAllPortfolioSnapshots() {
  const accounts = await db().from("multisig_accounts").select("investor_id, classic_address").eq("role", "investor_wallet")
  if (accounts.error) throw new Error(accounts.error.message)
  for (const row of accounts.data ?? []) {
    if (!row.investor_id || !row.classic_address) continue
    try {
      await capturePortfolioSnapshot(String(row.investor_id))
    } catch (error) {
      console.error(
        `Portfolio snapshot failed for ${String(row.investor_id)}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }
}
