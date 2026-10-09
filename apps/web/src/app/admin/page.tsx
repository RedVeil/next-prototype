"use client"

import { useEffect, useState } from "react"
import { FUNDER_SERVICE } from "@antecipa/funder"
import { LEDGER_BOT_SERVICE } from "@antecipa/ledger-bot"
import { MATCHER_SERVICE } from "@antecipa/matcher"
import { PAYOUTS_SERVICE } from "@antecipa/payouts"
import { RAIL_SERVICE } from "@antecipa/rails"
import { RISK_SERVICE } from "@antecipa/risk"
import { adminOverview, setApplicationGates } from "@/lib/actions"

export default function AdminOverviewPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setData(await adminOverview())
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load admin"))
  }, [])

  if (!data) return <p className="text-sm text-neutral-500">{error ?? "Loading…"}</p>

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm text-neutral-500">Companies, investors, and buckets are stored in Supabase. Provisioning runs on XRPL mainnet.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Companies", data.companies],
          ["Investors", data.investors],
          ["Ledger jobs", data.jobs],
          ["Bot wallets", data.wallets],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-white p-4">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-8 rounded-lg border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">New applications</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm"
            onClick={async () => {
              const result = await setApplicationGates({ companyApplicationsAllowed: !data.companyApplicationsAllowed })
              if (!result.ok) setError(result.error)
              else await reload()
            }}
          >
            Company applications: {data.companyApplicationsAllowed ? "allowed" : "stopped"}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm"
            onClick={async () => {
              const result = await setApplicationGates({ investorApplicationsAllowed: !data.investorApplicationsAllowed })
              if (!result.ok) setError(result.error)
              else await reload()
            }}
          >
            Investor applications: {data.investorApplicationsAllowed ? "allowed" : "stopped"}
          </button>
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          Services: {[RISK_SERVICE, MATCHER_SERVICE, LEDGER_BOT_SERVICE, PAYOUTS_SERVICE, RAIL_SERVICE, FUNDER_SERVICE].join(", ")}.
        </p>
      </section>
    </div>
  )
}
