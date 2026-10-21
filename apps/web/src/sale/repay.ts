import { decode, encode, hashes, type Client, type Transaction } from "xrpl"
import { withClient, walletFromStoredSeed } from "../app/sandbox/ledger"
import { roundMoney } from "../app/sandbox/settle"
import { createServiceClient } from "../lib/supabase/service"
import { captureOrganisationNow } from "../portfolio/capture"
import {
  SaleFailure,
  prepareRepayment,
  signRepaymentBatch,
  submitDisposition,
  transactionResult,
} from "./batch"

type ServiceClient = ReturnType<typeof createServiceClient>

type Result = { error?: string; message?: string }

type InvoiceRow = {
  id: string
  seller_organisation_id: string
  buyer_organisation_id: string
  mpt_issuance_id: string
}

type RepaymentOrder = {
  id: string
  status: string
  signed_blob: string | null
  tx_hash: string | null
  amount_rlusd: number | string
  buyer_organisation_id: string
}

type Party = { address: string; wallet: ReturnType<typeof walletFromStoredSeed> }

type RunResult = { done: true } | { pending: string } | { error: string }

const PENDING = "The repayment was submitted. Repay again to finish recording it."

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function failOrder(supabase: ServiceClient, orderId: string, reason: string) {
  const { error } = await supabase
    .from("repayment_orders")
    .update({
      status: "failed",
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .in("status", ["building", "submitted"])
  if (error) throw new Error(error.message)
}

async function orgParty(supabase: ServiceClient, organisationId: string, role: "seller" | "investor"): Promise<Party> {
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
  return botParty(supabase, multisig.id as string, multisig.address as string, role)
}

async function repaymentParty(supabase: ServiceClient): Promise<Party> {
  const { data: multisig, error } = await supabase
    .from("multisigs")
    .select("id, address, status")
    .eq("type", "repayment")
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!multisig) throw new SaleFailure("The repayment multisig is not set up.")
  if (multisig.status === "paused") throw new SaleFailure("The repayment multisig is paused.")
  if (multisig.status !== "live" || !multisig.address) throw new SaleFailure("The repayment multisig is not live.")
  return botParty(supabase, multisig.id as string, multisig.address as string, "repayment")
}

async function botParty(supabase: ServiceClient, multisigId: string, address: string, role: string): Promise<Party> {
  const { data: bot, error } = await supabase.from("bots").select("seed_ciphertext").eq("multisig_id", multisigId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!bot?.seed_ciphertext) throw new SaleFailure(`The ${role} bot is missing.`)
  try {
    return { address, wallet: walletFromStoredSeed(bot.seed_ciphertext as string) }
  } catch {
    throw new SaleFailure(`The ${role} bot seed could not be read.`)
  }
}

async function claim(supabase: ServiceClient, invoice: InvoiceRow, amount: number): Promise<RepaymentOrder | Result> {
  const inserted = await supabase
    .from("repayment_orders")
    .insert({
      invoice_id: invoice.id,
      buyer_organisation_id: invoice.buyer_organisation_id,
      amount_rlusd: amount,
      status: "building",
    })
    .select("id, status, signed_blob, tx_hash, amount_rlusd, buyer_organisation_id")
    .single()
  if (!inserted.error && inserted.data) return inserted.data as RepaymentOrder
  if (inserted.error && inserted.error.code !== "23505") return { error: inserted.error.message }

  const existing = await supabase
    .from("repayment_orders")
    .select("id, status, signed_blob, tx_hash, amount_rlusd, buyer_organisation_id")
    .eq("invoice_id", invoice.id)
    .in("status", ["building", "submitted"])
    .maybeSingle()
  if (existing.error) return { error: existing.error.message }
  if (!existing.data) return { error: "Repayment is already in progress." }
  return existing.data as RepaymentOrder
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

function lastLedger(blob: string) {
  const tx = decode(blob) as { LastLedgerSequence?: unknown }
  return typeof tx.LastLedgerSequence === "number" ? tx.LastLedgerSequence : null
}

async function innersOk(client: Client, blob: string): Promise<true | string | null> {
  const ids = innerTransactionHashes(blob)
  if (ids.length === 0) return "The signed batch has no inner transactions."
  for (const hash of ids) {
    const inner = await readTx(client, hash)
    const result = inner ? transactionResult(inner) : null
    if (!inner?.validated || result !== "tesSUCCESS") {
      if (inner?.validated && result && result !== "tesSUCCESS") return `An inner transaction result was ${result}.`
      return null
    }
  }
  return true
}

function innerTransactionHashes(blob: string) {
  const tx = decode(blob) as { RawTransactions?: { RawTransaction: Transaction }[] }
  return (tx.RawTransactions ?? []).map((item) => hashes.hashSignedTx(encode(item.RawTransaction)))
}

async function settled(supabase: ServiceClient, client: Client, order: RepaymentOrder): Promise<RunResult | null> {
  if (!order.tx_hash || !order.signed_blob) return null
  const found = await readTx(client, order.tx_hash)
  if (found?.validated) {
    const result = transactionResult(found)
    if (result !== "tesSUCCESS") {
      const reason = `The batch result was ${result ?? "unknown"}.`
      await failOrder(supabase, order.id, reason)
      return { error: reason }
    }
    const inners = await innersOk(client, order.signed_blob)
    if (inners === true) return { done: true }
    if (typeof inners === "string") {
      await failOrder(supabase, order.id, inners)
      return { error: inners }
    }
    return null
  }
  if (found) return null
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" })
  const current = Number(ledger.result.ledger_index)
  const deadline = lastLedger(order.signed_blob)
  if (deadline !== null && current > deadline) {
    const reason = "The batch was not in a validated ledger before its last ledger."
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }
  return null
}

async function submitAndWait(supabase: ServiceClient, client: Client, order: RepaymentOrder): Promise<RunResult> {
  if (!order.signed_blob || !order.tx_hash) return { error: "The stored repayment has no transaction." }
  let engine: string
  try {
    const submitted = await client.submit(order.signed_blob)
    engine = submitted.result.engine_result
  } catch {
    return { pending: PENDING }
  }
  const disposition = submitDisposition(engine)
  if (disposition === "reject") {
    const reason = `The batch was rejected (${engine}).`
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }
  if (disposition === "expired") {
    const reason = "The batch expired before a ledger included it."
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }
  if (disposition === "sequence") {
    const found = await settled(supabase, client, order)
    if (found) return found
    const existing = await readTx(client, order.tx_hash)
    if (!existing) {
      const reason = "The account sequence was used by another transaction."
      await failOrder(supabase, order.id, reason)
      return { error: reason }
    }
    return { pending: PENDING }
  }
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const found = await settled(supabase, client, order)
    if (found) return found
    if (attempt < 14) await delay(1000)
  }
  return { pending: PENDING }
}

async function buildAndSubmit(
  supabase: ServiceClient,
  client: Client,
  order: RepaymentOrder,
  invoice: InvoiceRow,
  repayment: Party,
  seller: Party,
  investor: Party,
): Promise<RunResult> {
  if (order.signed_blob && !order.tx_hash) {
    const reason = "The stored repayment has no transaction hash."
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }
  if (order.signed_blob && order.tx_hash) return submitAndWait(supabase, client, order)

  const { data: openSale, error: openError } = await supabase
    .from("sale_orders")
    .select("id")
    .eq("seller_organisation_id", invoice.seller_organisation_id)
    .in("status", ["preparing", "submitted"])
    .limit(1)
  if (openError) return { error: openError.message }
  if (openSale?.length) {
    const reason = "A sale is still settling for this seller."
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }

  let signed: { blob: string; hash: string }
  try {
    const prepared = await prepareRepayment({
      client,
      repayment: repayment.address,
      seller: seller.address,
      investor: investor.address,
      issuanceId: invoice.mpt_issuance_id,
      amount: Number(order.amount_rlusd),
    })
    signed = signRepaymentBatch(repayment.wallet, seller.wallet, seller.address, prepared.tx)
  } catch (error) {
    const reason = message(error, "The repayment could not be prepared.")
    await failOrder(supabase, order.id, reason)
    return { error: reason }
  }

  const saved = await supabase
    .from("repayment_orders")
    .update({
      status: "submitted",
      signed_blob: signed.blob,
      tx_hash: signed.hash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "building")
    .is("signed_blob", null)
    .select("id")
  if (saved.error) return { error: saved.error.message }
  if (!saved.data?.length) return { error: "Repayment is already in progress." }
  return submitAndWait(supabase, client, { ...order, status: "submitted", signed_blob: signed.blob, tx_hash: signed.hash })
}

export async function repaySoldInvoice(supabase: ServiceClient, invoiceId: string): Promise<Result> {
  const { data, error } = await supabase
    .from("organisation_invoices")
    .select("id, seller_organisation_id, buyer_organisation_id, mpt_issuance_id, repayment_amount, repaid")
    .eq("id", invoiceId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: "That invoice is not in the catalogue." }
  if (!data.buyer_organisation_id) return { error: "This invoice has not been sold." }
  if (data.repaid) return { error: "This invoice is already repaid." }
  if (Number(data.repayment_amount) > 0) return { error: "This invoice already has a repayment recorded." }
  const issuanceId = typeof data.mpt_issuance_id === "string" ? data.mpt_issuance_id : ""
  if (!/^[0-9A-Fa-f]{48}$/.test(issuanceId)) return { error: "This invoice has no MPT." }

  const sale = await supabase
    .from("sale_orders")
    .select("face_rlusd")
    .eq("invoice_id", invoiceId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (sale.error) return { error: sale.error.message }
  const amount = roundMoney(Number(sale.data?.face_rlusd))
  if (!sale.data || !(amount > 0)) return { error: "This invoice has no settled sale." }

  const invoice: InvoiceRow = {
    id: data.id as string,
    seller_organisation_id: data.seller_organisation_id as string,
    buyer_organisation_id: data.buyer_organisation_id as string,
    mpt_issuance_id: issuanceId,
  }

  let seller: Party
  let investor: Party
  let repayment: Party
  try {
    ;[seller, investor, repayment] = await Promise.all([
      orgParty(supabase, invoice.seller_organisation_id, "seller"),
      orgParty(supabase, invoice.buyer_organisation_id, "investor"),
      repaymentParty(supabase),
    ])
  } catch (error) {
    return { error: message(error, "The repayment accounts could not be read.") }
  }

  const claimed = await claim(supabase, invoice, amount)
  if (!("id" in claimed)) return claimed
  const order = claimed

  let outcome: RunResult
  try {
    outcome = await withClient((client) => buildAndSubmit(supabase, client, order, invoice, repayment, seller, investor))
  } catch (error) {
    return { error: message(error, "The repayment could not be submitted.") }
  }
  if ("error" in outcome) return { error: outcome.error }
  if ("pending" in outcome) return { message: outcome.pending }

  const finished = await supabase.rpc("finish_invoice_repayment", { p_order_id: order.id })
  if (finished.error) return { error: finished.error.message }

  const paid = `${roundMoney(Number(order.amount_rlusd))} RLUSD`
  try {
    await captureOrganisationNow(supabase, order.buyer_organisation_id)
  } catch {
    return { message: `Repaid the invoice with ${paid}. The portfolio could not be updated.` }
  }
  return { message: `Repaid the invoice with ${paid}.` }
}
