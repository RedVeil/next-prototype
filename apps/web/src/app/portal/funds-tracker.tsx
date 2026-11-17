"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { isWalletError, WalletErrorCode } from "xrpl-connect"
import { recordFunds, submitWithdrawal } from "./dashboard-actions"
import { lastLedgerSequence, watchFundsTransaction } from "./funds-watch"

export type FundsKind = "deposit" | "withdrawal"

export type SignedFunds = {
  hash: string
  tx_blob?: string
  tx_json?: unknown
}

type ToastStatus = "signing" | "rejected" | "accepted" | "included" | "recorded" | "failed"

type FundsToast = {
  id: string
  kind: FundsKind
  amount: string
  status: ToastStatus
  detail: string
  hash?: string
  retryable: boolean
}

type StoredPayment = {
  id: string
  kind: FundsKind
  amount: string
  hash: string
  lastLedger: number | null
  status: "accepted" | "included"
}

const STORAGE_KEY = "funds-payments"

let toasts: FundsToast[] = []
let socketUrl = ""
const listeners = new Set<() => void>()
const refreshed = new Set<string>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getToasts() {
  return toasts
}

function patchToast(id: string, patch: Partial<FundsToast>) {
  toasts = toasts.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast))
  emit()
}

function signFailure(error: unknown) {
  if (isWalletError(error) && error.code === WalletErrorCode.SIGN_REJECTED) {
    return "The wallet rejected the transaction."
  }
  return error instanceof Error ? error.message : "The payment could not be sent."
}

function readStored(): StoredPayment[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is StoredPayment => {
      if (!entry || typeof entry !== "object") return false
      const row = entry as StoredPayment
      return (
        typeof row.id === "string" &&
        (row.kind === "deposit" || row.kind === "withdrawal") &&
        typeof row.amount === "string" &&
        typeof row.hash === "string" &&
        (row.status === "accepted" || row.status === "included") &&
        (row.lastLedger === null || typeof row.lastLedger === "number")
      )
    })
  } catch {
    return []
  }
}

function writeStored(payments: StoredPayment[]) {
  try {
    if (payments.length === 0) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payments))
  } catch {
    // The ledger watch still runs when the browser refuses session storage.
  }
}

function saveStored(payment: StoredPayment) {
  const payments = readStored().filter((entry) => entry.hash !== payment.hash)
  payments.push(payment)
  writeStored(payments)
}

function clearStored(hash: string) {
  writeStored(readStored().filter((entry) => entry.hash !== hash))
}

let claimToken = 0
const claims = new Map<string, number>()

function claim(hash: string) {
  if (claims.has(hash)) return 0
  claimToken += 1
  claims.set(hash, claimToken)
  return claimToken
}

function release(hash: string, token: number) {
  if (claims.get(hash) === token) claims.delete(hash)
}

function canonicalHash(hash: string) {
  const trimmed = hash.trim()
  if (!/^[A-Fa-f0-9]{64}$/.test(trimmed)) return null
  return trimmed.toUpperCase()
}

function kindLabel(kind: FundsKind) {
  return kind === "deposit" ? "Deposit" : "Withdrawal"
}

async function writeRecord(toast: FundsToast, hash: string) {
  patchToast(toast.id, {
    status: "included",
    hash,
    detail: "Included in a validated ledger. Updating the portfolio.",
    retryable: false,
  })
  const result = await recordFunds(toast.kind, hash)
  if (result.pending) return "pending"
  if (result.error) {
    patchToast(toast.id, {
      status: "failed",
      hash,
      detail: result.error,
      retryable: true,
    })
    return "failed"
  }
  clearStored(hash)
  patchToast(toast.id, {
    status: "recorded",
    hash,
    detail: "The portfolio is updated.",
    retryable: false,
  })
  return "recorded"
}

