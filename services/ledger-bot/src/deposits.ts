import { RLUSD_CURRENCY } from "@antecipa/xrpl"
import type { Transaction } from "xrpl"
import { db } from "./db"
import { rlusdIssuer, withClient } from "./xrpl-ops"

type PaymentAmount = { currency?: string; issuer?: string; value?: string }

function deliveredAmount(tx: Transaction, meta: unknown): string | null {
  if (typeof meta === "object" && meta && "delivered_amount" in meta) {
    const delivered = (meta as { delivered_amount: unknown }).delivered_amount
    if (typeof delivered === "object" && delivered && "value" in delivered) {
      return String((delivered as { value: string }).value)
    }
  }
  const amount = (tx as { Amount?: unknown }).Amount
  if (typeof amount === "object" && amount && "value" in amount) return String((amount as { value: string }).value)
  return null
}

export async function scanDepositsForInvestor(investorId: string): Promise<number> {
  const multisig = await db()
    .from("multisig_accounts")
    .select("id, classic_address")
    .eq("investor_id", investorId)
    .eq("role", "investor_wallet")
    .maybeSingle()
  if (multisig.error) throw new Error(multisig.error.message)
  if (!multisig.data) return 0

  const investor = await db().from("investors").select("own_xrpl_address").eq("id", investorId).maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  const own = investor.data?.own_xrpl_address as string | null
  if (!own) return 0

  const destinationId = multisig.data.id as string
  const destination = multisig.data.classic_address as string
  const issuer = rlusdIssuer()

  const found = await withClient(async (client) => {
    const page = await client.request({
      command: "account_tx",
      account: destination,
      ledger_index_min: -1,
      limit: 50,
    })
    const rows: { hash: string; amount: string }[] = []
    for (const item of page.result.transactions) {
      const tx = item.tx as Transaction | undefined
      if (!tx || tx.TransactionType !== "Payment") continue
      if (tx.Destination !== destination || tx.Account !== own) continue
      const amount = tx.Amount as string | PaymentAmount
      if (typeof amount !== "object") continue
      if (amount.currency !== RLUSD_CURRENCY || amount.issuer !== issuer) continue
      const meta = item.meta
      const code =
        typeof meta === "object" && meta && "TransactionResult" in meta
          ? String((meta as { TransactionResult: string }).TransactionResult)
          : null
      if (code && code !== "tesSUCCESS") continue
      const value = deliveredAmount(tx, meta)
      const hash = item.hash ?? (tx as { hash?: string }).hash
      if (!value || !hash) continue
      rows.push({ hash, amount: value })
    }
    return rows
  })

  let inserted = 0
  for (const row of found) {
    const existing = await db().from("deposits").select("id").eq("xrpl_tx_hash", row.hash).maybeSingle()
    if (existing.data) continue
    const write = await db().from("deposits").insert({
      investor_id: investorId,
      destination_multisig_id: destinationId,
      amount: row.amount,
      xrpl_tx_hash: row.hash,
      status: "confirmed",
    })
    if (write.error && !write.error.message.includes("duplicate")) throw new Error(write.error.message)
    if (!write.error) inserted += 1
  }
  return inserted
}

export async function scanAllDeposits() {
  const accounts = await db().from("multisig_accounts").select("investor_id").eq("role", "investor_wallet")
  if (accounts.error) throw new Error(accounts.error.message)
  for (const row of accounts.data ?? []) {
    if (!row.investor_id) continue
    await scanDepositsForInvestor(String(row.investor_id))
  }
}
