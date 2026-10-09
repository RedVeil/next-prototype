"use client"

import { useEffect, useState } from "react"
import { SUBMIT_REFUSAL } from "@antecipa/ledger-bot"
import { listLedgerJobs, retryProvision } from "@/lib/actions"

type Job = Awaited<ReturnType<typeof listLedgerJobs>>[number]

export default function LedgerJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setJobs(await listLedgerJobs())
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load jobs"))
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Ledger jobs</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600">
        provision_investor_multisigs is submitted by the ledger bot worker. Every other job type is still refused: {SUBMIT_REFUSAL}
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">No jobs yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-lg border border-border bg-white p-4 text-sm">
              <p className="font-medium">{job.type}</p>
              <p className="mt-1 text-neutral-600">
                {job.status} · attempts {job.attempts}
                {job.bot_wallet_id ? ` · bot ${job.bot_wallet_id}` : ""}
              </p>
              {job.last_error && <p className="mt-1 text-red-700">{job.last_error}</p>}
              {job.type === "provision_investor_multisigs" && job.status === "failed" && (
                <button
                  type="button"
                  className="mt-2 underline"
                  onClick={async () => {
                    const result = await retryProvision(job.id)
                    if (!result.ok) setError(result.error)
                    else await reload()
                  }}
                >
                  Queue again
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
