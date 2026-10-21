import { loadUsdRate } from "@/app/match/rate"
import { roundMoney, toRlusd } from "@/app/sandbox/settle"
import { createServiceClient } from "@/lib/supabase/service"
import { rlusdBalances } from "./balances"

type ServiceClient = ReturnType<typeof createServiceClient>

export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

type WalletRow = {
  organisationId: string
  multisig: string
  bot: string
}

type SnapshotPoint = {
  capturedAt: string
  outstanding: number
}

type InvoiceHolding = {
  buyerId: string
  face: number
  repaid: number
  currency: string
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function outstandingRlusd(holdings: InvoiceHolding[], rate: number | null, previous: number) {
  let total = 0
  for (const holding of holdings) {
    const remaining = roundMoney(Math.max(0, holding.face - holding.repaid))
    if (remaining <= 0) continue
    const code = holding.currency.trim().toUpperCase()
    if ((code === "BRL" && rate === null) || (code !== "BRL" && code !== "USD" && code !== "RLUSD")) return previous
    const converted = toRlusd(remaining, code, rate ?? 1)
    if (converted === null) return previous
    total += converted
  }
  return roundMoney(total)
}

async function wallets(supabase: ServiceClient, organisationId?: string) {
  let multisigQuery = supabase
    .from("multisigs")
    .select("id, organisation_id, address, status")
    .eq("type", "org")
    .in("status", ["live", "paused"])
  if (organisationId) multisigQuery = multisigQuery.eq("organisation_id", organisationId)
  const multisigs = await multisigQuery
  if (multisigs.error) throw new Error(multisigs.error.message)

  const rows = (multisigs.data ?? []).filter((row) => typeof row.address === "string" && row.address.length > 0)
  const ids = rows.map((row) => row.id as string)
  const bots =
    ids.length === 0
      ? { data: [], error: null }
      : await supabase.from("bots").select("multisig_id, address").in("multisig_id", ids)
  if (bots.error) throw new Error(bots.error.message)
  const botByMultisig = new Map<string, string>()
  for (const bot of bots.data ?? []) {
    const multisigId = bot.multisig_id as string | null
    const address = (bot.address as string | null) ?? ""
    if (!multisigId || !address || botByMultisig.has(multisigId)) continue
    botByMultisig.set(multisigId, address)
  }

  const listed: WalletRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const id = row.organisation_id as string | null
    if (!id || seen.has(id)) continue
    seen.add(id)
    listed.push({
      organisationId: id,
      multisig: row.address as string,
      bot: botByMultisig.get(row.id as string) ?? "",
    })
  }
  return listed
}

async function latestSnapshots(supabase: ServiceClient, organisationIds: string[]) {
  const latest = new Map<string, SnapshotPoint>()
  if (organisationIds.length === 0) return latest
  const snapshots = await supabase
    .from("organisation_portfolio_snapshots")
    .select("organisation_id, captured_at, outstanding_rlusd")
    .in("organisation_id", organisationIds)
    .order("captured_at", { ascending: false })
  if (snapshots.error) throw new Error(snapshots.error.message)
  for (const row of snapshots.data ?? []) {
    const id = row.organisation_id as string
    if (latest.has(id)) continue
    latest.set(id, { capturedAt: String(row.captured_at), outstanding: num(row.outstanding_rlusd) })
  }
  return latest
}

async function holdings(supabase: ServiceClient, organisationIds: string[]) {
  const byBuyer = new Map<string, InvoiceHolding[]>()
  if (organisationIds.length === 0) return byBuyer
  const invoices = await supabase
    .from("organisation_invoices")
    .select("buyer_organisation_id, face_value, repayment_amount, currency")
    .eq("repaid", false)
    .in("buyer_organisation_id", organisationIds)
  if (invoices.error) throw new Error(invoices.error.message)
  for (const row of invoices.data ?? []) {
    const buyerId = row.buyer_organisation_id as string | null
    if (!buyerId) continue
    const list = byBuyer.get(buyerId) ?? []
    list.push({
      buyerId,
      face: num(row.face_value),
      repaid: num(row.repayment_amount),
      currency: String(row.currency ?? ""),
    })
    byBuyer.set(buyerId, list)
  }
  return byBuyer
}

