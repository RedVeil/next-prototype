"use client"

import { useEffect, useState } from "react"
import { deleteBucket, listMyBuckets, setBucketStatus } from "@/lib/actions"
import type { BucketRow } from "@/lib/records"
import { BucketForm } from "@/components/investor/BucketForm"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Dialog } from "@/components/ui/Dialog"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { useSession } from "@/lib/session"

export function BucketList({
  readOnly = false,
  buckets: providedBuckets,
  stopped = false,
}: {
  readOnly?: boolean
  buckets?: BucketRow[]
  stopped?: boolean
}) {
  const { session } = useSession()
  const investor = session.investor
  const [buckets, setBuckets] = useState<BucketRow[]>(providedBuckets ?? [])
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editor, setEditor] = useState<BucketRow | "create" | null>(null)

  async function reload() {
    try {
      setBuckets(await listMyBuckets())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load buckets")
    }
  }

  useEffect(() => {
    if (readOnly) {
      setBuckets(providedBuckets ?? [])
      return
    }
    if (investor?.application_status !== "accepted") return
    let cancelled = false
    void listMyBuckets()
      .then((rows) => {
        if (!cancelled) setBuckets(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load buckets")
      })
    return () => {
      cancelled = true
    }
  }, [investor?.application_status, providedBuckets, readOnly])

  const accessStopped = readOnly ? stopped : investor?.access_status === "stopped"
  const locked = readOnly || accessStopped

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-neutral-500">Standing mandates stored for this investor.</p>
        {!locked && (
          <button
            type="button"
            onClick={() => setEditor("create")}
            className="inline-flex h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white"
          >
            Create Bucket
          </button>
        )}
      </div>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {accessStopped && <p className="mt-4 text-sm text-neutral-600">This investor is stopped. Buckets can be viewed, not changed.</p>}
      <ul className="mt-4 space-y-3">
        {buckets.length === 0 && <li className="text-sm text-neutral-500">No buckets yet.</li>}
        {buckets.map((bucket) => (
          <li key={bucket.id} className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{bucket.name}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  APR {String(bucket.apr)}% · risk {bucket.risk_low}–{bucket.risk_high} · {bucket.criteria_mode}
                </p>
              </div>
              <StatusBadge tone={bucket.status === "active" ? "positive" : "warning"}>{bucket.status}</StatusBadge>
            </div>
            {!locked && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <button type="button" className="underline" onClick={() => setEditor(bucket)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    const result = await setBucketStatus(bucket.id, bucket.status === "active" ? "paused" : "active")
                    if (!result.ok) setError(result.error)
                    else await reload()
                  }}
                >
                  {bucket.status === "active" ? "Pause" : "Activate"}
                </button>
                <button type="button" className="underline" onClick={() => setDeleteId(bucket.id)}>
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {deleteId && (
        <ConfirmDialog
          title="Delete this bucket?"
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteId(null)}
          onConfirm={async () => {
            const result = await deleteBucket(deleteId)
            setDeleteId(null)
            if (!result.ok) setError(result.error)
            else await reload()
          }}
        />
      )}
      {editor && (
        <Dialog
          wide
          title={editor === "create" ? "Create investment bucket" : "Edit investment bucket"}
          description="A bucket is a standing mandate. It does not create a wallet. Country and currency are always required."
          onClose={() => setEditor(null)}
        >
          <BucketForm
            mode={editor === "create" ? "create" : "edit"}
            bucket={editor === "create" ? undefined : editor}
            onSaved={() => {
              setEditor(null)
              void reload()
            }}
          />
        </Dialog>
      )}
    </div>
  )
}
