import { capitalUtilization } from "@/lib/capital"
import { formatMillionsBRL, formatPercent } from "@/lib/format"
import type { Investor } from "@/lib/types"

export function CapitalUtilization({ investor }: { investor: Investor }) {
  const committed = investor.committedCapital
  const deployedPct = committed > 0 ? (investor.deployedCapital / committed) * 100 : 0
  const utilization = capitalUtilization(investor)

  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Capital utilization</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Deployed capital draws from one committed pool. Bucket caps may overlap.
          </p>
        </div>
        <p className="text-sm font-medium text-neutral-900">
          Capital utilization: {formatPercent(utilization * 100, 0)}
        </p>
      </div>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-neutral-100">
        <div className="bg-neutral-900" style={{ width: `${deployedPct}%` }} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-neutral-500">Committed</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{formatMillionsBRL(committed)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Deployed</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {formatMillionsBRL(investor.deployedCapital)}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Available</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {formatMillionsBRL(committed - investor.deployedCapital)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