async function settleRecord(toast: FundsToast, hash: string) {
  let outcome: "pending" | "failed" | "recorded" = "pending"
  for (let attempt = 0; attempt < 15 && outcome === "pending"; attempt += 1) {
    outcome = await writeRecord(toast, hash)
    if (outcome === "pending") await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (outcome === "pending") {
    patchToast(toast.id, {
      status: "failed",
      hash,
      detail: "The payment is not in a validated ledger yet.",
      retryable: true,
    })
  }
}

async function followHash(toast: FundsToast, hash: string, lastLedger: number | null, phase: "accepted" | "included") {
  const token = claim(hash)
  if (!token) {
    const ownedElsewhere = toasts.some((entry) => entry.id !== toast.id && entry.hash === hash)
    if (ownedElsewhere || toast.hash !== hash) {
      toasts = toasts.filter((entry) => entry.id !== toast.id)
      emit()
    }
    return
  }
  try {
    if (phase === "accepted") {
      const stored: StoredPayment = {
        id: toast.id,
        kind: toast.kind,
        amount: toast.amount,
        hash,
        lastLedger,
        status: "accepted",
      }
      saveStored(stored)
      patchToast(toast.id, {
        status: "accepted",
        hash,
        detail: "The ledger accepted the payment. Waiting for a validated ledger.",
        retryable: false,
      })
      const watched = await watchFundsTransaction(socketUrl, hash, lastLedger, new AbortController().signal)
      if (watched.status === "stopped") return
      if (watched.status === "unavailable") {
        patchToast(toast.id, { status: "failed", hash, detail: watched.detail, retryable: true })
        return
      }
      if (watched.status === "rejected") {
        clearStored(hash)
        patchToast(toast.id, { status: "rejected", hash, detail: watched.detail, retryable: false })
        return
      }
      saveStored({ ...stored, lastLedger: watched.lastLedger, status: "included" })
    }
    await settleRecord(toast, hash)
  } finally {
    release(hash, token)
  }
}

async function followSign(toast: FundsToast, sign: Promise<SignedFunds>) {
  try {
    const signed = await sign
    const lastLedger = lastLedgerSequence(signed.tx_json)
    const hash = canonicalHash(signed.hash)
    if (toast.kind === "deposit") {
      if (!hash) throw new Error("The wallet did not return a transaction hash.")
      await followHash(toast, hash, lastLedger, "accepted")
      return
    }
    if (!signed.tx_blob) throw new Error("The wallet did not return a signed transaction.")
    patchToast(toast.id, { detail: "Signed. Sending the payment." })
    const submitted = await submitWithdrawal(signed.tx_blob)
    const submittedHash = canonicalHash(submitted.hash ?? "")
    if (submitted.error || !submittedHash) {
      patchToast(toast.id, {
        status: "rejected",
        detail: submitted.error || "The ledger rejected the transaction.",
        retryable: false,
      })
      return
    }
    await followHash(toast, submittedHash, lastLedger, "accepted")
  } catch (error) {
    patchToast(toast.id, { status: "rejected", detail: signFailure(error), retryable: false })
  }
}

function resumeStored() {
  for (const payment of readStored()) {
    if (claims.has(payment.hash)) continue
    const existing = toasts.find((toast) => toast.hash === payment.hash)
    const toast: FundsToast = existing ?? {
      id: payment.id,
      kind: payment.kind,
      amount: payment.amount,
      status: payment.status,
      hash: payment.hash,
      detail:
        payment.status === "included"
          ? "Included in a validated ledger. Updating the portfolio."
          : "The ledger accepted the payment. Waiting for a validated ledger.",
      retryable: false,
    }
    if (!existing) {
      toasts = [...toasts, toast]
      emit()
    }
    void followHash(toast, payment.hash, payment.lastLedger, payment.status)
  }
}

export function trackFundsPayment(input: { kind: FundsKind; amount: string; sign: Promise<SignedFunds> }) {
  const toast: FundsToast = {
    id: crypto.randomUUID(),
    kind: input.kind,
    amount: input.amount,
    status: "signing",
    detail: "Waiting for you to sign in Xaman.",
    retryable: false,
  }
  toasts = [...toasts, toast]
  emit()
  void followSign(toast, input.sign)
}

export function retryFundsRecord(id: string) {
  const toast = toasts.find((entry) => entry.id === id)
  if (!toast?.hash || !toast.retryable) return
  const stored = readStored().find((entry) => entry.hash === toast.hash)
  const phase = stored?.status ?? "included"
  void followHash(toast, toast.hash, stored?.lastLedger ?? null, phase)
}

export function dismissFundsToast(id: string) {
  const toast = toasts.find((entry) => entry.id === id)
  if (!toast) return
  if (toast.status !== "rejected" && toast.status !== "recorded" && toast.status !== "failed") return
  toasts = toasts.filter((entry) => entry.id !== id)
  emit()
}

const STATUS_LABEL: Record<ToastStatus, string> = {
  signing: "Signing",
  rejected: "Rejected",
  accepted: "Accepted",
  included: "Included",
  recorded: "Recorded",
  failed: "Portfolio update failed",
}

export function FundsTracker({ socketUrl: nextSocketUrl, children }: { socketUrl: string; children: ReactNode }) {
  const router = useRouter()
  const current = useSyncExternalStore(subscribe, getToasts, getToasts)
  socketUrl = nextSocketUrl

  useEffect(() => {
    resumeStored()
  }, [nextSocketUrl])

  useEffect(() => {
    let recorded = false
    for (const toast of current) {
      if (toast.status === "recorded" && !refreshed.has(toast.id)) {
        refreshed.add(toast.id)
        recorded = true
      }
    }
    if (recorded) router.refresh()
  }, [current, router])

  return (
    <>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] grid w-80 gap-2">
        {current.map((toast) => (
          <article key={toast.id} className="pointer-events-auto rounded-lg border border-border bg-white p-3 shadow-lg">
            <p className="text-sm font-medium text-neutral-900">
              {kindLabel(toast.kind)} · {STATUS_LABEL[toast.status]}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {toast.amount} RLUSD. {toast.detail}
            </p>
            {toast.hash ? <p className="mt-1 font-mono text-[11px] break-all text-neutral-500">{toast.hash}</p> : null}
            {toast.retryable || toast.status === "rejected" || toast.status === "recorded" || toast.status === "failed" ? (
              <div className="mt-2 flex gap-3 text-sm">
                {toast.retryable ? (
                  <button type="button" onClick={() => retryFundsRecord(toast.id)} className="underline">
                    Try again
                  </button>
                ) : null}
                {toast.status === "rejected" || toast.status === "recorded" || toast.status === "failed" ? (
                  <button type="button" onClick={() => dismissFundsToast(toast.id)} className="underline">
                    Dismiss
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </>
  )
}
