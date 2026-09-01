"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { availableCapital, remainingBucketCapacity } from "@/lib/capital"
import {
  calculateBucketMatchStats,
  draftToRules,
  previewMatchingInvoices,
} from "@/lib/bucket-match"
import { defaultBucketDraft } from "@/lib/investor-seed"
import { MARKET_INVOICES } from "@/lib/market-invoices"
import { useStore } from "@/lib/store"
import {
  formatBRL,
  formatCompactBRL,
  formatIndustries,
  formatPercent,
  formatScoreRange,
} from "@/lib/format"
import { INDUSTRIES, type BucketDraft, type Confidence, type InvestmentBucket } from "@/lib/types"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { MatchingAnalysis } from "./MatchingAnalysis"

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
const labelClass = "block text-sm text-neutral-600"
const helperClass = "mt-1 text-xs leading-relaxed text-neutral-500"

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function ruleLines(draft: BucketDraft): string[] {
  const lines = [
    `Score ${formatScoreRange(draft.scoreMin, draft.scoreMax)}`,
    formatIndustries(draft.industries),
  ]
  if (draft.tenorMax < 60 || draft.tenorMin > 0) {
    lines.push(
      draft.tenorMin > 0
        ? `${draft.tenorMin}–${draft.tenorMax} days`
        : `≤ ${draft.tenorMax} days`,
    )
  }
  if (draft.invoiceMax != null) {
    lines.push(`Invoices ≤ ${formatBRL(draft.invoiceMax)}`)
  }
  return lines
}

