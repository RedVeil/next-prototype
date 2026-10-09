import { buildWithdrawPayment } from "@antecipa/xrpl"
import { Wallet, decode, multisign, type SubmittableTransaction } from "xrpl"
import { decryptSeed } from "./crypto"
import { db } from "./db"
import { requireEnv } from "./env"
import { addBotFee, readRlusdBalance, rlusdIssuer, sameAmount, submitMultisigned, withClient } from "./xrpl-ops"

type XummCreated = {
  uuid: string
  next?: { always?: string }
  refs?: { qr_png?: string }
}

type XummFetched = XummCreated & {
  meta?: { signed?: boolean; resolved?: boolean }
  response?: { hex?: string; txid?: string; account?: string }
}

async function xumm(path: string, body?: unknown): Promise<XummFetched> {
  const response = await fetch(`https://xumm.app/api/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "X-API-Key": requireEnv("XUMM_API_KEY"),
      "X-API-Secret": requireEnv("XUMM_API_SECRET"),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || "Xaman request failed")
  return JSON.parse(text) as XummFetched
}

async function investorWithdrawalContext(investorId: string) {
  const investor = await db()
    .from("investors")
    .select("id, own_xrpl_address, bot_paused, application_status, access_status")
    .eq("id", investorId)
    .maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  if (!investor.data) throw new Error("Investor not found")
  if (investor.data.application_status !== "accepted") throw new Error("Investor is not accepted")
  if (investor.data.access_status === "stopped") throw new Error("Investor is stopped")
  if (!investor.data.bot_paused) throw new Error("Pause investments before withdrawing")
  if (!investor.data.own_xrpl_address) throw new Error("Investor has no XRPL address")

  const multisig = await db()
    .from("multisig_accounts")
    .select("id, classic_address")
    .eq("investor_id", investorId)
    .eq("role", "investor_wallet")
    .maybeSingle()
  if (multisig.error) throw new Error(multisig.error.message)
  if (!multisig.data) throw new Error("Multisig 1 is not provisioned yet")

  return {
    own: String(investor.data.own_xrpl_address),
    multisigId: String(multisig.data.id),
    multisigAddress: String(multisig.data.classic_address),
  }
}

type SignedShape = {
  TransactionType?: string
  Account?: string
  Destination?: string
  Amount?: unknown
  SigningPubKey?: string
  Signers?: { Signer: { Account: string } }[]
}

function assertWithdrawal(tx: SignedShape, expected: { account: string; destination: string; amount: string; signer: string }) {
  if (tx.TransactionType !== "Payment") throw new Error("Signed transaction is not a payment")
  if (tx.Account !== expected.account) throw new Error("Signed transaction is for a different account")
  if (tx.Destination !== expected.destination) throw new Error("Withdrawal destination must be the investor account")
  const amount = tx.Amount
  if (typeof amount !== "object" || amount == null || !("currency" in amount) || !("issuer" in amount) || !("value" in amount)) {
    throw new Error("Withdrawal must be RLUSD from the official issuer")
  }
  const issued = amount as { currency: string; issuer: string; value: string }
  if (issued.currency !== "RLUSD" || issued.issuer !== rlusdIssuer()) {
    throw new Error("Withdrawal must be RLUSD from the official issuer")
  }
  if (!sameAmount(String(issued.value), expected.amount)) throw new Error("Signed amount does not match")
  const signers = tx.Signers ?? []
  if (!signers.some((entry) => entry.Signer.Account === expected.signer)) {
    throw new Error("The investor account did not sign this withdrawal")
  }
}

async function submitInvestorSigned(hex: string, expected: { account: string; destination: string; amount: string; signer: string }) {
  const decoded = decode(hex) as SignedShape
  assertWithdrawal(decoded, expected)
  return withClient(async (client) => {
    const prepared = decoded.SigningPubKey ? hex : multisign([hex])
    const checked = decode(prepared) as SignedShape
    assertWithdrawal(checked, expected)
    const result = await client.submitAndWait(prepared)
    const meta = result.result.meta
    const code =
      typeof meta === "object" && meta && "TransactionResult" in meta
        ? String((meta as { TransactionResult: string }).TransactionResult)
        : null
    if (code && code !== "tesSUCCESS") throw new Error(code)
    return result.result.hash
  })
}

export async function prepareWithdrawal(investorId: string, amount: string) {
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter a positive RLUSD amount")
  const context = await investorWithdrawalContext(investorId)
  const { readRlusdBalance } = await import("./xrpl-ops")
  const balance = await readRlusdBalance(context.multisigAddress)
  if (Number(balance) < Number(amount)) throw new Error("Multisig 1 does not have that much RLUSD")

  const tx = buildWithdrawPayment({
    investorMultisig1: context.multisigAddress,
    investorAccount: context.own,
    rlusdIssuer: rlusdIssuer(),
    amount,
  })
  return withClient(async (client) => {
    const filled = await client.autofill({
      ...tx,
      SigningPubKey: "",
    } as SubmittableTransaction)
    const fee = Number(filled.Fee ?? "12")
    const signerCount = 1
    filled.Fee = String(Math.ceil(fee * (1 + signerCount)))
    return filled
  })
}

/** Sign and submit a withdrawal with the investor-wallet bot. Investments must already be paused so a reservation cannot use the same sequence. */
export async function executeWithdrawal(investorId: string, amount: string) {
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter a positive RLUSD amount")
  const context = await investorWithdrawalContext(investorId)
  const balance = await readRlusdBalance(context.multisigAddress)
  if (Number(balance) < Number(amount)) throw new Error("Multisig 1 does not have that much RLUSD")

  const bot = await db()
    .from("bot_wallets")
    .select("id, seed_ciphertext")
    .eq("multisig_account_id", context.multisigId)
    .eq("purpose", "investor_wallet")
    .maybeSingle()
  if (bot.error) throw new Error(bot.error.message)
  if (!bot.data?.seed_ciphertext) throw new Error("Multisig 1 has no bot signer")

  const wallet = Wallet.fromSeed(decryptSeed(String(bot.data.seed_ciphertext)))
  const tx = buildWithdrawPayment({
    investorMultisig1: context.multisigAddress,
    investorAccount: context.own,
    rlusdIssuer: rlusdIssuer(),
    amount,
  })
  const submitted = await withClient((client) => submitMultisigned(client, [wallet], tx))
  await addBotFee(String(bot.data.id), submitted.feeDrops)

  const inserted = await db().from("withdrawals").insert({
    investor_id: investorId,
    source_multisig_id: context.multisigId,
    destination_address: context.own,
    amount,
    status: "confirmed",
    xrpl_tx_hash: submitted.hash,
  })
  if (inserted.error) throw new Error(inserted.error.message)
  return { hash: submitted.hash }
}

export async function startWithdrawal(investorId: string, amount: string) {
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter a positive RLUSD amount")
  const context = await investorWithdrawalContext(investorId)
  const { readRlusdBalance } = await import("./xrpl-ops")
  const balance = await readRlusdBalance(context.multisigAddress)
  if (Number(balance) < Number(amount)) throw new Error("Multisig 1 does not have that much RLUSD")

  const tx = buildWithdrawPayment({
    investorMultisig1: context.multisigAddress,
    investorAccount: context.own,
    rlusdIssuer: rlusdIssuer(),
    amount,
  })
  const payload = await xumm("/platform/payload", {
    txjson: tx,
    options: { submit: false, multisign: true, expire: 15 },
  })
  if (!payload.uuid) throw new Error("Xaman did not return a payload")

  const inserted = await db()
    .from("withdrawals")
    .insert({
      investor_id: investorId,
      source_multisig_id: context.multisigId,
      destination_address: context.own,
      amount,
      status: "awaiting_signature",
      xumm_uuid: payload.uuid,
    })
    .select("id")
    .single()
  if (inserted.error) throw new Error(inserted.error.message)

  return {
    withdrawalId: String(inserted.data.id),
    uuid: payload.uuid,
    nextUrl: payload.next?.always ?? `https://xumm.app/sign/${payload.uuid}`,
    qr: payload.refs?.qr_png ?? null,
  }
}

