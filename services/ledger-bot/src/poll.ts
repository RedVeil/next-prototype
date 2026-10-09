import { LEDGER_BOT_SERVICE, submitLedgerJob, type LedgerJob, type LedgerJobType } from "./index"
import { scanAllDeposits } from "./deposits"
import { captureAllPortfolioSnapshots } from "./snapshots"
import { db } from "./db"
import { loadRootEnv } from "./env"
import { provisionInvestor } from "./provision"

const startedAt = new Date().toISOString()

export async function recoverStuckProvisionJobs() {
  const updated = await db()
    .from("ledger_jobs")
    .update({ status: "queued" })
    .eq("type", "provision_investor_multisigs")
    .eq("status", "running")
  if (updated.error) throw new Error(updated.error.message)
}

async function claimProvisionJob() {
  const queued = await db()
    .from("ledger_jobs")
    .select("id, type, bot_wallet_id, payload, status, attempts, last_error")
    .eq("type", "provision_investor_multisigs")
    .eq("status", "queued")
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (queued.error) throw new Error(queued.error.message)
  if (!queued.data) return

  const claimed = await db()
    .from("ledger_jobs")
    .update({ status: "running", attempts: Number(queued.data.attempts ?? 0) + 1 })
    .eq("id", queued.data.id)
    .eq("status", "queued")
    .select("id, payload")
    .maybeSingle()
  if (claimed.error) throw new Error(claimed.error.message)
  if (!claimed.data) return

  const payload = (claimed.data.payload ?? {}) as { investorId?: string }
  try {
    const botWalletId = await provisionInvestor(String(payload.investorId ?? ""))
    const done = await db()
      .from("ledger_jobs")
      .update({
        status: "succeeded",
        bot_wallet_id: botWalletId || null,
        last_error: null,
      })
      .eq("id", claimed.data.id)
    if (done.error) throw new Error(done.error.message)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db().from("ledger_jobs").update({ status: "failed", last_error: message }).eq("id", claimed.data.id)
  }
}

async function refuseOtherQueuedJobs() {
  const queued = await db()
    .from("ledger_jobs")
    .select("id, type, bot_wallet_id, payload, status, attempts, last_error")
    .eq("status", "queued")
    .neq("type", "provision_investor_multisigs")
    .limit(10)
  if (queued.error) throw new Error(queued.error.message)
  for (const row of queued.data ?? []) {
    const refused = submitLedgerJob(
      {
        id: String(row.id),
        type: row.type as LedgerJobType,
        botWalletId: String(row.bot_wallet_id ?? ""),
        payload: (row.payload ?? {}) as Record<string, unknown>,
        status: "queued",
        attempts: Number(row.attempts ?? 0),
        lastError: row.last_error ? String(row.last_error) : null,
      } satisfies LedgerJob,
      { XRPL_NETWORK: process.env.XRPL_NETWORK },
    )
    await db()
      .from("ledger_jobs")
      .update({ status: refused.status, attempts: refused.attempts, last_error: refused.lastError })
      .eq("id", row.id)
      .eq("status", "queued")
  }
}

async function heartbeat() {
  const now = new Date().toISOString()
  const existing = await db().from("service_heartbeats").select("service_name").eq("service_name", LEDGER_BOT_SERVICE).maybeSingle()
  if (existing.data) {
    await db().from("service_heartbeats").update({ last_seen_at: now }).eq("service_name", LEDGER_BOT_SERVICE)
    return
  }
  await db().from("service_heartbeats").insert({
    service_name: LEDGER_BOT_SERVICE,
    started_at: startedAt,
    last_seen_at: now,
  })
}

export async function pollOnce() {
  loadRootEnv()
  await claimProvisionJob()
  await refuseOtherQueuedJobs()
  await scanAllDeposits()
  await captureAllPortfolioSnapshots()
  await heartbeat()
}