export function BucketEditor({
  mode,
  bucket,
}: {
  mode: "create" | "edit"
  bucket?: InvestmentBucket
}) {
  const router = useRouter()
  const { investor, createBucket, updateBucket } = useStore()
  const [draft, setDraft] = useState<BucketDraft>(
    bucket
      ? {
          name: bucket.name,
          capitalCap: bucket.capitalCap,
          requiredApr: bucket.requiredApr,
          scoreMin: bucket.scoreMin,
          scoreMax: bucket.scoreMax,
          industries: [...bucket.industries],
          tenorMin: bucket.tenorMin ?? 0,
          tenorMax: bucket.tenorMax ?? 60,
          invoiceMin: bucket.invoiceMin,
          invoiceMax: bucket.invoiceMax,
          minimumConfidence: bucket.minimumConfidence,
          minHistoricalInvoices: bucket.minHistoricalInvoices,
          minPlatformRepayments: bucket.minPlatformRepayments,
          maxLatePaymentRate: bucket.maxLatePaymentRate,
          maxBuyerExposure: bucket.maxBuyerExposure,
          maxSellerExposure: bucket.maxSellerExposure,
          maxBuyerPortfolioPercent: bucket.maxBuyerPortfolioPercent,
        }
      : defaultBucketDraft(),
  )
  const [confirmOpen, setConfirmOpen] = useState(false)

  const stats = useMemo(
    () => calculateBucketMatchStats(draftToRules(draft), MARKET_INVOICES),
    [draft],
  )
  const previews = useMemo(
    () => previewMatchingInvoices(draftToRules(draft), MARKET_INVOICES),
    [draft],
  )

  if (!investor) return null

  const currentInvestor = investor
  const available = availableCapital(currentInvestor)
  const remaining = remainingBucketCapacity({
    capitalCap: draft.capitalCap,
    currentExposure: bucket?.currentExposure ?? 0,
  })
  const through = Math.min(available, remaining)

  function patch(update: Partial<BucketDraft>) {
    setDraft((current) => ({ ...current, ...update }))
  }

  function toggleIndustry(industry: string) {
    if (industry === "Any") {
      patch({ industries: ["Any"] })
      return
    }
    const selected = draft.industries.filter((item) => item !== "Any")
    const next = selected.includes(industry)
      ? selected.filter((item) => item !== industry)
      : [...selected, industry]
    patch({ industries: next.length > 0 ? next : ["Any"] })
  }

  function handleSubmit() {
    if (!draft.name.trim()) return
    if (mode === "create") {
      setConfirmOpen(true)
      return
    }
    if (!bucket) return
    updateBucket(bucket.id, draft)
    router.push("/investor/buckets")
  }

  function activate() {
    createBucket(draft)
    setConfirmOpen(false)
    router.push("/investor/dashboard")
  }

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        {mode === "create" ? "New mandate" : "Edit mandate"}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
        {mode === "create" ? "Create investment bucket" : "Edit investment bucket"}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        Buckets are standing investment mandates against your shared committed capital. They do not
        create a separate wallet or deposit.
      </p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <form
          className="rounded-lg border border-border bg-white p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <label className={labelClass}>
            Bucket name
            <input
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Agriculture / Strong Credit"
              className={inputClass}
              required
            />
          </label>

          <label className={`${labelClass} mt-5`}>
            Capital cap
            <input
              type="number"
              step={1000}
              value={draft.capitalCap}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                patch({ capitalCap: Number.isFinite(parsed) ? parsed : 0 })
              }}
              className={inputClass}
            />
            <p className={helperClass}>
              This is the maximum amount of your committed capital that may be allocated through
              this bucket. The cap does not deploy this amount immediately. Committed capital:{" "}
              {formatBRL(currentInvestor.committedCapital)}.
            </p>
          </label>

          <label className={`${labelClass} mt-5`}>
            Required APR
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.requiredApr}
              onChange={(event) => patch({ requiredApr: Number(event.target.value) || 0 })}
              className={inputClass}
            />
            <p className={helperClass}>
              Only invoices offering at least this annualized return can use this bucket.
            </p>
          </label>

          <fieldset className="mt-5">
            <legend className="text-sm text-neutral-600">Risk score</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Minimum
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={draft.scoreMin}
                  onChange={(event) =>
                    patch({ scoreMin: Math.min(Number(event.target.value) || 0, draft.scoreMax) })
                  }
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Maximum
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={draft.scoreMax}
                  onChange={(event) =>
                    patch({ scoreMax: Math.max(Number(event.target.value) || 0, draft.scoreMin) })
                  }
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-3">
              <div className="relative h-2 rounded-full bg-neutral-200">
                <div
                  className="absolute h-2 rounded-full bg-neutral-900"
                  style={{
                    left: `${draft.scoreMin}%`,
                    width: `${Math.max(0, draft.scoreMax - draft.scoreMin)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-neutral-500">
                <span>{draft.scoreMin}</span>
                <span>───────────────</span>
                <span>{draft.scoreMax}</span>
              </div>
            </div>
            <p className={helperClass}>
              The platform&apos;s automated invoice risk score. Higher scores indicate lower
              estimated risk.
            </p>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm text-neutral-600">Industry</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {INDUSTRIES.map((industry) => {
                const selected = draft.industries.includes(industry)
                return (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => toggleIndustry(industry)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-border bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    {industry}
                  </button>
                )
              })}
            </div>
            <p className={helperClass}>
              Multiple industries are combined with OR. Choosing Any clears other selections.
            </p>
          </fieldset>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Minimum tenor (days)
              <input
                type="number"
                min={0}
                value={draft.tenorMin}
                onChange={(event) => patch({ tenorMin: Number(event.target.value) || 0 })}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Maximum tenor (days)
              <input
                type="number"
                min={0}
                value={draft.tenorMax}
                onChange={(event) => patch({ tenorMax: Number(event.target.value) || 0 })}
                className={inputClass}
              />
            </label>
          </div>
          <p className={helperClass}>Default range is 0–60 days.</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Minimum invoice value
              <input
                type="number"
                min={0}
                placeholder="Optional"
                value={draft.invoiceMin ?? ""}
                onChange={(event) => patch({ invoiceMin: parseOptionalNumber(event.target.value) })}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Maximum invoice value
              <input
                type="number"
                min={0}
                placeholder="Optional"
                value={draft.invoiceMax ?? ""}
                onChange={(event) => patch({ invoiceMax: parseOptionalNumber(event.target.value) })}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
            {through < remaining && (
              <p>
                Up to {formatCompactBRL(available)} can currently be deployed through this bucket
                because only {formatCompactBRL(available)} of committed capital remains available.
              </p>
            )}
            {remaining <= 100_000 && remaining > 0 && (
              <p className={through < remaining ? "mt-2" : ""}>
                Only {formatCompactBRL(remaining)} of bucket capacity remains.
              </p>
            )}
            {through >= remaining && remaining > 100_000 && (
              <p>
                Available through this bucket: {formatCompactBRL(through)} — the lesser of remaining
                bucket capacity and available committed capital.
              </p>
            )}
          </div>

          <details className="mt-6 rounded-md border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-900">
              Advanced filters
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <label className={labelClass}>
                Minimum score confidence
                <select
                  value={draft.minimumConfidence ?? ""}
                  onChange={(event) =>
                    patch({
                      minimumConfidence: (event.target.value || undefined) as Confidence | undefined,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Any</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>

              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Buyer history
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={labelClass}>
                  Min historical invoices
                  <input
                    type="number"
                    min={0}
                    value={draft.minHistoricalInvoices ?? ""}
                    onChange={(event) =>
                      patch({ minHistoricalInvoices: parseOptionalNumber(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Min platform repayments
                  <input
                    type="number"
                    min={0}
                    value={draft.minPlatformRepayments ?? ""}
                    onChange={(event) =>
                      patch({ minPlatformRepayments: parseOptionalNumber(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Max late-payment rate (%)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={draft.maxLatePaymentRate ?? ""}
                    onChange={(event) =>
                      patch({ maxLatePaymentRate: parseOptionalNumber(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Concentration controls
              </p>
              <p className={helperClass}>
                Portfolio constraints applied at allocation time. They do not change matching
                invoice counts.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={labelClass}>
                  Max exposure per buyer
                  <input
                    type="number"
                    min={0}
                    value={draft.maxBuyerExposure ?? ""}
                    onChange={(event) =>
                      patch({ maxBuyerExposure: parseOptionalNumber(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Max exposure per seller
                  <input
                    type="number"
                    min={0}
                    value={draft.maxSellerExposure ?? ""}
                    onChange={(event) =>
                      patch({ maxSellerExposure: parseOptionalNumber(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Max % of portfolio per buyer
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.maxBuyerPortfolioPercent ?? ""}
                    onChange={(event) =>
                      patch({
                        maxBuyerPortfolioPercent: parseOptionalNumber(event.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          </details>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {mode === "create" ? "Create Investment Bucket" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/investor/buckets")}
              className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>

        <MatchingAnalysis stats={stats} previews={previews} />
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Activate this bucket?"
          confirmLabel="Activate Bucket"
          onClose={() => setConfirmOpen(false)}
          onConfirm={activate}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Capital cap</dt>
              <dd className="font-medium text-neutral-900">{formatBRL(draft.capitalCap)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Required APR</dt>
              <dd className="font-medium text-neutral-900">{formatPercent(draft.requiredApr, 1)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Rules</dt>
              <dd className="font-medium text-neutral-900">{ruleLines(draft).join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Current opportunities</dt>
              <dd className="font-medium text-neutral-900">
                {stats.currentInvoiceCount} invoices / {formatCompactBRL(stats.currentFaceValue)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Historical matches</dt>
              <dd className="font-medium text-neutral-900">
                {stats.historicalInvoiceCount} invoices / {formatCompactBRL(stats.historicalFaceValue)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 leading-relaxed text-neutral-600">
            Activating this bucket authorizes the platform to automatically allocate your committed
            capital to invoices that satisfy these rules, subject to your available capital and
            portfolio limits.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
