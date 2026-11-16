import { isRlusdCurrency, RLUSD_ISSUER } from "../ledger/rlusd"
import { issuanceIdFromMeta, mptIssuanceId, submitDisposition, transactionResult } from "../sale/batch"
import { Client, decode, encode, hashes, type Transaction } from "xrpl"

const DEPOSIT_AUTH = 0x01000000

export class AuctionFailure extends Error {}

export type AccountFacts = {
  sequence: number
  balanceDrops: number
  ownerCount: number
  depositAuth: boolean
  rlusdCents: number
  rlusdLimitCents: number | null
  preauthorized: Set<string>
}

function rippledCode(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return null
  const data = error.data
  if (!data || typeof data !== "object" || !("error" in data)) return null
  return typeof data.error === "string" ? data.error : null
}

export async function readAccount(client: Client, account: string, role: string): Promise<AccountFacts> {
  let info
  try {
    info = await client.request({ command: "account_info", account, ledger_index: "validated" })
  } catch (error) {
    if (rippledCode(error) === "actNotFound") throw new AuctionFailure(`The ${role} multisig is not on the ledger.`)
    throw error
  }
  const root = info.result.account_data
  const lines = await client.request({
    command: "account_lines",
    account,
    ledger_index: "validated",
    peer: RLUSD_ISSUER,
  })
  const line = lines.result.lines.find((entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER)
  const preauthorized = new Set<string>()
  let marker: unknown
  do {
    const page = await client.request({
      command: "account_objects",
      account,
      ledger_index: "validated",
      type: "deposit_preauth",
      limit: 200,
      ...(marker ? { marker: marker as never } : {}),
    })
    for (const entry of page.result.account_objects) {
      if ("Authorize" in entry && typeof entry.Authorize === "string") preauthorized.add(entry.Authorize)
    }
    marker = page.result.marker
  } while (marker)

  return {
    sequence: root.Sequence,
    balanceDrops: Number(root.Balance),
    ownerCount: root.OwnerCount ?? 0,
    depositAuth: (root.Flags & DEPOSIT_AUTH) !== 0,
    rlusdCents: line ? Math.round(Number(line.balance) * 100) : 0,
    rlusdLimitCents: line ? Math.round(Number(line.limit) * 100) : null,
    preauthorized,
  }
}

export function reserveCovers(balanceDrops: number, ownerCount: number, extra: number, base: number, increment: number, fee: number) {
  return balanceDrops >= base + increment * (ownerCount + extra) + fee
}

export async function reserves(client: Client) {
  const server = await client.request({ command: "server_info" })
  const ledger = server.result.info.validated_ledger
  return {
    base: Math.round((ledger?.reserve_base_xrp ?? 1) * 1_000_000),
    increment: Math.round((ledger?.reserve_inc_xrp ?? 0.2) * 1_000_000),
  }
}

export async function openLedgerFee(client: Client) {
  const fee = await client.request({ command: "fee" })
  return Math.max(Number(fee.result.drops.base_fee), Number(fee.result.drops.open_ledger_fee))
}

export async function validatedLedger(client: Client) {
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" })
  return Number(ledger.result.ledger_index)
}

export async function readTx(client: Client, hash: string) {
  try {
    const response = await client.request({ command: "tx", transaction: hash })
    return response.result
  } catch (error) {
    if (rippledCode(error) === "txnNotFound") return null
    throw error
  }
}

export function signedHash(blob: string) {
  return hashes.hashSignedTx(blob).toUpperCase()
}

export async function submitIdentical(client: Client, blob: string) {
  const hash = signedHash(blob)
  const existing = await readTx(client, hash)
  if (existing?.validated) {
    const result = transactionResult(existing)
    if (result === "tesSUCCESS") return { kind: "validated" as const, hash, tx: existing }
    return { kind: "failed" as const, hash, reason: `The transaction result was ${result ?? "unknown"}.` }
  }
  if (existing) return { kind: "pending" as const, hash }
  try {
    const submitted = await client.submit(blob)
    const engine = submitted.result.engine_result
    const disposition = submitDisposition(engine)
    if (disposition === "accepted" || disposition === "retry") return { kind: "pending" as const, hash }
    if (disposition === "sequence") {
      const found = await readTx(client, hash)
      if (found?.validated) {
        const result = transactionResult(found)
        if (result === "tesSUCCESS") return { kind: "validated" as const, hash, tx: found }
        return { kind: "failed" as const, hash, reason: `The transaction result was ${result ?? engine}.` }
      }
      if (found) return { kind: "pending" as const, hash }
      return { kind: "failed" as const, hash, reason: "The account sequence was used by another transaction." }
    }
    if (disposition === "expired") return { kind: "failed" as const, hash, reason: "The transaction expired before a ledger included it." }
    return { kind: "failed" as const, hash, reason: `The transaction was rejected (${engine}).` }
  } catch {
    return { kind: "unknown" as const, hash }
  }
}

export async function waitForValidation(client: Client, hash: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const found = await readTx(client, hash)
    if (found?.validated) return found
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return null
}

export async function issuanceOutstanding(client: Client, issuanceId: string) {
  try {
    const response = (await client.request({
      command: "ledger_entry",
      ledger_index: "validated",
      mpt_issuance: issuanceId,
    } as never)) as { result: { node?: Record<string, unknown> } }
    const node = response.result.node
    const raw = node?.OutstandingAmount ?? node?.outstanding_amount ?? "0"
    const amount = Number(raw)
    if (!Number.isFinite(amount)) throw new AuctionFailure("The MPT outstanding amount could not be read.")
    return amount
  } catch (error) {
    if (error instanceof AuctionFailure) throw error
    throw new AuctionFailure("The existing MPT could not be read.")
  }
}

export async function holderHasMpt(client: Client, account: string, issuanceId: string) {
  let marker: unknown
  do {
    const page = await client.request({
      command: "account_objects",
      account,
      ledger_index: "validated",
      type: "mptoken",
      limit: 200,
      ...(marker ? { marker: marker as never } : {}),
    })
    for (const entry of page.result.account_objects) {
      if ("MPTokenIssuanceID" in entry && String(entry.MPTokenIssuanceID).toUpperCase() === issuanceId.toUpperCase()) {
        return true
      }
    }
    marker = page.result.marker
  } while (marker)
  return false
}

export function issuanceFromValidated(tx: { meta?: unknown; tx_json?: unknown }, seller: string) {
  const fromMeta = issuanceIdFromMeta(tx.meta)
  if (fromMeta) return fromMeta
  const json = tx.tx_json
  if (!json || typeof json !== "object") return null
  const sequence = (json as { Sequence?: unknown }).Sequence
  if (typeof sequence !== "number") return null
  return mptIssuanceId(sequence, seller)
}

export function decodeBlob(blob: string) {
  return decode(blob) as Transaction & Record<string, unknown>
}

export function innerHashes(blob: string) {
  const tx = decodeBlob(blob)
  const raw = tx.RawTransactions as { RawTransaction: Transaction }[] | undefined
  return (raw ?? []).map((item) => hashes.hashSignedTx(encodeInner(item.RawTransaction)))
}

function encodeInner(tx: Transaction) {
  return encode(tx)
}
