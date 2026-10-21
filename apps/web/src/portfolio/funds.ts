import { decode, hashes, isValidClassicAddress, type Client, type SubmittableTransaction } from "xrpl"
import { portalSession } from "@/app/portal/session"
import { roundMoney } from "@/app/sandbox/settle"
import { withClient } from "@/app/sandbox/ledger"
import { anyoneCanSend } from "@/app/sandbox/types"
import { isRlusdCurrency, RLUSD_CURRENCY, RLUSD_ISSUER, rlusdValue } from "@/ledger/rlusd"
import { createServiceClient } from "@/lib/supabase/service"
import { captureOrganisationNow } from "./capture"

const DEPOSIT_AUTH = 0x01000000
const PARTIAL_PAYMENT = 0x00020000

type ServiceClient = ReturnType<typeof createServiceClient>

export type FundsResult = { error?: string; message?: string; recorded?: boolean }

export type FundsPreparation =
  | { error: string }
  | { kind: "deposit"; account: string; destination: string; value: string }
  | { kind: "withdrawal"; transaction: SubmittableTransaction }

type FundsContext = {
  supabase: ServiceClient
  organisationId: string
  wallet: string
  multisigId: string
  multisig: string
  quorum: number
}

type IssuedAmount = { currency: string; issuer: string; value: string }

type PaymentShape = {
  account: string
  destination: string
  value: string
  partial: boolean
  signingPubKey: string
  signer: string
}

type LedgerTx = {
  hash?: string
  validated?: boolean
  meta?: unknown
  tx_json?: unknown
}

function closed(message: string) {
  return message.includes("organisation_cash_movements")
}

function canonicalHash(hash: string) {
  const trimmed = hash.trim()
  if (!/^[A-Fa-f0-9]{64}$/.test(trimmed)) return null
  return trimmed.toUpperCase()
}

