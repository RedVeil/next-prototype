import { fromMicro, toMicro } from "@antecipa/ledger-bot/chain"
import type { BucketRow } from "./records"

const CLOSED_INVOICE_STATUSES = new Set(["settled", "declined", "expired", "failed"])
const REALIZED_INVOICE_STATUSES = new Set(["repaid", "settled"])

export type PortfolioPoint = {
  capturedAt: string
  cash: string
  invoices: string
  portfolio: string
}

export type DashboardPosition = {
  id: string
  buyerName: string
  bucketName: string
  faceAmount: string
  currency: string
  expectedRepaymentRlusd: string | null
  dueDate: string | null
  status: string
}

export type DashboardHistoryItem = {
  id: string
  type: "deposit" | "withdrawal" | "purchase" | "repayment"
  amount: string | null
  unit: string
  at: string | null
  status: string
  txHash: string | null
  detail: string
}

export type DashboardStats = {
  profitLoss: string | null
  volume: string
  positions: number
  biggestWin: string | null
  joined: string | null
}

export type InvestorDashboard = {
  legalName: string
  accessStatus: "allowed" | "stopped"
  botPaused: boolean
  ownAddress: string | null
  multisigAddress: string | null
  balance: string | null
  reserved: string
  balanceError: string | null
  provisionStatus: string | null
  provisionError: string | null
  invoicesValue: string
  portfolio: string | null
  series: PortfolioPoint[]
  buckets: BucketRow[]
  positions: DashboardPosition[]
  history: DashboardHistoryItem[]
  stats: DashboardStats
}

type Embedded<T> = T | T[] | null

export type DashboardPurchase = {
  id: string
  bucket_id: string
  invoice_id: string
  amount_usd: string | number
  expected_repayment_rlusd: string | number | null
  created_at: string
  buckets: Embedded<{ name: string }>
  invoices: Embedded<{
    buyer_name: string
    currency: string
    amount: string | number
    due_date: string | null
    status: string
    document_id: string
  }>
}

export type DashboardOffer = {
  invoice_id: string
  bucket_id: string
  due_date: string
  created_at: string
}

export type DashboardCashMovement = {
  id: string
  amount: string | number
  status: string
  xrpl_tx_hash: string | null
  created_at: string
}

export type DashboardReservation = {
  id: string
  invoice_id: string
  amount: string | number
  created_at: string
}

export type DashboardRepayment = {
  id: string
  invoice_id: string | null
  amount: string | number | null
  status: string
  xrpl_tx_hash: string | null
  created_at: string
}

function one<T>(value: Embedded<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function moneyText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  return String(value)
}

function repaymentReceived(status: string, hash: string | null) {
  if (hash) return true
  return status === "confirmed" || status === "succeeded" || status === "paid"
}

