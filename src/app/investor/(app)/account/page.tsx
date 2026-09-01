"use client"

import { useState } from "react"
import { availableCapital } from "@/lib/capital"
import { formatRLUSD } from "@/lib/format"
import { useStore } from "@/lib/store"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

type DialogMode = "deposit" | "withdraw" | null

function parseAmount(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AccountPage() {
  const { investor, wallet, kybStatus, deposit, withdraw } = useStore()
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [amount, setAmount] = useState(0)

  if (!investor) return null

  const available = availableCapital(investor)
  const freeRlUsd = wallet.connected ? wallet.balance : 0
  const canDeposit = wallet.connected && freeRlUsd > 0
  const canWithdraw = wallet.connected && available > 0

  const depositMax = freeRlUsd
  const withdrawMax = available
  const max = dialog === "deposit" ? depositMax : withdrawMax
  const clamped = Math.min(Math.max(0, amount), max)
  const canConfirm = clamped > 0

  const nextFree =
    dialog === "deposit" ? freeRlUsd - clamped : dialog === "withdraw" ? freeRlUsd + clamped : freeRlUsd
  const nextCommitted =
    dialog === "deposit"
      ? investor.committedCapital + clamped
      : dialog === "withdraw"
        ? investor.committedCapital - clamped
        : investor.committedCapital
  const nextAvailable =
    dialog === "deposit" ? available + clamped : dialog === "withdraw" ? available - clamped : available

  function openDialog(mode: "deposit" | "withdraw") {
    setAmount(mode === "deposit" ? depositMax : withdrawMax)
    setDialog(mode)
  }

  function closeDialog() {
    setDialog(null)
    setAmount(0)
  }

  function confirm() {
    if (!canConfirm) return
    if (dialog === "deposit") deposit(clamped)
    if (dialog === "withdraw") withdraw(clamped)
    closeDialog()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Onboarding status, settlement wallet, and RLUSD deposited as committed capital.
        </p>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Organization</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Legal name</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{investor.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">CNPJ</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{investor.cnpj}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">KYB</dt>
            <dd className="mt-1">
              <StatusBadge tone={kybStatus === "approved" ? "positive" : "warning"}>
                {kybStatus === "approved" ? "Verified" : "Pending"}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">AML</dt>
            <dd className="mt-1">
              <StatusBadge tone={investor.status === "verified" ? "positive" : "warning"}>
                {investor.status === "verified" ? "Passed" : "Pending"}
              </StatusBadge>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Investor classification</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{investor.classification}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Wallet</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">XRPL wallet</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {wallet.connected ? wallet.address : "Not connected"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Network</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{wallet.network || "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Free RLUSD</dt>
            <dd className="mt-0.5 text-lg font-semibold text-neutral-900">{formatRLUSD(freeRlUsd)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="mt-1">
              <StatusBadge tone={wallet.connected ? "positive" : "warning"}>
                {wallet.connected ? "Verified" : "Not connected"}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Wallet ownership</dt>
            <dd className="mt-1">
              <StatusBadge tone={wallet.connected ? "positive" : "warning"}>
                {wallet.connected ? "Confirmed" : "Pending"}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Wallet screening</dt>
            <dd className="mt-1">
              <StatusBadge tone={wallet.connected ? "positive" : "warning"}>
                {wallet.connected ? "Passed" : "Pending"}
              </StatusBadge>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Capital</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Committed</dt>
            <dd className="mt-0.5 text-lg font-semibold text-neutral-900">
              {formatRLUSD(investor.committedCapital)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Deployed</dt>
            <dd className="mt-0.5 text-lg font-semibold text-neutral-900">
              {formatRLUSD(investor.deployedCapital)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Available</dt>
            <dd className="mt-0.5 text-lg font-semibold text-neutral-900">{formatRLUSD(available)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Investment buckets draw from deposited RLUSD, not from the free balance in your wallet.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canDeposit}
            onClick={() => openDialog("deposit")}
            className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
          >
            Deposit
          </button>
          <button
            type="button"
            disabled={!canWithdraw}
            onClick={() => openDialog("withdraw")}
            className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:text-neutral-400"
          >
            Withdraw
          </button>
        </div>
      </section>

      {dialog && (
        <ConfirmDialog
          title={dialog === "deposit" ? "Deposit RLUSD" : "Withdraw RLUSD"}
          confirmLabel={dialog === "deposit" ? "Deposit" : "Withdraw"}
          confirmDisabled={!canConfirm}
          onClose={closeDialog}
          onConfirm={confirm}
        >
          <p className="text-neutral-600">
            {dialog === "deposit"
              ? `Up to ${formatRLUSD(depositMax)} in the connected wallet.`
              : `Up to ${formatRLUSD(withdrawMax)} available. Deployed capital stays invested.`}
          </p>
          <p className="mt-3 text-xs text-neutral-500">This is a mock transfer. No XRPL transaction is signed.</p>
          <label className="mt-4 block text-sm text-neutral-600">
            Amount
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                step={1000}
                value={amount}
                onChange={(event) => setAmount(parseAmount(event.target.value))}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => setAmount(max)}
                className="inline-flex h-10 shrink-0 items-center rounded-md border border-border px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
              >
                Max
              </button>
            </div>
          </label>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Free RLUSD after</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">{formatRLUSD(nextFree)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Committed after</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">{formatRLUSD(nextCommitted)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Available after</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">{formatRLUSD(nextAvailable)}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}
