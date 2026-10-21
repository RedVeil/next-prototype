import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client as PgClient } from "pg"
import { Client, decode, encode, hashes, type Transaction } from "xrpl"
import { ledgerSocketUrl, walletFromStoredSeed } from "../app/sandbox/ledger"
import { createServiceClient } from "../lib/supabase/service"
import {
  SaleFailure,
  issuanceIdFromMeta,
  prepareSale,
  signPreparedBatch,
  submitDisposition,
  transactionResult,
} from "./batch"

type ServiceClient = ReturnType<typeof createServiceClient>

type SaleOrder = {
  id: string
  invoice_id: string
  seller_organisation_id: string
  buyer_organisation_id: string
  offer_rlusd: number | string
  status: string
  signed_blob: string | null
  tx_hash: string | null
  last_ledger_sequence: number | null
  mpt_issuance_id: string | null
}

function loadEnvFile(file: string, override: boolean) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (override || process.env[key] === undefined) process.env[key] = value
  }
}

function loadEnv() {
  const webEnv = existsSync(resolve(process.cwd(), "apps/web/.env"))
    ? resolve(process.cwd(), "apps/web/.env")
    : resolve(process.cwd(), ".env")
  const rootEnv = existsSync(resolve(process.cwd(), "apps/web/.env"))
    ? resolve(process.cwd(), ".env")
    : resolve(process.cwd(), "../../.env")
  loadEnvFile(webEnv, false)
  if (rootEnv !== webEnv) loadEnvFile(rootEnv, true)
}

let pendingWake = false
let wakeWait: (() => void) | null = null

function notify() {
  pendingWake = true
  wakeWait?.()
}

function wait(ms: number) {
  if (pendingWake) {
    pendingWake = false
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeWait = null
      resolve()
    }, ms)
    wakeWait = () => {
      clearTimeout(timer)
      wakeWait = null
      pendingWake = false
      resolve()
    }
  })
}

async function listen() {
  const connection = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!connection) {
    console.log("Sale process is polling. SUPABASE_DB_URL is not set, so notifications are skipped.")
    return
  }
  const client = new PgClient({ connectionString: connection })
  client.on("error", (error: Error) => {
    console.error("Sale listener error.", error.message)
  })
  await client.connect()
  await client.query("listen sale_orders")
  client.on("notification", () => notify())
}

function asOrder(value: unknown): SaleOrder | null {
  if (!value || typeof value !== "object") return null
  const row = value as SaleOrder
  if (!row.id || !row.invoice_id) return null
  return row
}

