"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useSigner, useWallet, useWalletModal } from "@xrpl-commons/xrpl-connect-react"
import { isWalletError, WalletErrorCode } from "xrpl-connect"
import { isValidClassicAddress } from "xrpl"
import { RLUSD_CURRENCY, RLUSD_ISSUER } from "@/ledger/rlusd"
import { withSourceTag } from "@/ledger/source-tag"
import { BucketForm, Dialog } from "./bucket-form"
import {
  deletePortalBucket,
  loadInvestorBucketsPanel,
  loadInvestorHistoryPanel,
  loadInvestorPositionsPanel,
  loadInvestorStatsPanel,
  prepareFunds,
  setPortalBucketStatus,
} from "./dashboard-actions"
import { trackFundsPayment, type SignedFunds } from "./funds-tracker"
import { subscribeSignWindow } from "./xaman-window"
import { formatApr, formatJoined, formatSignedAmount, formatWhen } from "./format"
import { MoneyGroup } from "./money-value"
import type {
  DashboardBucket,
  DashboardHistoryItem,
  DashboardPosition,
  DashboardStats,
  InvestorBuckets,
  InvestorShell,
} from "./investor-data"
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

type HistoryCache = { key: string; items: DashboardHistoryItem[] }

type LoadedPanels = {
  buckets?: InvestorBuckets
  positions?: DashboardPosition[]
  history?: HistoryCache
  stats?: DashboardStats
}

function panelReady(stored: LoadedPanels, next: TabId, fundsKey: string) {
  if (next === "history") return stored.history?.key === fundsKey
  return stored[next] !== undefined
}

