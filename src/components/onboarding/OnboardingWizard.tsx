"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, LoaderCircle } from "lucide-react"
import { PLATFORM_NAME, sellerInitials } from "@/lib/mock-data"
import { useStore } from "@/lib/store"

const steps = [
  "Company",
  "NF-e / SEFAZ",
  "Duplicata",
  "Open Finance",
  "Bureau",
  "Ready",
] as const

function ConnectButton({
  label,
  connecting,
  onClick,
}: {
  label: string
  connecting: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={connecting}
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
    >
      {connecting && <LoaderCircle className="size-4 animate-spin" />}
      {connecting ? "Connecting…" : label}
    </button>
  )
}

export function OnboardingWizard() {
  const router = useRouter()
  const { seller, completeOnboarding } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(seller?.name ?? "")
  const [cnpj, setCnpj] = useState(seller?.cnpj ?? "")
  const [connecting, setConnecting] = useState(false)

  if (!seller) return null

  const currentSeller = seller

  function connectThenNext() {
    setConnecting(true)
    window.setTimeout(() => {
      setConnecting(false)
      setStep((value) => value + 1)
    }, 720)
  }

  function finish() {
    const legalName = name.trim() || currentSeller.name
    completeOnboarding({
      name: legalName,
      cnpj: cnpj.trim() || currentSeller.cnpj,
      initials: sellerInitials(legalName),
    })
    router.push("/seller/dashboard")
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold tracking-tight text-neutral-900">
          {PLATFORM_NAME}
        </p>
        <Link href="/seller/dashboard" className="text-sm text-neutral-500 hover:text-neutral-800">
          Back to app
        </Link>
      </div>

      <p className="mt-10 text-xs font-medium tracking-wide text-neutral-500 uppercase">
        Company setup
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
        {steps[step]}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Step {step + 1} of {steps.length}
      </p>

      <ol className="mt-6 flex gap-1">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`h-1 flex-1 rounded-full ${
              index <= step ? "bg-neutral-900" : "bg-neutral-200"
            }`}
          />
        ))}
      </ol>

      <section className="mt-8 rounded-lg border border-border bg-white p-6">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              You are onboarding as the seller (sacador). The buyer of the goods (sacado) does
              not need an account on this platform.
            </p>
            <label className="block text-sm">
              <span className="text-neutral-600">Legal name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-400"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">CNPJ</span>
              <input
                value={cnpj}
                onChange={(event) => setCnpj(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              Connect NF-e / SEFAZ to automatically verify invoices issued by this CNPJ. The
              NF-e evidences the underlying commercial sale. It does not, by itself, prove
              current ownership of the receivable.
            </p>
            <ConnectButton
              label="Connect NF-e / SEFAZ"
              connecting={connecting}
              onClick={connectThenNext}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              Connect Duplicata Escritural to confirm due date, buyer acceptance, current
              ownership, prior assignments and liens. This is the legal receivable register.
            </p>
            <ConnectButton
              label="Connect duplicata"
              connecting={connecting}
              onClick={connectThenNext}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              Open Finance is used only to analyse this company&apos;s bank accounts and match
              historical payments received from buyers.
            </p>
            <p className="rounded-md border border-border bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-600">
              Open Finance is connected to your company accounts. It does not provide access
              to your customers&apos; private bank balances.
            </p>
            <ul className="space-y-1 text-sm font-medium text-neutral-900">
              <li>Itaú</li>
              <li>Santander</li>
              <li>Banco do Brasil</li>
            </ul>
            <ConnectButton
              label="Connect Open Finance"
              connecting={connecting}
              onClick={connectThenNext}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              Public and bureau signals run automatically. They do not provide private
              financial statements.
            </p>
            <ul className="grid gap-2 text-sm text-neutral-800 sm:grid-cols-2">
              {[
                "Company registration",
                "Litigation",
                "Bankruptcy / restructuring",
                "Tax status",
                "Credit bureau signals",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-700" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Continue
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-neutral-600">
              {name.trim() || currentSeller.name} is ready to present eligible invoices. Financing
              is still subject to hard eligibility checks on each receivable.
            </p>
            <ul className="space-y-2 text-sm text-neutral-800">
              {[
                "NF-e / SEFAZ connected",
                "Duplicata Escritural connected",
                "Seller Open Finance connected",
                "Public / bureau data automatic",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-700" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={finish}
              className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Go to overview
            </button>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
