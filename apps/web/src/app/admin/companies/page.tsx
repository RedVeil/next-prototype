"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { acceptCompany, listCompanies, removeCompany, setCompanyAccess, setCompanyRisk } from "@/lib/actions"
import type { CompanyRow } from "@/lib/records"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

const inputClass = "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [riskLow, setRiskLow] = useState(0)
  const [riskHigh, setRiskHigh] = useState(10000)
  const [selectedId, setSelectedId] = useState("")
  const [pending, setPending] = useState<CompanyRow | null>(null)

  async function reload() {
    const rows = await listCompanies()
    setCompanies(rows)
    setSelectedId((current) => {
      if (rows.some((company) => company.id === current)) return current
      if (current) return ""
      return rows[0]?.id ?? ""
    })
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "Could not load companies"))
  }, [])

  const selected = companies.find((company) => company.id === selectedId) ?? null

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
      <p className="mt-1 text-sm text-neutral-500">Applications stay pending until you accept them.</p>
      {notice && <p className="mt-4 text-sm text-neutral-700">{notice}</p>}
      <ul className="mt-8 space-y-3">
        {companies.map((company) => (
          <li key={company.id} className="rounded-lg border border-border bg-white p-4 text-sm">
            <Link href={`/admin/companies/${company.id}`} className="font-medium">
              {company.legal_name}
            </Link>
            <p className="text-neutral-500">{company.tax_id} · {company.application_status} · {company.access_status} · {company.source}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="underline" onClick={() => { setSelectedId(company.id); setRiskLow(company.risk_low); setRiskHigh(company.risk_high) }}>Risk</button>
              {company.application_status === "pending" && (
                <button type="button" className="underline" onClick={async () => { const result = await acceptCompany(company.id); setNotice(result.ok ? "Accepted." : result.error); if (result.ok) await reload() }}>Accept</button>
              )}
              <button type="button" className="underline" onClick={async () => {
                const next = company.access_status === "stopped" ? "allowed" : "stopped"
                const result = await setCompanyAccess(company.id, next)
                setNotice(result.ok ? `Access ${next}.` : result.error)
                if (result.ok) await reload()
              }}>{company.access_status === "stopped" ? "Allow" : "Stop"}</button>
              <button type="button" className="underline" onClick={() => setPending(company)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {selected && (
        <form
          className="mt-6 rounded-lg border border-border bg-white p-5"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await setCompanyRisk(selected.id, riskLow, riskHigh)
            setNotice(result.ok ? "Risk range saved." : result.error)
            if (result.ok) await reload()
          }}
        >
          <h2 className="text-sm font-semibold">Risk range for {selected.legal_name}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Low<input type="number" value={riskLow} onChange={(event) => setRiskLow(Number(event.target.value))} className={inputClass} /></label>
            <label className="text-sm">High<input type="number" value={riskHigh} onChange={(event) => setRiskHigh(Number(event.target.value))} className={inputClass} /></label>
          </div>
          <button type="submit" className="mt-4 inline-flex h-10 items-center rounded-md border border-border px-4 text-sm">Save risk</button>
        </form>
      )}
      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.legal_name}`}
          description={`${pending.legal_name} will be removed from the database, including the login if this company has one. XRPL accounts are not removed.`}
          confirmLabel="Remove"
          danger
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const result = await removeCompany(pending.id)
            setNotice(result.ok ? `${pending.legal_name} removed.` : result.error)
            setPending(null)
            if (result.ok) await reload()
          }}
        />
      )}
    </div>
  )
}