export function InvestorDashboard({ data, walletAddress }: { data: InvestorShell; walletAddress: string }) {
  const [tab, setTab] = useState<TabId>("buckets")
  const [panels, setPanels] = useState<LoadedPanels>({})
  const [panelErrors, setPanelErrors] = useState<Partial<Record<TabId, string>>>({})
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
  const panelsRef = useRef<LoadedPanels>({})
  const inflight = useRef<Partial<Record<TabId, boolean>>>({})
  const requestId = useRef<Record<TabId, number>>({ buckets: 0, positions: 0, history: 0, stats: 0 })
  const fundsKey = `${data.available}:${data.reserved}`
  const fundsKeyRef = useRef(fundsKey)
  const fundsSeen = useRef(fundsKey)
  const historyItems = panels.history?.key === fundsKey ? panels.history.items : undefined

  const ranged = pointsInRange(data.series, range)
  const change = rangeChange(ranged)
  const rangeCaption = CHART_RANGES.find((item) => item.id === range)?.caption ?? "All time"

  const storePanel = useCallback((patch: Partial<LoadedPanels>) => {
    panelsRef.current = { ...panelsRef.current, ...patch }
    setPanels((current) => ({ ...current, ...patch }))
  }, [])

  const fetchPanel = useCallback(async (next: TabId, force = false) => {
    const key = fundsKeyRef.current
    if (!force && panelReady(panelsRef.current, next, key)) return
    if (!force && inflight.current[next]) return
    const id = ++requestId.current[next]
    inflight.current[next] = true
    setPanelErrors((current) => {
      if (!current[next]) return current
      const copy = { ...current }
      delete copy[next]
      return copy
    })
    try {
      if (next === "buckets") {
        const result = await loadInvestorBucketsPanel()
        if (requestId.current.buckets !== id) return
        if ("error" in result) {
          setPanelErrors((current) => ({ ...current, buckets: result.error }))
          return
        }
        storePanel({ buckets: result })
        return
      }
      if (next === "positions") {
        const result = await loadInvestorPositionsPanel()
        if (requestId.current.positions !== id) return
        if ("error" in result) {
          setPanelErrors((current) => ({ ...current, positions: result.error }))
          return
        }
        storePanel({ positions: result })
        return
      }
      if (next === "history") {
        const result = await loadInvestorHistoryPanel()
        if (requestId.current.history !== id) return
        if ("error" in result) {
          setPanelErrors((current) => ({ ...current, history: result.error }))
          return
        }
        storePanel({ history: { key, items: result } })
        return
      }
      const result = await loadInvestorStatsPanel()
      if (requestId.current.stats !== id) return
      if ("error" in result) {
        setPanelErrors((current) => ({ ...current, stats: result.error }))
        return
      }
      storePanel({ stats: result })
    } catch (caught) {
      if (requestId.current[next] !== id) return
      const message = caught instanceof Error ? caught.message : "The database did not respond."
      setPanelErrors((current) => ({ ...current, [next]: message }))
    } finally {
      if (requestId.current[next] === id) inflight.current[next] = false
    }
  }, [storePanel])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("tab")) {
      params.delete("tab")
      const query = params.toString()
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      window.history.replaceState(window.history.state, "", next)
    }
    const timer = window.setTimeout(() => {
      void fetchPanel("buckets")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchPanel])

  useEffect(() => {
    fundsKeyRef.current = fundsKey
    const previous = fundsSeen.current
    fundsSeen.current = fundsKey
    if (previous === fundsKey || tab !== "history") return
    const timer = window.setTimeout(() => {
      void fetchPanel("history", true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchPanel, fundsKey, tab])

  function selectTab(next: TabId) {
    setTab(next)
    void fetchPanel(next)
  }

  async function reloadBuckets() {
    const result = await loadInvestorBucketsPanel()
    if ("error" in result) {
      setError(result.error)
      return
    }
    setError(null)
    setPanelErrors((current) => {
      if (!current.buckets) return current
      const copy = { ...current }
      delete copy.buckets
      return copy
    })
    storePanel({ buckets: result })
  }

  function saved() {
    setEditor(null)
    setMovement(null)
    setDeleteId(null)
    void reloadBuckets()
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
          panels.buckets ? (
            <Buckets
              buckets={panels.buckets.buckets}
              onCreate={() => setEditor("create")}
              onEdit={setEditor}
              onDelete={setDeleteId}
              onStatus={async (id, status) => {
                const result = await setPortalBucketStatus(id, status)
                if (result?.error) setError(result.error)
                else {
                  setError(null)
                  await reloadBuckets()
                }
              }}
            />
          ) : (
            <PanelStatus error={panelErrors.buckets} />
          )
        ) : null}
        {tab === "positions" ? (
          panels.positions ? (
            <Positions positions={panels.positions} rate={data.usdRate} />
          ) : (
            <PanelStatus error={panelErrors.positions} />
          )
        ) : null}
        {tab === "history" ? (
          historyItems ? (
            <History items={historyItems} rate={data.usdRate} />
          ) : (
            <PanelStatus error={panelErrors.history} />
          )
        ) : null}
        {tab === "stats" ? (
          panels.stats ? (
            <Stats stats={panels.stats} rate={data.usdRate} />
          ) : (
            <PanelStatus error={panelErrors.stats} />
          )
        ) : null}
      </div>

      {movement ? (
        <Dialog
          title={movement === "deposit" ? "Deposit" : "Withdraw"}
          description={
            movement === "deposit"
              ? "Sends RLUSD from your wallet to the multisig. Cash and portfolio value update after the payment is validated."
              : "Sends RLUSD from the multisig back to your wallet. It cannot exceed the RLUSD left after open sales."
          }
          onClose={() => setMovement(null)}
        >
          <FundsForm kind={movement} walletAddress={walletAddress} onSigningStarted={() => setMovement(null)} />
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
              await reloadBuckets()
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
          <BucketForm bucket={editor === "create" ? null : editor} features={panels.buckets?.features ?? []} onSaved={saved} />
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

function PanelStatus({ error }: { error?: string }) {
  return <p className={`text-sm ${error ? "text-red-700" : "text-neutral-500"}`}>{error ?? "Loading…"}</p>
}

function Positions({ positions, rate }: { positions: DashboardPosition[]; rate: number | null }) {
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

function Stats({ stats, rate }: { stats: DashboardStats; rate: number | null }) {
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

function walletMessage(error: unknown) {
  if (isWalletError(error) && error.code === WalletErrorCode.SIGN_REJECTED) {
    return "The wallet rejected the transaction."
  }
  return error instanceof Error ? error.message : "The payment could not be sent."
}

function FundsForm({
  kind,
  walletAddress,
  onSigningStarted,
}: {
  kind: "deposit" | "withdrawal"
  walletAddress: string
  onSigningStarted: () => void
}) {
  const { account, disconnect } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign, signAndSubmit } = useSigner()
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const stored = isValidClassicAddress(walletAddress)
  const connected = account?.address === walletAddress

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stored) {
      setError("Set an XRPL address on this user before sending RLUSD.")
      return
    }
    setError(null)
    if (!connected) {
      await open()
      return
    }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError("Amount must be greater than zero.")
      return
    }
    setPending(true)
    let handedOff = false
    try {
      const prepared = await prepareFunds(kind, value)
      if (!mounted.current) return
      if ("error" in prepared) {
        setError(prepared.error)
        return
      }
      if (prepared.kind === "deposit" && account?.address !== prepared.account) {
        setError("Connect the wallet saved on this user.")
        return
      }

      let signPromise!: Promise<SignedFunds>
      const windowPromise = new Promise<"opened" | "blocked" | "settled">((resolve) => {
        let settled = false
        const finish = (result: "opened" | "blocked" | "settled") => {
          if (settled) return
          settled = true
          stop()
          resolve(result)
        }
        const stop = subscribeSignWindow((result) => finish(result.opened ? "opened" : "blocked"))
        signPromise =
          prepared.kind === "deposit"
            ? signAndSubmit(
                withSourceTag({
                  TransactionType: "Payment",
                  Account: prepared.account,
                  Destination: prepared.destination,
                  Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: prepared.value },
                }),
              )
            : sign(prepared.transaction)
        void signPromise.then(
          () => finish("settled"),
          () => finish("settled"),
        )
      })
      const windowResult = await windowPromise

      if (windowResult === "blocked") {
        if (mounted.current) setError("The browser blocked the Xaman window.")
        void signPromise.catch(() => {})
        return
      }
      if (windowResult === "settled") {
        try {
          await signPromise
        } catch (caught) {
          if (mounted.current) setError(walletMessage(caught))
          return
        }
      }

      handedOff = true
      trackFundsPayment({ kind: prepared.kind, amount, sign: signPromise })
      onSigningStarted()
    } catch (caught) {
      if (mounted.current) setError(walletMessage(caught))
    } finally {
      if (mounted.current && !handedOff) setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
      {stored ? (
        <p className="text-sm text-neutral-600">
          Wallet <span className="font-mono text-xs break-all text-neutral-900">{walletAddress}</span>
        </p>
      ) : (
        <p className="text-sm text-neutral-600">Set an XRPL address on this user before sending RLUSD.</p>
      )}
      {account && !connected ? (
        <p className="text-sm text-neutral-600">
          Connected to <span className="font-mono text-xs break-all">{account.address}</span>.{" "}
          <button type="button" onClick={() => void disconnect()} className="underline">
            Disconnect
          </button>
        </p>
      ) : null}
      <label className="block text-sm text-neutral-600">
        Amount
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          disabled={pending}
          onChange={(event) => setAmount(event.target.value)}
          className={inputClass}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || !ready || !stored}
        className="h-10 rounded-md bg-neutral-900 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Preparing" : !connected ? "Connect wallet" : kind === "deposit" ? "Deposit" : "Withdraw"}
      </button>
    </form>
  )
}