async function voidOrder(supabase: ServiceClient, orderId: string, status: "failed" | "expired", reason: string) {
  const { error } = await supabase.rpc("void_sale_order", {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}

async function party(supabase: ServiceClient, organisationId: string, role: "seller" | "investor") {
  const { data: multisig, error } = await supabase
    .from("multisigs")
    .select("id, address, status")
    .eq("organisation_id", organisationId)
    .eq("type", "org")
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!multisig) throw new SaleFailure(`The ${role} has no organisation multisig.`)
  if (multisig.status === "paused") throw new SaleFailure(`The ${role} multisig is paused.`)
  if (multisig.status !== "live" || !multisig.address) throw new SaleFailure(`The ${role} multisig is not live.`)

  const { data: bot, error: botError } = await supabase
    .from("bots")
    .select("seed_ciphertext")
    .eq("multisig_id", multisig.id)
    .maybeSingle()
  if (botError) throw new Error(botError.message)
  if (!bot?.seed_ciphertext) throw new SaleFailure(`The ${role} bot is missing.`)
  try {
    return { address: multisig.address as string, wallet: walletFromStoredSeed(bot.seed_ciphertext as string) }
  } catch {
    throw new SaleFailure(`The ${role} bot seed could not be read.`)
  }
}

async function readTx(client: Client, hash: string) {
  try {
    const response = await client.request({ command: "tx", transaction: hash })
    return response.result
  } catch (error) {
    if (error && typeof error === "object" && "data" in error) {
      const data = error.data
      if (data && typeof data === "object" && "error" in data && data.error === "txnNotFound") return null
    }
    throw error
  }
}

function innerHashes(blob: string) {
  const tx = decode(blob) as { RawTransactions?: { RawTransaction: Transaction }[] }
  return (tx.RawTransactions ?? []).map((item) => hashes.hashSignedTx(encode(item.RawTransaction)))
}

function lastLedger(blob: string, stored: number | null) {
  if (stored) return stored
  const tx = decode(blob) as { LastLedgerSequence?: unknown }
  return typeof tx.LastLedgerSequence === "number" ? tx.LastLedgerSequence : null
}

async function finishSuccess(supabase: ServiceClient, order: SaleOrder, issuanceId: string) {
  const { data, error } = await supabase
    .from("sale_orders")
    .update({
      status: "succeeded",
      failure_reason: null,
      mpt_issuance_id: issuanceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "submitted")
    .select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) return
  const { error: invoiceError } = await supabase
    .from("organisation_invoices")
    .update({ mpt_issuance_id: issuanceId })
    .eq("id", order.invoice_id)
    .eq("buyer_organisation_id", order.buyer_organisation_id)
  if (invoiceError) throw new Error(invoiceError.message)
}

async function settle(supabase: ServiceClient, client: Client, order: SaleOrder, blob: string) {
  const hashes = innerHashes(blob)
  if (hashes.length === 0) {
    await voidOrder(supabase, order.id, "failed", "The signed batch has no inner transactions.")
    return
  }
  let issued = order.mpt_issuance_id
  for (const hash of hashes) {
    const inner = await readTx(client, hash)
    const result = inner ? transactionResult(inner) : null
    if (!inner?.validated || result !== "tesSUCCESS") {
      await voidOrder(
        supabase,
        order.id,
        "failed",
        result && result !== "tesSUCCESS"
          ? `An inner transaction result was ${result}.`
          : "An inner transaction was not in the validated ledger.",
      )
      return
    }
    issued = issuanceIdFromMeta(inner.meta) ?? issued
  }
  if (!issued) {
    await voidOrder(supabase, order.id, "failed", "The batch did not return an MPT issuance id.")
    return
  }
  await finishSuccess(supabase, order, issued)
}

async function submitBlob(supabase: ServiceClient, client: Client, order: SaleOrder, blob: string, hash: string) {
  let engine: string
  try {
    const submitted = await client.submit(blob)
    engine = submitted.result.engine_result
  } catch (error) {
    console.error(`Sale ${order.id} submit will be retried.`, error instanceof Error ? error.message : error)
    return
  }
  const disposition = submitDisposition(engine)
  if (disposition === "accepted" || disposition === "retry") return
  if (disposition === "sequence") {
    const found = await readTx(client, hash)
    if (found?.validated) {
      const result = transactionResult(found)
      if (result === "tesSUCCESS") await settle(supabase, client, order, blob)
      else await voidOrder(supabase, order.id, "failed", `The batch result was ${result ?? engine}.`)
      return
    }
    if (found) return
    await voidOrder(supabase, order.id, "failed", "The account sequence was used by another transaction.")
    return
  }
  if (disposition === "expired") {
    await voidOrder(supabase, order.id, "expired", "The batch expired before a ledger included it.")
    return
  }
  await voidOrder(supabase, order.id, "failed", `The batch was rejected (${engine}).`)
}

async function reconcile(supabase: ServiceClient, client: Client, order: SaleOrder) {
  if (!order.signed_blob || !order.tx_hash) return false
  const found = await readTx(client, order.tx_hash)
  if (found?.validated) {
    const result = transactionResult(found)
    if (result === "tesSUCCESS") await settle(supabase, client, order, order.signed_blob)
    else await voidOrder(supabase, order.id, "failed", `The batch result was ${result ?? "unknown"}.`)
    return true
  }
  if (found) return true
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" })
  const current = Number(ledger.result.ledger_index)
  const deadline = lastLedger(order.signed_blob, order.last_ledger_sequence)
  if (deadline !== null && current > deadline) {
    await voidOrder(supabase, order.id, "expired", "The batch was not in a validated ledger before its last ledger.")
    return true
  }
  await submitBlob(supabase, client, order, order.signed_blob, order.tx_hash)
  return true
}

async function buildAndSubmit(supabase: ServiceClient, client: Client, order: SaleOrder) {
  const seller = await party(supabase, order.seller_organisation_id, "seller")
  const investor = await party(supabase, order.buyer_organisation_id, "investor")
  const prepared = await prepareSale({
    client,
    seller: seller.address,
    investor: investor.address,
    amount: Number(order.offer_rlusd),
  })
  const signed = signPreparedBatch(seller.wallet, investor.wallet, investor.address, prepared.tx)
  const { error: invoiceError } = await supabase
    .from("organisation_invoices")
    .update({ mpt_issuance_id: prepared.mptIssuanceId })
    .eq("id", order.invoice_id)
    .eq("buyer_organisation_id", order.buyer_organisation_id)
  if (invoiceError) throw new Error(invoiceError.message)

  const { data, error } = await supabase
    .from("sale_orders")
    .update({
      status: "submitted",
      sequences: prepared.sequences,
      unsigned_tx: prepared.tx,
      investor_signature: signed.investorSignature,
      signed_blob: signed.blob,
      tx_hash: signed.hash,
      last_ledger_sequence: prepared.lastLedger,
      inner_hashes: prepared.innerHashes,
      mpt_issuance_id: prepared.mptIssuanceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "preparing")
    .is("signed_blob", null)
    .select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) return
  await submitBlob(supabase, client, { ...order, status: "submitted", mpt_issuance_id: prepared.mptIssuanceId }, signed.blob, signed.hash)
}

async function processOrder(supabase: ServiceClient, client: Client, order: SaleOrder) {
  try {
    if (await reconcile(supabase, client, order)) return
    await buildAndSubmit(supabase, client, order)
  } catch (error) {
    if (error instanceof SaleFailure) {
      await voidOrder(supabase, order.id, "failed", error.message)
      return
    }
    console.error(`Sale ${order.id} will be retried.`, error instanceof Error ? error.message : error)
  }
}

async function pass(supabase: ServiceClient, client: Client) {
  const { error: expireError } = await supabase.rpc("expire_open_sale_orders")
  if (expireError) throw new Error(expireError.message)

  const { data, error } = await supabase
    .from("sale_orders")
    .select("id, invoice_id, seller_organisation_id, buyer_organisation_id, offer_rlusd, status, signed_blob, tx_hash, last_ledger_sequence, mpt_issuance_id")
    .in("status", ["preparing", "submitted"])
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  for (const row of data ?? []) await processOrder(supabase, client, row as SaleOrder)

  for (let count = 0; count < 25; count += 1) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_next_sale_order")
    if (claimError) throw new Error(claimError.message)
    const order = asOrder(claimed)
    if (!order) return
    await processOrder(supabase, client, order)
  }
}

async function main() {
  loadEnv()
  const supabase = createServiceClient()
  const connection: { client: Client | null } = { client: null }
  const ledger = async () => {
    if (connection.client?.isConnected()) return connection.client
    const next = new Client(ledgerSocketUrl())
    await next.connect()
    connection.client = next
    return next
  }
  try {
    await listen()
  } catch (error) {
    console.error("Sale listener did not start.", error instanceof Error ? error.message : error)
  }
  console.log("Sale process is running.")
  let stopped = false
  const stop = () => {
    stopped = true
    notify()
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  while (!stopped) {
    try {
      await pass(supabase, await ledger())
    } catch (error) {
      console.error("Sale pass failed.", error instanceof Error ? error.message : error)
      if (connection.client) {
        await connection.client.disconnect().catch(() => undefined)
        connection.client = null
      }
    }
    if (!stopped) await wait(3000)
  }
  if (connection.client) await connection.client.disconnect().catch(() => undefined)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
