import { Client } from "xrpl"

const UNKNOWN_LEDGER_LIMIT_MS = 90_000
const CONNECT_LIMIT_MS = 180_000

export type WatchOutcome =
  | { status: "included"; lastLedger: number | null }
  | { status: "rejected"; detail: string }
  | { status: "unavailable"; detail: string }
  | { status: "stopped" }

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function txnNotFound(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = error.data
  return Boolean(data && typeof data === "object" && "error" in data && data.error === "txnNotFound")
}

function resultCode(meta: unknown) {
  if (!meta || typeof meta !== "object") return ""
  const code = (meta as { TransactionResult?: unknown }).TransactionResult
  return typeof code === "string" ? code : ""
}

function lastLedgerFrom(tx: unknown) {
  if (!tx || typeof tx !== "object") return null
  const row = tx as { LastLedgerSequence?: unknown; tx_json?: unknown }
  if (typeof row.LastLedgerSequence === "number") return row.LastLedgerSequence
  if (!row.tx_json || typeof row.tx_json !== "object") return null
  const sequence = (row.tx_json as { LastLedgerSequence?: unknown }).LastLedgerSequence
  return typeof sequence === "number" ? sequence : null
}

export function lastLedgerSequence(tx: unknown) {
  if (!tx || typeof tx !== "object") return null
  const sequence = (tx as { LastLedgerSequence?: unknown }).LastLedgerSequence
  return typeof sequence === "number" && Number.isFinite(sequence) ? sequence : null
}

export async function watchFundsTransaction(
  socketUrl: string,
  hash: string,
  lastLedger: number | null,
  signal: AbortSignal,
): Promise<WatchOutcome> {
  if (!socketUrl) return { status: "rejected", detail: "The ledger connection is not configured." }
  const client = new Client(socketUrl)
  const started = Date.now()
  let expiry = lastLedger
  try {
    while (!signal.aborted) {
      if (!client.isConnected()) {
        try {
          await client.connect()
        } catch {
          if (Date.now() - started > (expiry === null ? UNKNOWN_LEDGER_LIMIT_MS : CONNECT_LIMIT_MS)) {
            return { status: "unavailable", detail: "The ledger connection failed." }
          }
          await delay(1000, signal)
          continue
        }
      }
      const outcome = await readValidated(client, hash)
      if (outcome.status === "included" || outcome.status === "rejected") {
        return outcome.status === "included" ? { status: "included", lastLedger: outcome.lastLedger ?? expiry } : outcome
      }
      if (outcome.lastLedger !== null) expiry = outcome.lastLedger
      if (signal.aborted) return { status: "stopped" }
      let latest = 0
      try {
        latest = await client.getLedgerIndex()
      } catch {
        latest = 0
      }
      if (expiry !== null && latest > expiry) {
        const again = await readValidated(client, hash)
        if (again.status === "included" || again.status === "rejected") {
          return again.status === "included" ? { status: "included", lastLedger: again.lastLedger ?? expiry } : again
        }
        return { status: "rejected", detail: "The payment was not included before it expired." }
      }
      if (expiry === null && Date.now() - started > UNKNOWN_LEDGER_LIMIT_MS) {
        return { status: "rejected", detail: "The payment was not included before it expired." }
      }
      await delay(1000, signal)
    }
    return { status: "stopped" }
  } finally {
    if (client.isConnected()) await client.disconnect()
  }
}

async function readValidated(
  client: Client,
  hash: string,
): Promise<{ status: "included"; lastLedger: number | null } | { status: "rejected"; detail: string } | { status: "pending"; lastLedger: number | null }> {
  try {
    const found = (await client.request({ command: "tx", transaction: hash })).result
    const lastLedger = lastLedgerFrom(found)
    if (!found.validated) return { status: "pending", lastLedger }
    const code = resultCode(found.meta)
    if (code === "tesSUCCESS") return { status: "included", lastLedger }
    return { status: "rejected", detail: code || "The ledger rejected the transaction." }
  } catch (error) {
    if (txnNotFound(error)) return { status: "pending", lastLedger: null }
    return { status: "pending", lastLedger: null }
  }
}