export async function finishWithdrawal(withdrawalId: string) {
  const row = await db()
    .from("withdrawals")
    .select("id, investor_id, amount, destination_address, source_multisig_id, status, xumm_uuid, xrpl_tx_hash")
    .eq("id", withdrawalId)
    .maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data) throw new Error("Withdrawal not found")
  if (row.data.xrpl_tx_hash) return { status: "confirmed" as const, hash: String(row.data.xrpl_tx_hash) }
  if (!row.data.xumm_uuid) throw new Error("Withdrawal has no Xaman payload")

  const context = await investorWithdrawalContext(String(row.data.investor_id))
  const payload = await xumm(`/platform/payload/${row.data.xumm_uuid}`)
  if (!payload.meta?.signed || !payload.response?.hex) {
    return { status: "awaiting_signature" as const }
  }

  const hash = await submitInvestorSigned(payload.response.hex, {
    account: context.multisigAddress,
    destination: context.own,
    amount: String(row.data.amount),
    signer: context.own,
  })
  const updated = await db()
    .from("withdrawals")
    .update({ status: "confirmed", xrpl_tx_hash: hash })
    .eq("id", withdrawalId)
  if (updated.error) throw new Error(updated.error.message)
  return { status: "confirmed" as const, hash }
}

export async function submitPastedWithdrawal(investorId: string, amount: string, blob: string) {
  const context = await investorWithdrawalContext(investorId)
  const hash = await submitInvestorSigned(blob.trim(), {
    account: context.multisigAddress,
    destination: context.own,
    amount,
    signer: context.own,
  })
  const inserted = await db().from("withdrawals").insert({
    investor_id: investorId,
    source_multisig_id: context.multisigId,
    destination_address: context.own,
    amount,
    status: "confirmed",
    xrpl_tx_hash: hash,
  })
  if (inserted.error) throw new Error(inserted.error.message)
  return { hash }
}