export function assembleInvestorActivity(input: {
  purchases: DashboardPurchase[]
  offers: DashboardOffer[]
  deposits: DashboardCashMovement[]
  withdrawals: DashboardCashMovement[]
  reservations: DashboardReservation[]
  repayments: DashboardRepayment[]
  joined: string | null
}): {
  positions: DashboardPosition[]
  history: DashboardHistoryItem[]
  stats: DashboardStats
  openInvoicesRlusd: string
} {
  const offersByPurchase = new Map<string, DashboardOffer>()
  for (const offer of input.offers) {
    const key = `${offer.invoice_id}:${offer.bucket_id}`
    const current = offersByPurchase.get(key)
    if (!current || offer.created_at > current.created_at) offersByPurchase.set(key, offer)
  }

  const positions: DashboardPosition[] = []
  let openInvoices = BigInt(0)
  const realizedInvoices = new Set<string>()

  for (const purchase of input.purchases) {
    const invoice = one(purchase.invoices)
    const bucket = one(purchase.buckets)
    const status = invoice?.status ?? ""
    if (REALIZED_INVOICE_STATUSES.has(status)) realizedInvoices.add(purchase.invoice_id)
    if (CLOSED_INVOICE_STATUSES.has(status)) continue

    const expected = moneyText(purchase.expected_repayment_rlusd)
    if (expected) openInvoices += toMicro(expected)
    const offer = offersByPurchase.get(`${purchase.invoice_id}:${purchase.bucket_id}`)
    positions.push({
      id: String(purchase.id),
      buyerName: invoice?.buyer_name?.trim() || invoice?.document_id || "Invoice",
      bucketName: bucket?.name ?? "Bucket",
      faceAmount: invoice ? String(invoice.amount) : "0",
      currency: invoice?.currency ?? "",
      expectedRepaymentRlusd: expected,
      dueDate: invoice?.due_date ?? offer?.due_date ?? null,
      status: status || "unknown",
    })
  }

  const costByInvoice = new Map<string, bigint>()
  let volume = BigInt(0)
  for (const reservation of input.reservations) {
    const amount = toMicro(reservation.amount)
    volume += amount
    if (!realizedInvoices.has(reservation.invoice_id)) continue
    costByInvoice.set(reservation.invoice_id, (costByInvoice.get(reservation.invoice_id) ?? BigInt(0)) + amount)
  }

  const receivedByInvoice = new Map<string, bigint>()
  for (const payout of input.repayments) {
    if (!payout.invoice_id || !costByInvoice.has(payout.invoice_id)) continue
    if (!repaymentReceived(payout.status, payout.xrpl_tx_hash)) continue
    receivedByInvoice.set(
      payout.invoice_id,
      (receivedByInvoice.get(payout.invoice_id) ?? BigInt(0)) + toMicro(payout.amount),
    )
  }

  let profit = BigInt(0)
  let counted = false
  let biggest: bigint | null = null
  for (const [invoiceId, cost] of costByInvoice) {
    const gain = (receivedByInvoice.get(invoiceId) ?? BigInt(0)) - cost
    profit += gain
    counted = true
    if (gain > BigInt(0) && (biggest === null || gain > biggest)) biggest = gain
  }

  const history: DashboardHistoryItem[] = []
  for (const deposit of input.deposits) {
    history.push({
      id: `deposit:${deposit.id}`,
      type: "deposit",
      amount: String(deposit.amount),
      unit: "RLUSD",
      at: deposit.created_at,
      status: deposit.status,
      txHash: deposit.xrpl_tx_hash,
      detail: "Deposit to multisig 1",
    })
  }
  for (const withdrawal of input.withdrawals) {
    history.push({
      id: `withdrawal:${withdrawal.id}`,
      type: "withdrawal",
      amount: String(withdrawal.amount),
      unit: "RLUSD",
      at: withdrawal.created_at,
      status: withdrawal.status,
      txHash: withdrawal.xrpl_tx_hash,
      detail: "Withdrawal to own account",
    })
  }
  for (const purchase of input.purchases) {
    const invoice = one(purchase.invoices)
    const bucket = one(purchase.buckets)
    const expected = moneyText(purchase.expected_repayment_rlusd)
    const buyer = invoice?.buyer_name?.trim() || invoice?.document_id || "Invoice"
    history.push({
      id: `purchase:${purchase.id}`,
      type: "purchase",
      amount: expected ?? String(purchase.amount_usd),
      unit: expected ? "RLUSD" : "USD",
      at: purchase.created_at,
      status: "bought",
      txHash: null,
      detail: `${buyer} · ${bucket?.name ?? "Bucket"}`,
    })
  }
  for (const payout of input.repayments) {
    const purchase = input.purchases.find((item) => item.invoice_id === payout.invoice_id)
    const invoice = purchase ? one(purchase.invoices) : null
    history.push({
      id: `repayment:${payout.id}`,
      type: "repayment",
      amount: moneyText(payout.amount),
      unit: "RLUSD",
      at: payout.created_at,
      status: payout.status,
      txHash: payout.xrpl_tx_hash,
      detail: invoice?.buyer_name?.trim() || invoice?.document_id || "Repayment",
    })
  }
  history.sort((left, right) => {
    const leftAt = left.at ? Date.parse(left.at) : 0
    const rightAt = right.at ? Date.parse(right.at) : 0
    return rightAt - leftAt
  })

  return {
    positions,
    history,
    openInvoicesRlusd: fromMicro(openInvoices),
    stats: {
      profitLoss: counted ? fromMicro(profit) : null,
      volume: fromMicro(volume),
      positions: positions.length,
      biggestWin: biggest === null ? null : fromMicro(biggest),
      joined: input.joined,
    },
  }
}
