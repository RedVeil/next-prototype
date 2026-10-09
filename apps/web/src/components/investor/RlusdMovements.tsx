"use client"

import { useState } from "react"
import { checkDeposits, setBotPaused, withdrawRlusd } from "@/lib/actions"

export type DepositListItem = {
  id: string
  amount: string
  status: string
  hash: string | null
}

export function DepositControls({
  multisigAddress,
  deposits,
  onReload,
  showAddress = true,
}: {
  multisigAddress: string
  deposits: DepositListItem[]
  onReload: () => Promise<void>
  showAddress?: boolean
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <p className="text-sm text-neutral-600">
        From your own wallet, pay RLUSD to multisig 1. The issuer is the official mainnet issuer. Your account needs a trust line first. Then check for the payment here.
      </p>
      {showAddress && <p className="mt-3 break-all text-sm font-medium text-neutral-900">{multisigAddress}</p>}
      <button
        type="button"
        className="mt-3 inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium"
        onClick={async () => {
          const result = await checkDeposits()
          if (!result.ok) {
            setError(result.error)
            setMessage(null)
            return
          }
          setError(null)
          setMessage(result.message ?? "Checked.")
          await onReload()
        }}
      >
        Check for deposits
      </button>
      {deposits.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {deposits.map((deposit) => (
            <li key={deposit.id}>
              {deposit.amount} RLUSD · {deposit.status}
              {deposit.hash ? ` · ${deposit.hash}` : ""}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
    </div>
  )
}

export function WithdrawControls({
  paused,
  onReload,
  onRefreshSession,
}: {
  paused: boolean
  onReload: () => Promise<void>
  onRefreshSession: () => Promise<void>
}) {
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pauseOverride, setPauseOverride] = useState<{ from: boolean; local: boolean } | null>(null)
  const investmentsPaused = pauseOverride?.from === paused ? pauseOverride.local : paused

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">Investments are {investmentsPaused ? "paused" : "running"}.</p>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium"
          onClick={async () => {
            const next = !investmentsPaused
            const result = await setBotPaused(next)
            if (!result.ok) {
              setError(result.error)
              return
            }
            setError(null)
            setPauseOverride({ from: paused, local: next })
            await onRefreshSession()
            await onReload()
          }}
        >
          {investmentsPaused ? "Resume Investments" : "Pause Investments"}
        </button>
      </div>
      <label className="mt-6 block text-sm text-neutral-600">
        Withdraw amount
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-border px-3 py-2"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!investmentsPaused || !amount || submitting}
          className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:bg-neutral-400"
          onClick={async () => {
            setError(null)
            setSubmitting(true)
            try {
              const result = await withdrawRlusd(amount)
              if (!result.ok) setError(result.error)
              else {
                setMessage(`Submitted ${result.hash}`)
                setAmount("")
                await onReload()
              }
            } catch (cause: unknown) {
              setError(cause instanceof Error ? cause.message : "The withdrawal could not be submitted.")
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {submitting ? "Submitting withdrawal…" : "Withdraw"}
        </button>
      </div>
      {!investmentsPaused && (
        <p className="mt-3 text-sm text-neutral-500">Pause investments before withdrawing so the bot cannot reserve those funds at the same time.</p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
    </div>
  )
}