function cents(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

function issuedAmount(amount: unknown): IssuedAmount | null {
  if (!amount || typeof amount !== "object" || Array.isArray(amount)) return null
  const row = amount as { currency?: unknown; issuer?: unknown; value?: unknown }
  if (typeof row.currency !== "string" || typeof row.issuer !== "string" || typeof row.value !== "string") return null
  if (!isRlusdCurrency(row.currency) || row.issuer !== RLUSD_ISSUER) return null
  return { currency: row.currency, issuer: row.issuer, value: row.value }
}

function signerAccount(tx: Record<string, unknown>) {
  const signers = tx.Signers
  if (!Array.isArray(signers) || signers.length !== 1) return ""
  const entry = signers[0] as { Signer?: { Account?: unknown } }
  return typeof entry.Signer?.Account === "string" ? entry.Signer.Account : ""
}

function paymentShape(tx: unknown): PaymentShape | null {
  if (!tx || typeof tx !== "object") return null
  const row = tx as Record<string, unknown>
  if (row.TransactionType !== "Payment") return null
  if (typeof row.Account !== "string" || typeof row.Destination !== "string") return null
  const amount = issuedAmount(row.Amount)
  if (!amount) return null
  const flags = Number(row.Flags ?? 0)
  return {
    account: row.Account,
    destination: row.Destination,
    value: amount.value,
    partial: (flags & PARTIAL_PAYMENT) !== 0,
    signingPubKey: typeof row.SigningPubKey === "string" ? row.SigningPubKey : "",
    signer: signerAccount(row),
  }
}

function resultCode(meta: unknown) {
  if (!meta || typeof meta !== "object") return ""
  const code = (meta as { TransactionResult?: unknown }).TransactionResult
  return typeof code === "string" ? code : ""
}

function movedCents(meta: unknown, value: string) {
  const expected = cents(value)
  if (expected === null || expected <= 0) return null
  if (!meta || typeof meta !== "object") return expected
  const delivered = (meta as { delivered_amount?: unknown }).delivered_amount
  if (delivered === undefined || delivered === "unavailable") return expected
  const issued = issuedAmount(delivered)
  if (!issued) return null
  const actual = cents(issued.value)
  if (actual !== expected) return null
  return actual
}

function missingAccount(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = error.data
  return Boolean(data && typeof data === "object" && "error" in data && data.error === "actNotFound")
}

function txnNotFound(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = error.data
  return Boolean(data && typeof data === "object" && "error" in data && data.error === "txnNotFound")
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function investorContext(): Promise<{ error: string } | FundsContext> {
  const session = await portalSession("investor")
  if (!session?.organisationId) return { error: "Sign in as an investor." }
  const supabase = createServiceClient()
  const [identity, multisig] = await Promise.all([
    supabase.from("identities").select("xrpl_address").eq("id", session.id).maybeSingle(),
    supabase
      .from("multisigs")
      .select("id, address, status, quorum")
      .eq("organisation_id", session.organisationId)
      .eq("type", "org")
      .maybeSingle(),
  ])
  if (identity.error) return { error: identity.error.message }
  if (multisig.error) return { error: multisig.error.message }
  const wallet = typeof identity.data?.xrpl_address === "string" ? identity.data.xrpl_address : ""
  if (!isValidClassicAddress(wallet)) {
    return { error: "Set an XRPL address on this user before sending RLUSD." }
  }
  const address = typeof multisig.data?.address === "string" ? multisig.data.address : ""
  const status = multisig.data?.status
  if (!multisig.data || !isValidClassicAddress(address) || (status !== "live" && status !== "paused")) {
    return { error: "This organisation has no multisig." }
  }
  return {
    supabase,
    organisationId: session.organisationId,
    wallet,
    multisigId: multisig.data.id as string,
    multisig: address,
    quorum: Number(multisig.data.quorum),
  }
}

async function committedRlusd(supabase: ServiceClient, organisationId: string) {
  const { data, error } = await supabase
    .from("sale_orders")
    .select("offer_rlusd")
    .eq("buyer_organisation_id", organisationId)
    .in("status", ["queued", "preparing", "submitted"])
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((sum, row) => sum + Number(row.offer_rlusd), 0)
}

async function signerAllowed(supabase: ServiceClient, multisigId: string, wallet: string, quorum: number) {
  const { data, error } = await supabase
    .from("org_multisig_signers")
    .select("weight")
    .eq("multisig_id", multisigId)
    .eq("address", wallet)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Number(data?.weight ?? 0) >= quorum
}

async function destinationAllowed(supabase: ServiceClient, multisigId: string, wallet: string) {
  const { data, error } = await supabase.from("org_multisig_destinations").select("address").eq("multisig_id", multisigId)
  if (error) throw new Error(error.message)
  return (data ?? []).some((row) => row.address === wallet || row.address === anyoneCanSend)
}

async function rlusdHolding(client: Client, address: string) {
  try {
    await client.request({ command: "account_info", account: address, ledger_index: "validated" })
  } catch (error) {
    if (missingAccount(error)) return null
    throw error
  }
  const lines = await client.request({
    command: "account_lines",
    account: address,
    ledger_index: "validated",
    peer: RLUSD_ISSUER,
  })
  const line = lines.result.lines.find((entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER)
  if (!line) return { balance: 0, limit: 0, line: false }
  const balance = Number(line.balance)
  const limit = Number(line.limit)
  return {
    balance: Number.isFinite(balance) ? roundMoney(Math.max(0, balance)) : 0,
    limit: Number.isFinite(limit) ? limit : 0,
    line: true,
  }
}

async function depositAuthorized(client: Client, multisig: string, wallet: string) {
  let info
  try {
    info = await client.request({ command: "account_info", account: multisig, ledger_index: "validated" })
  } catch (error) {
    if (missingAccount(error)) throw new Error("This organisation has no multisig.")
    throw error
  }
  if ((Number(info.result.account_data.Flags) & DEPOSIT_AUTH) === 0) return true
  const addresses = new Set<string>()
  let marker: string | undefined
  do {
    const listed = await client.request({
      command: "account_objects",
      account: multisig,
      type: "deposit_preauth",
      ledger_index: "validated",
      limit: 400,
      ...(marker ? { marker } : {}),
    })
    for (const entry of listed.result.account_objects) {
      if ("Authorize" in entry && typeof entry.Authorize === "string") addresses.add(entry.Authorize)
    }
    marker = typeof listed.result.marker === "string" ? listed.result.marker : undefined
  } while (marker)
  return addresses.has(wallet)
}

async function readTx(client: Client, hash: string) {
  try {
    const response = await client.request({ command: "tx", transaction: hash })
    return response.result as LedgerTx
  } catch (error) {
    if (txnNotFound(error)) return null
    throw error
  }
}

async function waitForSuccess(client: Client, hash: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const found = await readTx(client, hash)
    if (found?.validated) {
      if (resultCode(found.meta) !== "tesSUCCESS") {
        throw new Error(resultCode(found.meta) || "The ledger rejected the transaction.")
      }
      return found
    }
    if (attempt < 7) await delay(1000)
  }
  throw new Error("The payment is not in a validated ledger yet.")
}

function plainTransaction(transaction: SubmittableTransaction) {
  return JSON.parse(JSON.stringify(transaction)) as SubmittableTransaction
}

async function remember(
  context: FundsContext,
  kind: "deposit" | "withdrawal",
  amount: number,
  hash: string,
): Promise<FundsResult> {
  const existing = await context.supabase
    .from("organisation_cash_movements")
    .select("organisation_id")
    .eq("xrpl_tx_hash", hash)
    .maybeSingle()
  if (existing.error) {
    if (closed(existing.error.message)) {
      return { error: "Deposits and withdrawals stay closed until the cash movements table is created." }
    }
    return { error: existing.error.message }
  }
  if (existing.data && existing.data.organisation_id !== context.organisationId) {
    return { error: "That payment is already recorded." }
  }
  if (!existing.data) {
    const inserted = await context.supabase.from("organisation_cash_movements").insert({
      organisation_id: context.organisationId,
      kind,
      amount,
      xrpl_tx_hash: hash,
    })
    if (inserted.error && inserted.error.code !== "23505") {
      if (closed(inserted.error.message)) {
        return { error: "Deposits and withdrawals stay closed until the cash movements table is created." }
      }
      return { error: inserted.error.message }
    }
  }
  try {
    await captureOrganisationNow(context.supabase, context.organisationId)
  } catch {
    return { recorded: true, error: "The payment was sent, but the portfolio could not be updated." }
  }
  return { message: kind === "deposit" ? "Deposit sent." : "Withdrawal sent." }
}

function acceptedPayment(tx: LedgerTx, hash: string, shape: PaymentShape) {
  if (!tx.validated) return "The payment is not in a validated ledger yet."
  const code = resultCode(tx.meta)
  if (code !== "tesSUCCESS") return code || "The ledger rejected the transaction."
  if ((tx.hash ?? "").toUpperCase() !== hash) return "The payment hash does not match."
  if (shape.partial) return "Partial payments are not accepted."
  const moved = movedCents(tx.meta, shape.value)
  if (moved === null) return "The payment amount is not RLUSD."
  return null
}

export async function prepareInvestorTransfer(kind: string, amountInput: number): Promise<FundsPreparation> {
  if (kind !== "deposit" && kind !== "withdrawal") return { error: "Choose deposit or withdraw." }
  if (!Number.isFinite(amountInput) || amountInput <= 0) return { error: "Amount must be greater than zero." }
  const context = await investorContext()
  if ("error" in context) return context
  const amount = roundMoney(amountInput)
  const value = rlusdValue(amount)

  try {
    if (kind === "deposit") {
      const allowed = await withClient(async (client) => {
        const holding = await rlusdHolding(client, context.wallet)
        if (!holding) return "This wallet is not on the ledger."
        if (roundMoney(holding.balance - amount) < 0) return "The wallet does not have enough RLUSD."
        const authorized = await depositAuthorized(client, context.multisig, context.wallet)
        if (!authorized) return "This wallet is not authorized to send RLUSD to the multisig."
        return null
      })
      if (allowed) return { error: allowed }
      return { kind: "deposit", account: context.wallet, destination: context.multisig, value }
    }

    const [canSign, canReceive] = await Promise.all([
      signerAllowed(context.supabase, context.multisigId, context.wallet, context.quorum),
      destinationAllowed(context.supabase, context.multisigId, context.wallet),
    ])
    if (!canSign) return { error: "The connected wallet cannot meet the quorum." }
    if (!canReceive) return { error: "This wallet is not an allowed destination." }
    const committed = await committedRlusd(context.supabase, context.organisationId)
    const transaction = await withClient(async (client) => {
      const holding = await rlusdHolding(client, context.wallet)
      if (!holding) return "This wallet is not on the ledger."
      if (!holding.line) return "This wallet has no RLUSD trust line."
      if (roundMoney(holding.limit - holding.balance - amount) < 0) return "This wallet cannot receive that much RLUSD."
      const available = await rlusdHolding(client, context.multisig)
      if (!available) return "This organisation has no multisig."
      if (roundMoney(available.balance - committed - amount) < 0) {
        return "Withdrawal cannot exceed the RLUSD on the multisig."
      }
      const info = await client.request({
        command: "account_info",
        account: context.multisig,
        ledger_index: "validated",
      })
      return client.autofill(
        {
          TransactionType: "Payment",
          Account: context.multisig,
          Destination: context.wallet,
          Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value },
          Sequence: info.result.account_data.Sequence,
          SigningPubKey: "",
          Signers: [{ Signer: { Account: context.wallet, SigningPubKey: "", TxnSignature: "" } }],
        },
        1,
      )
    })
    if (typeof transaction === "string") return { error: transaction }
    return { kind: "withdrawal", transaction: plainTransaction(transaction) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger did not accept the payment." }
  }
}

export async function recordInvestorDeposit(hashInput: string): Promise<FundsResult> {
  const hash = canonicalHash(hashInput)
  if (!hash) return { error: "The payment hash is missing." }
  const context = await investorContext()
  if ("error" in context) return context
  try {
    const tx = await withClient((client) => waitForSuccess(client, hash))
    const shape = paymentShape(tx.tx_json)
    if (!shape || shape.account !== context.wallet || shape.destination !== context.multisig) {
      return { error: "That payment is not a deposit from your wallet to the multisig." }
    }
    const rejected = acceptedPayment(tx, hash, shape)
    if (rejected) return { error: rejected }
    const moved = movedCents(tx.meta, shape.value)
    if (moved === null) return { error: "The payment amount is not RLUSD." }
    return remember(context, "deposit", roundMoney(moved / 100), hash)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The payment could not be recorded." }
  }
}

export async function submitInvestorWithdrawal(blob: string): Promise<FundsResult> {
  if (!/^[A-Fa-f0-9]+$/.test(blob) || blob.length % 2 !== 0) {
    return { error: "The signed transaction is missing." }
  }
  let decoded: unknown
  try {
    decoded = decode(blob)
  } catch {
    return { error: "The signed transaction is missing." }
  }
  const shape = paymentShape(decoded)
  if (!shape || shape.partial || shape.signingPubKey !== "") {
    return { error: "The signed transaction does not match this withdrawal." }
  }
  const hash = canonicalHash(hashes.hashSignedTx(blob))
  if (!hash) return { error: "The signed transaction is missing." }
  const context = await investorContext()
  if ("error" in context) return context
  if (shape.account !== context.multisig || shape.destination !== context.wallet || shape.signer !== context.wallet) {
    return { error: "The signed transaction does not match this withdrawal." }
  }
  const moved = cents(shape.value)
  if (moved === null || moved <= 0) return { error: "The payment amount is not RLUSD." }
  const amount = roundMoney(moved / 100)

  try {
    const [canSign, canReceive, committed] = await Promise.all([
      signerAllowed(context.supabase, context.multisigId, context.wallet, context.quorum),
      destinationAllowed(context.supabase, context.multisigId, context.wallet),
      committedRlusd(context.supabase, context.organisationId),
    ])
    if (!canSign) return { error: "The connected wallet cannot meet the quorum." }
    if (!canReceive) return { error: "This wallet is not an allowed destination." }

    const tx = await withClient(async (client) => {
      const existing = await readTx(client, hash)
      if (existing?.validated) return existing
      const available = await rlusdHolding(client, context.multisig)
      if (!available || roundMoney(available.balance - committed - amount) < 0) {
        throw new Error("Withdrawal cannot exceed the RLUSD on the multisig.")
      }
      try {
        const response = await client.submitAndWait(blob)
        return response.result as LedgerTx
      } catch (error) {
        const found = await readTx(client, hash)
        if (found?.validated) return found
        throw error
      }
    })
    const confirmed = paymentShape(tx.tx_json)
    if (
      !confirmed ||
      confirmed.account !== shape.account ||
      confirmed.destination !== shape.destination ||
      cents(confirmed.value) !== moved ||
      confirmed.signer !== context.wallet
    ) {
      return { error: "The signed transaction does not match this withdrawal." }
    }
    const rejected = acceptedPayment(tx, hash, confirmed)
    if (rejected) return { error: rejected }
    return remember(context, "withdrawal", amount, hash)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger rejected the transaction." }
  }
}
