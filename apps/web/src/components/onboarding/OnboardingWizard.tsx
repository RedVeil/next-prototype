"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GOODS_AND_SERVICES, INDUSTRIES } from "@antecipa/domain"
import { submitCompanyApplication } from "@/lib/actions"
import { PLATFORM_NAME } from "@/lib/brand"
import { useSession } from "@/lib/session"
import { ChipSelect } from "@/components/ui/ChipSelect"

const steps = ["Identity", "KYB", "API connections", "Ready"] as const
const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-400"

export function OnboardingWizard() {
  const router = useRouter()
  const { session, refresh } = useSession()
  const company = session.company
  const [step, setStep] = useState(0)
  const [name, setName] = useState(company?.legal_name ?? "")
  const [taxId, setTaxId] = useState(company?.tax_id ?? "")
  const [industries, setIndustries] = useState<string[]>(company?.industries ?? [])
  const [description, setDescription] = useState(company?.business_description ?? "")
  const [goods, setGoods] = useState<string[]>(company?.goods_and_services ?? [])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  async function finish() {
    if (!session.settings.companyApplicationsAllowed && !company) {
      setError("New company applications are stopped. This form is not accepting submissions.")
      return
    }
    if (company?.access_status === "stopped") {
      setError("This company is stopped and cannot continue an application.")
      return
    }
    setPending(true)
    const result = await submitCompanyApplication({
      legalName: name,
      taxId,
      industries,
      businessDescription: description,
      goodsAndServices: goods,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    router.push("/seller/dashboard")
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold tracking-tight text-neutral-900">{PLATFORM_NAME}</p>
          <Link href="/seller/dashboard" className="text-sm text-neutral-500 hover:text-neutral-800">
            Back to app
          </Link>
        </div>
        <p className="mt-10 text-xs font-medium tracking-wide text-neutral-500 uppercase">Company setup</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{steps[step]}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Step {step + 1} of {steps.length}
        </p>
        <ol className="mt-6 flex gap-1">
          {steps.map((label, index) => (
            <li key={label} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-neutral-900" : "bg-neutral-200"}`} />
          ))}
        </ol>
        <section className="mt-8 rounded-lg border border-border bg-white p-6">
          {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Tell us who the company is. Country of origin is Brazil for this slice.
              </p>
              <label className="block text-sm">
                <span className="text-neutral-600">Legal name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-600">Tax or registration number</span>
                <input value={taxId} onChange={(event) => setTaxId(event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-600">Country of origin</span>
                <input value="Brazil" readOnly className={`${inputClass} bg-neutral-50`} />
              </label>
              <fieldset>
                <legend className="text-sm text-neutral-600">Industries</legend>
                <ChipSelect options={INDUSTRIES} selected={industries} onToggle={(value) => toggle(industries, value, setIndustries)} />
              </fieldset>
              <label className="block text-sm">
                <span className="text-neutral-600">Business description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={inputClass} />
              </label>
              <button type="button" onClick={() => setStep(1)} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                Continue
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Know Your Business is shown here and skipped. No KYB provider is called.
              </p>
              <button type="button" onClick={() => setStep(2)} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                Skip for now
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Open Finance and NF-e are shown here and skipped. No connection is made.
              </p>
              <button type="button" onClick={() => setStep(3)} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                Skip for now
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Submitting sets this company to pending. Invoice views stay empty until an admin accepts the application.
              </p>
              <fieldset>
                <legend className="text-sm text-neutral-600">Goods and services</legend>
                <ChipSelect options={GOODS_AND_SERVICES} selected={goods} onToggle={(value) => toggle(goods, value, setGoods)} />
              </fieldset>
              <button
                type="button"
                disabled={pending}
                onClick={() => void finish()}
                className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
              >
                Submit application
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
