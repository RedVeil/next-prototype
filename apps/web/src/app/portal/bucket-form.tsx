"use client"

import { useActionState, useEffect, useRef, type ReactNode } from "react"
import type { ActionState } from "@/app/sandbox/actions"
import { createPortalBucket, updatePortalBucket } from "./dashboard-actions"
import type { DashboardBucket } from "./investor-data"
import type { FeatureChoice } from "./market-query"

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

export type BucketFormPreset = {
  name: string
  riskLow: number
  riskHigh: number
  industries: string
  countries: string
  currencies: string
  featureChoices: FeatureChoice[]
}

export function Dialog({
  title,
  description,
  wide = false,
  onClose,
  children,
}: {
  title: string
  description: string
  wide?: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-dialog-title"
        className={`w-full rounded-lg border border-border bg-white p-5 shadow-lg ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="portal-dialog-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500" aria-label="Close">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function BucketForm({
  bucket,
  features,
  preset,
  onSaved,
}: {
  bucket: DashboardBucket | null
  features: { id: string; name: string }[]
  preset?: BucketFormPreset
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState(bucket ? updatePortalBucket : createPortalBucket, null)
  useSaved(state, onSaved)
  const featureChoices = bucket?.featureChoices ?? preset?.featureChoices ?? []
  const featureModes = new Map(featureChoices.map((choice) => [choice.id, choice.mode]))
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {bucket ? <input type="hidden" name="id" value={bucket.id} /> : null}
      <label className="block text-sm text-neutral-600 sm:col-span-2">
        Name
        <input name="name" required defaultValue={bucket?.name ?? preset?.name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Status
        <select name="status" defaultValue={bucket?.status ?? "active"} className={inputClass}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </label>
      <label className="block text-sm text-neutral-600">
        APR as a fraction
        <input
          name="apr"
          type="number"
          min="0"
          step="0.0001"
          required
          placeholder="0.12 is 12%"
          defaultValue={bucket ? bucket.apr : 0.1}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Risk low
        <input
          name="risk_low"
          type="number"
          min="0"
          max="10000"
          step="1"
          required
          defaultValue={bucket?.riskLow ?? preset?.riskLow ?? 0}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Risk high
        <input
          name="risk_high"
          type="number"
          min="0"
          max="10000"
          step="1"
          required
          defaultValue={bucket?.riskHigh ?? preset?.riskHigh ?? 10000}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Face minimum
        <input name="face_min" type="number" min="0" step="0.01" required defaultValue={bucket?.faceMin ?? 0} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Face maximum
        <input name="face_max" type="number" min="0" step="0.01" required defaultValue={bucket?.faceMax ?? 1000000} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Tenor minimum days
        <input name="tenor_min" type="number" min="0" step="1" defaultValue={bucket?.tenorMin ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Tenor maximum days
        <input name="tenor_max" type="number" min="0" step="1" defaultValue={bucket?.tenorMax ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600 sm:col-span-2">
        Industries
        <input
          name="industries"
          placeholder="Comma separated. Blank matches any."
          defaultValue={bucket ? bucket.industries.join(", ") : (preset?.industries ?? "")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Countries
        <input
          name="countries"
          placeholder="BR, US. Blank matches any."
          defaultValue={bucket ? bucket.countries.join(", ") : (preset?.countries ?? "")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Currencies
        <input
          name="currencies"
          placeholder="BRL, USD. Blank matches any."
          defaultValue={bucket ? bucket.currencies.join(", ") : (preset?.currencies ?? "")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        Exposure
        <select name="exposure_kind" defaultValue={bucket?.exposureKind || "flat_usd"} className={inputClass}>
          <option value="flat_usd">Flat USD</option>
          <option value="portfolio_percent">Percent of portfolio</option>
        </select>
      </label>
      <label className="block text-sm text-neutral-600">
        Flat USD limit
        <input name="exposure_limit_usd" type="number" min="0" step="0.01" defaultValue={bucket?.exposureLimitUsd ?? 1000000} className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Portfolio percent
        <input
          name="exposure_limit_percent"
          type="number"
          min="0"
          step="0.01"
          defaultValue={bucket?.exposureLimitPercent ?? ""}
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-2">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Toggles</p>
        <p className="mt-1 text-sm text-neutral-500">Each toggle starts on Any. Has and Has not apply together.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {features.map((feature) => {
            const mode = featureModes.get(feature.id) ?? "any"
            return (
              <label key={feature.id} className="text-sm text-neutral-600">
                {feature.name}
                <select
                  name={`feature_mode_${feature.id}`}
                  key={`${feature.id}:${mode}`}
                  defaultValue={mode}
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="yes">Has</option>
                  <option value="no">Has not</option>
                </select>
              </label>
            )
          })}
        </div>
      </div>
      <div className="sm:col-span-2">
        <Feedback state={state} />
        <button type="submit" disabled={pending} className="mt-2 h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Saving" : "Save bucket"}
        </button>
      </div>
    </form>
  )
}

export function Feedback({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null
  return <p className={`text-sm ${state.error ? "text-red-700" : "text-neutral-600"}`}>{state.error ?? state.message}</p>
}

export function useSaved(state: ActionState, onSaved: () => void) {
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  useEffect(() => {
    if (state?.message) onSavedRef.current()
  }, [state])
}
