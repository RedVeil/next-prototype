"use client"

import { useActionState, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { BucketForm, Dialog, Feedback, useSaved } from "./bucket-form"
import { deletePortalBucket, moveFunds, setPortalBucketStatus } from "./dashboard-actions"
import { formatApr, formatJoined, formatSignedAmount, formatWhen } from "./format"
import { MoneyGroup } from "./money-value"
import type { DashboardBucket, DashboardHistoryItem, InvestorDashboardData } from "./investor-data"
import { CHART_RANGES, pointsInRange, rangeChange, type ChartRange, type ChartSeriesKey } from "./chart-model"
import { PortfolioChart } from "./portfolio-chart"

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

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

function statusTone(status: string): "positive" | "warning" | "danger" | "neutral" {
  if (status === "repaid" || status === "open" || status === "active" || status === "recorded" || status === "bought") {
    return "positive"
  }
  if (status === "failed" || status === "declined") return "danger"
  if (status === "paused" || status === "pending") return "warning"
  return "neutral"
}

export function InvestorDashboard({ data, tab }: { data: InvestorDashboardData; tab: TabId }) {
  const router = useRouter()
  const [movement, setMovement] = useState<"deposit" | "withdrawal" | null>(null)
  const [range, setRange] = useState<ChartRange>("ALL")
  const [visible, setVisible] = useState<Record<ChartSeriesKey, boolean>>({
    cash: true,
    invoices: true,
    portfolio: true,
  })
  const [editor, setEditor] = useState<DashboardBucket | "create" | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ranged = pointsInRange(data.series, range)
  const change = rangeChange(ranged)
  const rangeCaption = CHART_RANGES.find((item) => item.id === range)?.caption ?? "All time"

  function selectTab(next: TabId) {
    const params = new URLSearchParams(window.location.search)
    if (next === "buckets") params.delete("tab")
    else params.set("tab", next)
    const query = params.toString()
    router.replace(query ? `/investor?${query}` : "/investor", { scroll: false })
  }

  function saved() {
    setEditor(null)
    setMovement(null)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{data.legalName || "Investor"}</h1>
      <p className="mt-1 text-sm text-neutral-500">Access is allowed. Investments are running.</p>
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {data.movementsReady ? null : (
        <p className="mt-4 text-sm text-neutral-600">
          Deposits and withdrawals stay closed until the cash movements table is created.
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col rounded-lg border border-border bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Available RLUSD</p>
              <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                <MoneyGroup rows={[{ amount: data.available, currency: "RLUSD" }]} rate={data.usdRate} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Reserved</p>
              <div className="mt-2 text-lg font-semibold tracking-tight tabular-nums">
                <MoneyGroup rows={[{ amount: data.reserved, currency: "RLUSD" }]} rate={data.usdRate} />
              </div>
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
            <button
              type="button"
              disabled={!data.movementsReady}
              onClick={() => setMovement("deposit")}
              className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:bg-neutral-400"
            >
              Deposit
            </button>
            <button
              type="button"
              disabled={!data.movementsReady}
              onClick={() => setMovement("withdrawal")}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium disabled:text-neutral-400"
            >
              Withdraw
            </button>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-white p-5">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Portfolio</p>
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {data.portfolio === null ? (
              "—"
            ) : (
              <MoneyGroup rows={[{ amount: data.portfolio, currency: "RLUSD" }]} rate={data.usdRate} />
            )}
          </div>
          <p
            className={`mt-1 text-sm ${change && change.delta > 0 ? "text-emerald-700" : change && change.delta < 0 ? "text-red-700" : "text-neutral-500"}`}
          >
            {data.series.length === 0
              ? "No portfolio history yet"
              : change
                ? `${formatSignedAmount(change.delta)} USD${change.percent === null ? "" : ` (${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)}%)`}`
                : "No snapshots in this range"}
            {data.series.length > 0 ? <span className="text-neutral-500"> · {rangeCaption}</span> : null}
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
        {tab === "buckets" ? (
          <Buckets
            buckets={data.buckets}
            onCreate={() => setEditor("create")}
            onEdit={setEditor}
            onDelete={setDeleteId}
            onStatus={async (id, status) => {
              const result = await setPortalBucketStatus(id, status)
              if (result?.error) setError(result.error)
              else {
                setError(null)
                router.refresh()
              }
            }}
          />
        ) : null}
        {tab === "positions" ? <Positions positions={data.positions} rate={data.usdRate} /> : null}
        {tab === "history" ? <History items={data.history} rate={data.usdRate} /> : null}
        {tab === "stats" ? <Stats stats={data.stats} rate={data.usdRate} /> : null}
      </div>

      {movement ? (
        <Dialog
          title={movement === "deposit" ? "Deposit" : "Withdraw"}
          description={
            movement === "deposit"
              ? "Add RLUSD to available funds."
              : "Move RLUSD out of available funds."
          }
          onClose={() => setMovement(null)}
        >
          <FundsForm kind={movement} onSaved={saved} />
        </Dialog>
      ) : null}
      {deleteId ? (
        <ConfirmDialog
          title="Delete this bucket?"
          onClose={() => setDeleteId(null)}
          onConfirm={async () => {
            const result = await deletePortalBucket(deleteId)
            setDeleteId(null)
            if (result?.error) setError(result.error)
            else {
              setError(null)
              router.refresh()
            }
          }}
        />
      ) : null}
      {editor ? (
        <Dialog
          wide
          title={editor === "create" ? "Create investment bucket" : "Edit investment bucket"}
          description="A bucket is a standing mandate. It draws from the same available RLUSD. Country and currency lists can be left blank to match any."
          onClose={() => setEditor(null)}
        >
          <BucketForm bucket={editor === "create" ? null : editor} features={data.features} onSaved={saved} />
        </Dialog>
      ) : null}
    </main>
  )
}

function Buckets({
  buckets,
  onCreate,
  onEdit,
  onDelete,
  onStatus,
}: {
  buckets: DashboardBucket[]
  onCreate: () => void
  onEdit: (bucket: DashboardBucket) => void
  onDelete: (id: string) => void
  onStatus: (id: string, status: "active" | "paused") => Promise<void>
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-neutral-500">Standing mandates stored for this investor.</p>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white"
        >
          Create Bucket
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {buckets.length === 0 ? <li className="text-sm text-neutral-500">No buckets yet.</li> : null}
        {buckets.map((bucket) => (
          <li key={bucket.id} className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{bucket.name}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  APR {formatApr(bucket.apr)} · risk {bucket.riskLow}–{bucket.riskHigh} · and
                </p>
              </div>
              <StatusBadge tone={bucket.status === "active" ? "positive" : "warning"}>{bucket.status}</StatusBadge>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <button type="button" className="underline" onClick={() => onEdit(bucket)}>
                Edit
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => onStatus(bucket.id, bucket.status === "active" ? "paused" : "active")}
              >
                {bucket.status === "active" ? "Pause" : "Activate"}
              </button>
              <button type="button" className="underline" onClick={() => onDelete(bucket.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Positions({ positions, rate }: { positions: InvestorDashboardData["positions"]; rate: number | null }) {
  if (positions.length === 0) return <p className="text-sm text-neutral-500">No owned invoices.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Buyer</th>
            <th className="px-4 py-3 font-medium">Bucket</th>
            <th className="px-4 py-3 font-medium">Face</th>
            <th className="px-4 py-3 font-medium">Sold</th>
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
                <MoneyGroup rows={[{ amount: position.faceValue, currency: position.currency }]} rate={rate} compact />
              </td>
              <td className="px-4 py-3 tabular-nums">
                {position.soldPrice === null ? (
                  "—"
                ) : (
                  <MoneyGroup rows={[{ amount: position.soldPrice, currency: position.currency }]} rate={rate} compact />
                )}
              </td>
              <td className="px-4 py-3">{formatWhen(position.dueDate)}</td>
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

function History({ items, rate }: { items: DashboardHistoryItem[]; rate: number | null }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">No deposits, withdrawals, purchases, or repayments yet.</p>
  }
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
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {item.amount === null ? "—" : <MoneyGroup rows={[{ amount: item.amount, currency: item.unit }]} rate={rate} compact />}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Stats({ stats, rate }: { stats: InvestorDashboardData["stats"]; rate: number | null }) {
  const profit = stats.profitLoss
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        label="Profit / loss"
        value={profit === null ? "—" : <MoneyGroup rows={stats.profitRows} rate={rate} signed />}
        hint="Realized on repaid invoices"
        tone={profit === null || profit === 0 ? "neutral" : profit > 0 ? "positive" : "negative"}
      />
      <StatTile
        label="Volume"
        value={stats.volumeRows.length === 0 ? "0.00 USD" : <MoneyGroup rows={stats.volumeRows} rate={rate} />}
        hint="Sum of sold prices"
      />
      <StatTile label="Positions" value={String(stats.positions)} hint="Open owned invoices" />
      <StatTile
        label="Biggest win"
        value={stats.biggestWin === null ? "—" : <MoneyGroup rows={[stats.biggestWin]} rate={rate} signed />}
        hint="Largest realized gain"
        tone={stats.biggestWin !== null && stats.biggestWin.amount > 0 ? "positive" : "neutral"}
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
  value: ReactNode
  hint?: string
  tone?: "neutral" | "positive" | "negative"
}) {
  const color = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-neutral-900"
  return (
    <div className="rounded-lg border border-border bg-white px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</div>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  )
}

function StatusBadge({ tone, children }: { tone: "positive" | "warning" | "danger" | "neutral"; children: string }) {
  const color =
    tone === "positive"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-neutral-100 text-neutral-600"
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>
}

function ConfirmDialog({
  title,
  onClose,
  onConfirm,
}: {
  title: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  return (
    <Dialog title={title} description="This removes the standing mandate." onClose={onClose}>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="h-10 rounded-md border border-border px-4 text-sm">
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true)
            void onConfirm().finally(() => setPending(false))
          }}
          className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Deleting" : "Delete"}
        </button>
      </div>
    </Dialog>
  )
}

function FundsForm({ kind, onSaved }: { kind: "deposit" | "withdrawal"; onSaved: () => void }) {
  const [state, action, pending] = useActionState(moveFunds, null)
  useSaved(state, onSaved)
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <label className="block text-sm text-neutral-600">
        Amount
        <input name="amount" type="number" min="0.01" step="0.01" required className={inputClass} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-neutral-900 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving" : kind === "deposit" ? "Deposit" : "Withdraw"}
      </button>
    </form>
  )
}

