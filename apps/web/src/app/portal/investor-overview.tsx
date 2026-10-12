import { createServiceClient } from "@/lib/supabase/service"
import { Metric, money, percent } from "./metrics"

type BucketRow = {
  id: string
  name: string
  status: string
  riskLow: number
  riskHigh: number
  tenorMax: number | null
  industries: string[]
  apr: number
  exposureKind: string
  exposureLimitUsd: number | null
  exposureLimitPercent: number | null
  exposureUsedUsd: number
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function exposureLimit(bucket: BucketRow, portfolio: number) {
  if (bucket.exposureKind === "flat_usd") return bucket.exposureLimitUsd
  if (bucket.exposureLimitPercent === null) return null
  return (portfolio * bucket.exposureLimitPercent) / 100
}

function limitLabel(bucket: BucketRow) {
  if (bucket.exposureKind === "flat_usd") {
    return bucket.exposureLimitUsd === null ? "Missing limit" : money(bucket.exposureLimitUsd, "USD")
  }
  return bucket.exposureLimitPercent === null ? "Missing limit" : `${bucket.exposureLimitPercent}% of portfolio`
}

export async function InvestorOverview({
  organisationId,
  organisation,
}: {
  organisationId: string
  organisation: string
}) {
  const supabase = createServiceClient()
  const [snapshot, bucketsResult] = await Promise.all([
    supabase
      .from("organisation_portfolio_snapshots")
      .select("available_rlusd, portfolio_rlusd, captured_at")
      .eq("organisation_id", organisationId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("organisation_buckets")
      .select(
        "id, name, status, risk_low, risk_high, tenor_max, industries, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, exposure_used_usd, created_at",
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false }),
  ])
  if (snapshot.error) throw new Error(snapshot.error.message)
  if (bucketsResult.error) throw new Error(bucketsResult.error.message)

  const available = num(snapshot.data?.available_rlusd)
  const deployed = num(snapshot.data?.portfolio_rlusd)
  const committed = available + deployed
  const utilization = committed > 0 ? deployed / committed : 0
  const buckets: BucketRow[] = (bucketsResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    status: row.status as string,
    riskLow: num(row.risk_low),
    riskHigh: num(row.risk_high),
    tenorMax: optionalNum(row.tenor_max),
    industries: textList(row.industries),
    apr: num(row.apr),
    exposureKind: row.exposure_kind as string,
    exposureLimitUsd: optionalNum(row.exposure_limit_usd),
    exposureLimitPercent: optionalNum(row.exposure_limit_percent),
    exposureUsedUsd: num(row.exposure_used_usd),
  }))
  const active = buckets.filter((bucket) => bucket.status === "active")
  const exposure = active.reduce((sum, bucket) => sum + bucket.exposureUsedUsd, 0)
  const weightedApr =
    active.length === 0
      ? 0
      : exposure > 0
        ? active.reduce((sum, bucket) => sum + bucket.apr * bucket.exposureUsedUsd, 0) / exposure
        : active.reduce((sum, bucket) => sum + bucket.apr, 0) / active.length

  const metrics = [
    { label: "Committed capital", value: money(committed, "RLUSD") },
    { label: "Deployed", value: money(deployed, "RLUSD") },
    { label: "Available", value: money(available, "RLUSD") },
    { label: "Weighted average APR", value: percent(weightedApr) },
    { label: "Active buckets", value: String(active.length) },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <div>
        <p className="text-sm text-muted">{organisation || "Investor"}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          You commit capital once. Investment buckets are standing mandates that can draw from this shared pool.
          They are not separate deposits.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Capital utilization</h2>
            <p className="mt-1 text-sm text-muted">Deployed capital draws from one committed pool. Bucket caps may overlap.</p>
          </div>
          <p className="text-sm font-medium">Capital utilization: {percent(utilization)}</p>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-background">
          <div className="bg-foreground" style={{ width: `${Math.min(100, utilization * 100)}%` }} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Committed</dt>
            <dd className="mt-0.5 font-medium">{money(committed, "RLUSD")}</dd>
          </div>
          <div>
            <dt className="text-muted">Deployed</dt>
            <dd className="mt-0.5 font-medium">{money(deployed, "RLUSD")}</dd>
          </div>
          <div>
            <dt className="text-muted">Available</dt>
            <dd className="mt-0.5 font-medium">{money(available, "RLUSD")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Investment buckets</h2>
        <p className="mt-1 text-sm text-muted">
          Each bucket combines eligibility rules, a required APR, and an exposure cap against the same committed capital.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {buckets.length === 0 ? (
            <p className="text-sm text-muted">No investment buckets yet.</p>
          ) : (
            buckets.map((bucket) => {
              const limit = exposureLimit(bucket, deployed)
              const remaining = limit === null ? 0 : Math.max(0, limit - bucket.exposureUsedUsd)
              const availableThrough = Math.min(available, remaining)
              return (
                <article key={bucket.id} className="rounded-2xl border border-border bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold">{bucket.name}</h3>
                    <p className="text-sm text-muted">{bucket.status === "active" ? "Active" : "Paused"}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted">Required APR</dt>
                      <dd className="mt-0.5 font-medium">{percent(bucket.apr)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Score</dt>
                      <dd className="mt-0.5 font-medium">
                        {bucket.riskLow}–{bucket.riskHigh}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Industry</dt>
                      <dd className="mt-0.5 font-medium">
                        {bucket.industries.length > 0 ? bucket.industries.join(", ") : "Any"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Max tenor</dt>
                      <dd className="mt-0.5 font-medium">
                        {bucket.tenorMax === null ? "Any" : `${bucket.tenorMax} days`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Exposure limit</dt>
                      <dd className="mt-0.5 font-medium">{limitLabel(bucket)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Current exposure</dt>
                      <dd className="mt-0.5 font-medium">{money(bucket.exposureUsedUsd, "USD")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Remaining room</dt>
                      <dd className="mt-0.5 font-medium">{money(remaining, "USD")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Available through this bucket</dt>
                      <dd className="mt-0.5 font-medium">{money(availableThrough, "RLUSD")}</dd>
                    </div>
                  </dl>
                </article>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
