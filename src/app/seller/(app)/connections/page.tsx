"use client"

import { ConnectionCard } from "@/components/connections/ConnectionCard"
import { useStore } from "@/lib/store"

export default function ConnectionsPage() {
  const { connections } = useStore()

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Connections</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Data sources used to verify invoices issued by your CNPJ and to analyse your
          company&apos;s own banking history.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <ConnectionCard
          title="NF-e / Duplicata"
          status="connected"
          description="Automatically verify invoices issued by this CNPJ, buyer acceptance, ownership, assignments and liens."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <p>
              <span className="text-neutral-500">Last synced</span>
              <span className="mt-0.5 block font-medium text-neutral-900">
                {connections.lastSynced}
              </span>
            </p>
            <p>
              <span className="text-neutral-500">Invoices detected</span>
              <span className="mt-0.5 block font-medium text-neutral-900">
                {connections.invoicesDetected}
              </span>
            </p>
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            NF-e evidences the underlying commercial transaction. Current ownership,
            acceptance, due date, assignments and liens are taken from the registered
            Duplicata Escritural.
          </p>
        </ConnectionCard>

        <ConnectionCard
          title="Open Finance"
          status="connected"
          description="Analyze the seller's banking history and match customer payments against historical invoices."
        >
          <p className="rounded-md border border-border bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-600">
            Open Finance is connected to your company accounts. It does not provide access
            to your customers&apos; private bank balances.
          </p>
          <div>
            <p className="text-neutral-500">Connected banks</p>
            {connections.banks.length > 0 ? (
              <ul className="mt-1.5 space-y-1 font-medium text-neutral-900">
                {connections.banks.map((bank) => (
                  <li key={bank}>{bank}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 font-medium text-neutral-900">None connected yet</p>
            )}
          </div>
          <p>
            <span className="text-neutral-500">Bank visibility estimate</span>
            <span className="mt-0.5 block font-medium text-neutral-900">
              {connections.bankVisibility}%
            </span>
          </p>
        </ConnectionCard>

        <ConnectionCard
          title="Public / bureau data"
          status="automatic"
          description="External signals on counterparties, used only as one input to an indicative risk view. These sources do not provide private financial statements."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              "Company registration",
              "Litigation",
              "Bankruptcy / restructuring",
              "Tax status",
              "Credit bureau signals",
            ].map((item) => (
              <li key={item} className="text-neutral-800">
                {item}
              </li>
            ))}
          </ul>
        </ConnectionCard>
      </div>
    </div>
  )
}
