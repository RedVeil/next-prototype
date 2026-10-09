"use client"

import { useState } from "react"
import { COUNTRIES, CURRENCIES, GOODS_AND_SERVICES, INDUSTRIES } from "@antecipa/domain"
import { createBucket, updateBucket } from "@/lib/actions"
import type { BucketInput, BucketRow } from "@/lib/records"
import { ChipSelect } from "@/components/ui/ChipSelect"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { PartyLock } from "@/components/layout/PartyLock"
import { useSession } from "@/lib/session"

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

function fromRow(bucket?: BucketRow): BucketInput {
  return {
    name: bucket?.name ?? "",
    riskLow: bucket?.risk_low ?? 0,
    riskHigh: bucket?.risk_high ?? 10000,
    industries: bucket?.industries ?? [],
    products: bucket?.products ?? [],
    countries: bucket?.countries ?? ["BR"],
    currencies: bucket?.currencies ?? ["BRL"],
    criteriaMode: bucket?.criteria_mode ?? "and",
    apr: bucket ? Number(bucket.apr) : 11,
    exposureKind: bucket?.exposure_kind ?? "flat_usd",
    exposureLimitUsd: bucket?.exposure_limit_usd != null ? Number(bucket.exposure_limit_usd) : 1_000_000,
    exposureLimitPercent: bucket?.exposure_limit_percent != null ? Number(bucket.exposure_limit_percent) : 25,
    tenorMin: bucket?.tenor_min ?? null,
    tenorMax: bucket?.tenor_max ?? null,
    invoiceMin: bucket?.invoice_min != null ? Number(bucket.invoice_min) : null,
    invoiceMax: bucket?.invoice_max != null ? Number(bucket.invoice_max) : null,
  }
}

function optionalNumber(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function BucketForm({
  mode,
  bucket,
  onSaved,
}: {
  mode: "create" | "edit"
  bucket?: BucketRow
  onSaved: () => void
}) {
  const { session } = useSession()
  const investor = session.investor
  const [draft, setDraft] = useState<BucketInput>(fromRow(bucket))
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)

  if (!investor) return null
  if (investor.application_status !== "accepted") {
    return <PartyLock title="Still in onboarding" body="Mandate buckets stay unavailable until an admin accepts this investor." />
  }
  if (investor.access_status === "stopped") {
    return <PartyLock title="Investor stopped" body="This investor cannot create or edit buckets until an admin allows them." />
  }

  function toggle(key: "industries" | "products" | "countries" | "currencies", value: string) {
    setDraft((current) => {
      const selected = current[key]
      const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
      return { ...current, [key]: next }
    })
  }

  async function save() {
    setPending(true)
    const result = mode === "create" || !bucket ? await createBucket(draft) : await updateBucket(bucket.id, draft)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      setConfirmOpen(false)
      return
    }
    onSaved()
  }

  return (
    <>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (mode === "create") setConfirmOpen(true)
          else void save()
        }}
      >
        {error && <p className="text-sm text-red-700">{error}</p>}
        <label className="block text-sm text-neutral-600">
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm text-neutral-600">
          APR percent
          <input type="number" value={draft.apr} onChange={(event) => setDraft({ ...draft, apr: Number(event.target.value) })} className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-neutral-600">
            Risk low
            <input type="number" value={draft.riskLow} onChange={(event) => setDraft({ ...draft, riskLow: Number(event.target.value) })} className={inputClass} />
          </label>
          <label className="block text-sm text-neutral-600">
            Risk high
            <input type="number" value={draft.riskHigh} onChange={(event) => setDraft({ ...draft, riskHigh: Number(event.target.value) })} className={inputClass} />
          </label>
        </div>
        <label className="block text-sm text-neutral-600">
          Criteria
          <select
            value={draft.criteriaMode}
            onChange={(event) => setDraft({ ...draft, criteriaMode: event.target.value as BucketInput["criteriaMode"] })}
            className={inputClass}
          >
            <option value="and">And</option>
            <option value="or">Or</option>
          </select>
        </label>
        <fieldset>
          <legend className="text-sm text-neutral-600">Industries</legend>
          <ChipSelect options={INDUSTRIES} selected={draft.industries} onToggle={(value) => toggle("industries", value)} />
        </fieldset>
        <fieldset>
          <legend className="text-sm text-neutral-600">Products</legend>
          <ChipSelect options={GOODS_AND_SERVICES} selected={draft.products} onToggle={(value) => toggle("products", value)} />
        </fieldset>
        <fieldset>
          <legend className="text-sm text-neutral-600">Countries</legend>
          <ChipSelect options={COUNTRIES.map((country) => country.code)} selected={draft.countries} onToggle={(value) => toggle("countries", value)} />
        </fieldset>
        <fieldset>
          <legend className="text-sm text-neutral-600">Currencies</legend>
          <ChipSelect options={CURRENCIES} selected={draft.currencies} onToggle={(value) => toggle("currencies", value)} />
        </fieldset>
        <label className="block text-sm text-neutral-600">
          Exposure
          <select
            value={draft.exposureKind}
            onChange={(event) => setDraft({ ...draft, exposureKind: event.target.value as BucketInput["exposureKind"] })}
            className={inputClass}
          >
            <option value="flat_usd">Flat USD</option>
            <option value="portfolio_percent">Percent of portfolio</option>
          </select>
        </label>
        {draft.exposureKind === "flat_usd" ? (
          <label className="block text-sm text-neutral-600">
            Limit USD
            <input
              type="number"
              value={draft.exposureLimitUsd ?? ""}
              onChange={(event) => setDraft({ ...draft, exposureLimitUsd: optionalNumber(event.target.value) })}
              className={inputClass}
            />
          </label>
        ) : (
          <label className="block text-sm text-neutral-600">
            Limit percent
            <input
              type="number"
              value={draft.exposureLimitPercent ?? ""}
              onChange={(event) => setDraft({ ...draft, exposureLimitPercent: optionalNumber(event.target.value) })}
              className={inputClass}
            />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-neutral-600">
            Tenor min days
            <input type="number" value={draft.tenorMin ?? ""} onChange={(event) => setDraft({ ...draft, tenorMin: optionalNumber(event.target.value) })} className={inputClass} />
          </label>
          <label className="block text-sm text-neutral-600">
            Tenor max days
            <input type="number" value={draft.tenorMax ?? ""} onChange={(event) => setDraft({ ...draft, tenorMax: optionalNumber(event.target.value) })} className={inputClass} />
          </label>
        </div>
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:bg-neutral-400">
          {mode === "create" ? "Review bucket" : "Save bucket"}
        </button>
      </form>
      {confirmOpen && (
        <ConfirmDialog
          title="Activate this bucket?"
          description="The mandate is stored for this investor. Matching against live invoices is not running."
          confirmLabel="Activate"
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => void save()}
        />
      )}
    </>
  )
}
