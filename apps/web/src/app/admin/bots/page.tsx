"use client"

import { useEffect, useState } from "react"
import { listBots, updateAllowList } from "@/lib/actions"

type Bots = Awaited<ReturnType<typeof listBots>>

export default function AdminBotsPage() {
  const [data, setData] = useState<Bots | null>(null)
  const [multisigId, setMultisigId] = useState("")
  const [address, setAddress] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const next = await listBots()
    setData(next)
    if (!multisigId && next.multisigs[0]) setMultisigId(next.multisigs[0].id)
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load bots"))
  }, [])

  if (!data) return <p className="text-sm text-neutral-500">{error ?? "Loading…"}</p>
  const senders = data.senders.filter((sender) => sender.multisig_account_id === multisigId)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Bots and allow-lists</h1>
      <p className="mt-1 text-sm text-neutral-500">Addresses and XRP figures are shown. Seeds stay on the service role.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {data.heartbeats.map((beat) => (
          <article key={beat.service_name} className="rounded-lg border border-border bg-white p-4 text-sm">
            <h2 className="font-semibold">{beat.service_name}</h2>
            <p className="mt-1 text-neutral-500">Last seen {beat.last_seen_at}</p>
          </article>
        ))}
        {data.heartbeats.length === 0 && <p className="text-sm text-neutral-500">No heartbeats yet. Start the ledger bot worker.</p>}
      </div>
      <h2 className="mt-10 text-lg font-semibold">Bot wallets</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Purpose</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">XRP left</th>
              <th className="px-4 py-3 font-medium">Fees</th>
            </tr>
          </thead>
          <tbody>
            {data.wallets.map((wallet) => (
              <tr key={wallet.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{wallet.purpose}</td>
                <td className="px-4 py-3 break-all">{wallet.public_address ?? "Not generated"}</td>
                <td className="px-4 py-3">{String(wallet.xrp_balance)}</td>
                <td className="px-4 py-3">{String(wallet.xrp_fees_spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-lg font-semibold">Deposit allow-list</h2>
      <label className="mt-4 block text-sm">
        Multisig
        <select value={multisigId} onChange={(event) => setMultisigId(event.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2">
          {data.multisigs.map((account) => (
            <option key={account.id} value={account.id}>
              {account.role} · {account.classic_address}
            </option>
          ))}
        </select>
      </label>
      <ul className="mt-4 space-y-2 text-sm">
        {senders.map((sender) => (
          <li key={sender.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2">
            <span className="break-all">{sender.label}: {sender.xrpl_address}</span>
            <button
              type="button"
              className="underline"
              onClick={async () => {
                const result = await updateAllowList({
                  multisigId,
                  address: sender.xrpl_address,
                  label: sender.label,
                  remove: true,
                })
                if (!result.ok) setError(result.error)
                else await reload()
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {senders.length === 0 && <li className="text-neutral-500">No authorized senders.</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const result = await updateAllowList({ multisigId, address, label, remove: false })
          if (!result.ok) setError(result.error)
          else {
            setAddress("")
            setLabel("")
            await reload()
          }
        }}
      >
        <label className="text-sm">Address<input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 block rounded-md border border-border px-3 py-2" /></label>
        <label className="text-sm">Label<input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 block rounded-md border border-border px-3 py-2" /></label>
        <button type="submit" className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">Authorize</button>
      </form>
    </div>
  )
}
