"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, LoaderCircle } from "lucide-react"
import { FRESH_CONNECTED_WALLET, PLATFORM_NAME, sellerInitials } from "@/lib/mock-data"
import { useStore } from "@/lib/store"

const steps = ["Company", "KYB", "Wallet", "Ready"] as const

function ActionButton({
  label,
  busyLabel,
  busy,
  onClick,
}: {
  label: string
  busyLabel: string
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
    >
      {busy && <LoaderCircle className="size-4 animate-spin" />}
      {busy ? busyLabel : label}
    </button>
  )
}

export function InvestorOnboardingWizard() {
  const router = useRouter()
  const { investor, completeInvestorOnboarding } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(investor?.name ?? "")
  const [cnpj, setCnpj] = useState(investor?.cnpj ?? "")
  const [busy, setBusy] = useState(false)

  if (!investor) return null

  const currentInvestor = investor

  function runThenNext() {
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      setStep((value) => value + 1)
    }, 720)
  }

  function finish() {
    const legalName = name.trim() || currentInvestor.name
    completeInvestorOnboarding(
      {
        ...currentInvestor,
        name: legalName,
        cnpj: cnpj.trim() || currentInvestor.cnpj,
        initials: sellerInitials(legalName),
        status: "verified",
      },
      FRESH_CONNECTED_WALLET,
    )
    router.push("/investor/dashboard")
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold tracking-tight text-neutral-900">
            {PLATFORM_NAME}
          </p>
          <Link href="/investor/dashboard" className="text-sm text-neutral-500 hover:text-neutral-800">
            Back to app
          </Link>
        </div>

        <p className="mt-10 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Investor setup
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
                You are onboarding as an investor. Know Your Business checks run on this legal
                entity before capital can be deployed.
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
                Mock KYB verifies company registration, beneficial owners, tax status and
                litigation. No documents are uploaded in this prototype.
              </p>
              <ul className="grid gap-2 text-sm text-neutral-800 sm:grid-cols-2">
                {[
                  "Company registration",
                  "Ultimate beneficial owners",
                  "Tax status",
                  "Litigation",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-700" />
                    {item}
                  </li>
                ))}
              </ul>
              <ActionButton
                label="Run KYB"
                busyLabel="Verifying…"
                busy={busy}
                onClick={runThenNext}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Connect a settlement wallet. Funds for receivable purchases and investor
                settlement flow through this address.
              </p>
              <p className="rounded-md border border-border bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-600">
                This is a mock connection. No real wallet is requested or signed.
              </p>
              <ActionButton
                label="Connect wallet"
                busyLabel="Connecting…"
                busy={busy}
                onClick={runThenNext}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                {name.trim() || currentInvestor.name} is ready to finance eligible receivables.
              </p>
              <ul className="space-y-2 text-sm text-neutral-800">
                {[
                  "KYB approved",
                  `Wallet connected · ${FRESH_CONNECTED_WALLET.address}`,
                  `${FRESH_CONNECTED_WALLET.network} · settlement wallet verified`,
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
