"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { getInvestorDashboard } from "@/lib/actions"
import type { DashboardHistoryItem, InvestorDashboard as DashboardData } from "@/lib/investor-dashboard"
import { formatAmount, formatDateOnly, formatJoined, formatSignedAmount, formatWhen } from "@/lib/format"
import { BucketList } from "@/components/investor/BucketList"
import { DepositControls, WithdrawControls } from "@/components/investor/RlusdMovements"
import { Dialog } from "@/components/ui/Dialog"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { useSession } from "@/lib/session"
import { CHART_RANGES, PortfolioChart, pointsInRange, rangeChange, type ChartRange, type ChartSeriesKey } from "./PortfolioChart"

const TABS = [
  { id: "buckets", label: "Buckets" },
  { id: "positions", label: "Positions" },
  { id: "history", label: "History" },
  { id: "stats", label: "Stats" },
] as const

type TabId = (typeof TABS)[number]["id"]

const HISTORY_LABEL: Record<DashboardHistoryItem["type"], string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  purchase: "Bought invoice",
  repayment: "Repayment",
}

function parseTab(value: string | null): TabId {
  if (value === "positions" || value === "history" || value === "stats" || value === "buckets") return value
  return "buckets"
}

function statusTone(status: string): "positive" | "warning" | "danger" | "neutral" {
  if (status === "repaid" || status === "settled" || status === "active" || status === "confirmed" || status === "bought") return "positive"
  if (status === "failed" || status === "declined" || status === "expired") return "danger"
  if (status === "paused" || status === "pending") return "warning"
  return "neutral"
}

