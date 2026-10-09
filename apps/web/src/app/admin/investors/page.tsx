"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { acceptInvestor, listInvestors, removeInvestor, replaceInvestorXrplAddress, setInvestorAccess } from "@/lib/actions"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

type InvestorList = Awaited<ReturnType<typeof listInvestors>>
type InvestorItem = InvestorList[number]

export default function AdminInvestorsPage() {
  const [investors, setInvestors] = useState<InvestorList>([])
  const [replacements, setReplacements] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<InvestorItem | null>(null)

  async function reload() {
    setInvestors(await listInvestors())
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "Could not load investors"))
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Investors</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Accepting an investor queues multisig provisioning. The worker creates the accounts on XRPL mainnet.
      </p>
      {notice && <p className="mt-4 text-sm text-neutral-700">{notice}</p>}
      <ul className="mt-8 space-y-3">
        {investors.map((investor) => (
          <li key={investor.id} className="rounded-lg border border-border bg-white p-4 text-sm">
            <Link href={`/admin/investors/${investor.id}`} className="font-medium">
              {investor.legal_name}
            </Link>
            <p className="mt-1 break-all text-neutral-500">{investor.own_xrpl_address ?? "No XRPL address"}</p>
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault()
                const next = (replacements[investor.id] ?? "").trim()
                const result = await replaceInvestorXrplAddress(investor.id, next)
                setNotice(result.ok ? result.message ?? "XRPL account replaced." : result.error)
                if (result.ok) {
                  setReplacements((current) => ({ ...current, [investor.id]: "" }))
                  await reload()
                }
              }}
            >
              <input
                value={replacements[investor.id] ?? ""}
                onChange={(event) => setReplacements((current) => ({ ...current, [investor.id]: event.target.value }))}
                placeholder="Replacement r-address"
                className="min-w-64 flex-1 rounded-md border border-border px-3 py-2"
              />
              <button type="submit" className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium">
                Replace account
              </button>
            </form>
            <p className="mt-1 text-neutral-600">
              {investor.application_status} · {investor.access_status} · provisioning {investor.provision?.status ?? "not queued"}
              {investor.provision?.last_error ? ` · ${investor.provision.last_error}` : ""}
            </p>
            <div className="mt-3 flex gap-3">
              {investor.application_status === "pending" && (
                <button type="button" className="underline" onClick={async () => {
                  const result = await acceptInvestor(investor.id)
                  setNotice(result.ok ? "Accepted. Provisioning is queued." : result.error)
                  if (result.ok) await reload()
                }}>Accept</button>
              )}
              <button type="button" className="underline" onClick={async () => {
                const next = investor.access_status === "stopped" ? "allowed" : "stopped"
                const result = await setInvestorAccess(investor.id, next)
                setNotice(result.ok ? `Access ${next}.` : result.error)
                if (result.ok) await reload()
              }}>{investor.access_status === "stopped" ? "Allow" : "Stop"}</button>
              <button type="button" className="underline" onClick={() => setPending(investor)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.legal_name}`}
          description={`${pending.legal_name} will be removed from the database, including the login if this investor has one. XRPL accounts are not removed.`}
          confirmLabel="Remove"
          danger
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const result = await removeInvestor(pending.id)
            setNotice(result.ok ? `${pending.legal_name} removed.` : result.error)
            setPending(null)
            if (result.ok) await reload()
          }}
        />
      )}
    </div>
  )
}