function due(walletsToRead: WalletRow[], latest: Map<string, SnapshotPoint>, now: number) {
  return walletsToRead.filter((wallet) => {
    const point = latest.get(wallet.organisationId)
    if (!point) return true
    return now - Date.parse(point.capturedAt) >= SNAPSHOT_INTERVAL_MS
  })
}

async function insertSnapshots(
  supabase: ServiceClient,
  rows: WalletRow[],
  balances: Map<string, number>,
  latest: Map<string, SnapshotPoint>,
  owned: Map<string, InvoiceHolding[]>,
  rate: number | null,
) {
  if (rows.length === 0) return 0
  const capturedAt = new Date().toISOString()
  const inserts = rows.map((wallet) => {
    const available = balances.get(wallet.multisig) ?? 0
    const reserved = wallet.bot ? (balances.get(wallet.bot) ?? 0) : 0
    const outstanding = outstandingRlusd(owned.get(wallet.organisationId) ?? [], rate, latest.get(wallet.organisationId)?.outstanding ?? 0)
    return {
      organisation_id: wallet.organisationId,
      captured_at: capturedAt,
      available_rlusd: available,
      reserved_rlusd: reserved,
      outstanding_rlusd: outstanding,
      portfolio_rlusd: roundMoney(available + reserved + outstanding),
    }
  })
  const { error } = await supabase.from("organisation_portfolio_snapshots").insert(inserts)
  if (error) throw new Error(error.message)
  return inserts.length
}

export async function captureDueSnapshots(supabase = createServiceClient()) {
  const listed = await wallets(supabase)
  const latest = await latestSnapshots(supabase, listed.map((wallet) => wallet.organisationId))
  const ready = due(listed, latest, Date.now())
  if (ready.length === 0) return 0
  const balances = await rlusdBalances(ready.flatMap((wallet) => (wallet.bot ? [wallet.multisig, wallet.bot] : [wallet.multisig])))
  const rate = await loadUsdRate()
  const owned = await holdings(supabase, ready.map((wallet) => wallet.organisationId))
  return insertSnapshots(supabase, ready, balances, latest, owned, rate)
}

export async function captureOrganisationNow(supabase: ServiceClient, organisationId: string) {
  const listed = await wallets(supabase, organisationId)
  const wallet = listed[0]
  if (!wallet) throw new Error("This organisation has no multisig.")
  const latest = await latestSnapshots(supabase, [organisationId])
  const balances = await rlusdBalances(wallet.bot ? [wallet.multisig, wallet.bot] : [wallet.multisig])
  const rate = await loadUsdRate()
  const owned = await holdings(supabase, [organisationId])
  await insertSnapshots(supabase, [wallet], balances, latest, owned, rate)
}

export async function readDisplayedFunds(supabase: ServiceClient, organisationId: string) {
  const listed = await wallets(supabase, organisationId)
  const wallet = listed[0]
  if (!wallet) return null
  const latest = await latestSnapshots(supabase, [organisationId])
  const balances = await rlusdBalances(wallet.bot ? [wallet.multisig, wallet.bot] : [wallet.multisig])
  const available = balances.get(wallet.multisig) ?? 0
  const reserved = wallet.bot ? (balances.get(wallet.bot) ?? 0) : 0
  const point = latest.get(organisationId)
  if (!point || Date.now() - Date.parse(point.capturedAt) >= SNAPSHOT_INTERVAL_MS) {
    const rate = await loadUsdRate()
    const owned = await holdings(supabase, [organisationId])
    await insertSnapshots(supabase, [wallet], balances, latest, owned, rate)
  }
  return { available, reserved }
}