export function InvestorDashboard({
  readOnly = false,
  initialData = null,
}: {
  readOnly?: boolean
  initialData?: DashboardData | null
}) {
  const { session, refresh } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get("tab"))
  const [data, setData] = useState<DashboardData | null>(initialData)
  const [error, setError] = useState<string | null>(null)
  const [movement, setMovement] = useState<"deposit" | "withdraw" | null>(null)
  const [range, setRange] = useState<ChartRange>("ALL")
  const [visible, setVisible] = useState<Record<ChartSeriesKey, boolean>>({ cash: true, invoices: true, portfolio: true })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (readOnly) return
    let cancelled = false
    void getInvestorDashboard()
      .then((next) => {
        if (!cancelled) {
          setData(next)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the dashboard")
      })
    return () => {
      cancelled = true
    }
  }, [readOnly, reloadToken])

  function selectTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "buckets") params.delete("tab")
    else params.set("tab", next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  async function reload() {
    setReloadToken((value) => value + 1)
  }

  const stopped = session.investor?.access_status === "stopped" || data?.accessStatus === "stopped"
  const ranged = data ? pointsInRange(data.series, range) : []
  const change = rangeChange(ranged)
  const rangeCaption = CHART_RANGES.find((item) => item.id === range)?.caption ?? "All time"
  const deposits = (data?.history ?? [])
    .filter((item) => item.type === "deposit")
    .map((item) => ({
      id: item.id,
      amount: item.amount ?? "0",
      status: item.status,
      hash: item.txHash,
    }))

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{data?.legalName ?? session.investor?.legal_name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {stopped ? "Access is stopped." : "Access is allowed."} Investments are {(data?.botPaused ?? session.investor?.bot_paused) ? "paused" : "running"}.
      </p>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="mt-6 text-sm text-neutral-500">Loading dashboard…</p>}
      {data && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="flex flex-col rounded-lg border border-border bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Available RLUSD</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatAmount(data.balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Reserved</p>
                  <p className="mt-2 text-lg font-semibold tracking-tight tabular-nums">{formatAmount(data.reserved)}</p>
                </div>
              </div>
              {data.balanceError && <p className="mt-3 text-sm text-red-700">{data.balanceError}</p>}
              {!data.multisigAddress && (
                <p className="mt-3 text-sm text-neutral-600">
                  Multisig 1 is not ready. Provisioning is {data.provisionStatus ?? "not queued"}.
                  {data.provisionError ? ` ${data.provisionError}` : ""}
                </p>
              )}
              {stopped && <p className="mt-3 text-sm text-neutral-600">Deposits and withdrawals stay closed while this investor is stopped.</p>}
              {!readOnly && (
                <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                  <button
                    type="button"
                    disabled={stopped}
                    onClick={() => setMovement("deposit")}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:bg-neutral-400"
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    disabled={stopped}
                    onClick={() => setMovement("withdraw")}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium disabled:text-neutral-400"
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </section>
            <section className="rounded-lg border border-border bg-white p-5">
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Portfolio</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatAmount(data.portfolio)}</p>
              <p className={`mt-1 text-sm ${change && change.delta > 0 ? "text-emerald-700" : change && change.delta < 0 ? "text-red-700" : "text-neutral-500"}`}>
                {data.series.length === 0
                  ? "No portfolio history yet"
                  : change
                    ? `${formatSignedAmount(change.delta)}${change.percent === null ? "" : ` (${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)}%)`}`
                    : "No snapshots in this range"}
                {data.series.length > 0 && <span className="text-neutral-500"> · {rangeCaption}</span>}
              </p>
              <div className="mt-4">
                {data.series.length === 0 ? (
                  <p className="flex h-48 items-center justify-center text-sm text-neutral-500">No portfolio history yet.</p>
                ) : (
                  <PortfolioChart
                    points={ranged}
                    range={range}
                    visible={visible}
                    onRange={setRange}
                    onToggle={(key) => setVisible((current) => ({ ...current, [key]: !current[key] }))}
                  />
                )}
              </div>
            </section>
          </div>

          <div className="mt-8 flex w-full items-end justify-between border-b border-border" role="tablist">
            {TABS.map((item) => {
              const selected = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(item.id)}
                  className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium tracking-wide whitespace-nowrap ${
                    selected ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="mt-6" role="tabpanel">
            {tab === "buckets" && (
              <BucketList readOnly={readOnly} buckets={readOnly ? data.buckets : undefined} stopped={data.accessStatus === "stopped"} />
            )}
            {tab === "positions" && <Positions positions={data.positions} />}
            {tab === "history" && <History items={data.history} />}
            {tab === "stats" && <Stats stats={data.stats} />}
          </div>

          {!readOnly && movement === "deposit" && (
            <Dialog title="Deposit" description="Send RLUSD to multisig 1, then check for the payment." onClose={() => setMovement(null)}>
              {data.multisigAddress ? (
                <DepositControls multisigAddress={data.multisigAddress} deposits={deposits} onReload={reload} />
              ) : (
                <p className="text-sm text-neutral-600">
                  Multisig 1 is not ready. Provisioning is {data.provisionStatus ?? "not queued"}.
                  {data.provisionError ? ` ${data.provisionError}` : ""}
                </p>
              )}
            </Dialog>
          )}
          {!readOnly && movement === "withdraw" && (
            <Dialog title="Withdraw" description="Pause investments, then withdraw unreserved RLUSD back to your account." onClose={() => setMovement(null)}>
              {data.multisigAddress ? (
                <WithdrawControls paused={data.botPaused} onReload={reload} onRefreshSession={refresh} />
              ) : (
                <p className="text-sm text-neutral-600">Multisig 1 is not ready, so there is nothing to withdraw yet.</p>
              )}
            </Dialog>
          )}
        </>
      )}
    </div>
  )
}

function Positions({ positions }: { positions: DashboardData["positions"] }) {
  if (positions.length === 0) return <p className="text-sm text-neutral-500">No owned invoices.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Buyer</th>
            <th className="px-4 py-3 font-medium">Bucket</th>
            <th className="px-4 py-3 font-medium">Face</th>
            <th className="px-4 py-3 font-medium">Expected repayment</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">{position.buyerName}</td>
              <td className="px-4 py-3">{position.bucketName}</td>
              <td className="px-4 py-3 tabular-nums">
                {formatAmount(position.faceAmount)} {position.currency}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {position.expectedRepaymentRlusd === null ? "Unpriced" : `${formatAmount(position.expectedRepaymentRlusd)} RLUSD`}
              </td>
              <td className="px-4 py-3">{formatDateOnly(position.dueDate)}</td>
              <td className="px-4 py-3">
                <StatusBadge tone={statusTone(position.status)}>{position.status}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function History({ items }: { items: DashboardHistoryItem[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">No deposits, withdrawals, purchases, or repayments yet.</p>
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-white p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{HISTORY_LABEL[item.type]}</p>
              <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-neutral-500">{item.detail}</p>
            <p className="mt-1 text-xs text-neutral-500">{formatWhen(item.at)}</p>
            {item.txHash && <p className="mt-1 break-all font-mono text-xs text-neutral-500">{item.txHash}</p>}
          </div>
          <p className="text-sm font-semibold tabular-nums">
            {item.amount === null ? "—" : `${formatAmount(item.amount)} ${item.unit}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Stats({ stats }: { stats: DashboardData["stats"] }) {
  const profit = stats.profitLoss === null ? null : Number(stats.profitLoss)
  const win = stats.biggestWin === null ? null : Number(stats.biggestWin)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        label="Profit / loss"
        value={stats.profitLoss === null ? "—" : formatSignedAmount(profit ?? 0)}
        hint="Realized RLUSD"
        tone={profit === null || profit === 0 ? "neutral" : profit > 0 ? "positive" : "negative"}
      />
      <StatTile label="Volume" value={formatAmount(stats.volume)} hint="RLUSD reserved for purchases" />
      <StatTile label="Positions" value={String(stats.positions)} hint="Open owned invoices" />
      <StatTile
        label="Biggest win"
        value={stats.biggestWin === null ? "—" : formatSignedAmount(win ?? 0)}
        hint="Largest realized gain"
        tone={win !== null && win > 0 ? "positive" : "neutral"}
      />
      <StatTile label="Joined" value={formatJoined(stats.joined)} />
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "positive" | "negative"
}) {
  const color = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-neutral-900"
  return (
    <div className="rounded-lg border border-border bg-white px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}
