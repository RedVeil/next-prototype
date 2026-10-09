"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { submitInvestorApplication } from "@/lib/actions"
import { InvestorWalletConnector } from "@/components/wallet/XrplWalletProvider"
import { useWallet } from "@xrpl-commons/xrpl-connect-react"
import { PLATFORM_NAME } from "@/lib/brand"
import { useSession } from "@/lib/session"

const steps = ["Identity", "KYB", "Ready"] as const
const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-400"

export function InvestorOnboardingWizard() {
  const router = useRouter()
  const { session, refresh } = useSession()
  const investor = session.investor
  const [step, setStep] = useState(0)
  const lockedAddress = investor?.own_xrpl_address ?? ""
  const [name, setName] = useState(investor?.legal_name ?? "")
  const [address, setAddress] = useState(lockedAddress)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { account } = useWallet()
  const chosenAddress = lockedAddress || account?.address || address

  useEffect(() => {
    if (lockedAddress) return
    if (account?.address) setAddress(account.address)
  }, [account?.address, lockedAddress])

  async function finish() {
    if (!session.settings.investorApplicationsAllowed && !investor) {
      setError("New investor applications are stopped. This form is not accepting submissions.")
      return
    }
    if (investor?.access_status === "stopped") {
      setError("This investor is stopped and cannot submit again.")
      return
    }
    if (!chosenAddress) {
      setError("Connect the wallet this investor will use.")
      return
    }
    setPending(true)
    const result = await submitInvestorApplication({ legalName: name, xrplAddress: chosenAddress })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    router.push("/investor/dashboard")
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold tracking-tight text-neutral-900">{PLATFORM_NAME}</p>
          <Link href="/investor/dashboard" className="text-sm text-neutral-500 hover:text-neutral-800">
            Back to app
          </Link>
        </div>
        <p className="mt-10 text-xs font-medium tracking-wide text-neutral-500 uppercase">Investor setup</p>
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
                The legal name identifies the investor. Connect the wallet that will sign on multisig 1 and deposit RLUSD. That account cannot be changed later except by an admin.
              </p>
              <label className="block text-sm">
                <span className="text-neutral-600">Legal name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              {lockedAddress ? (
                <p className="break-all text-sm text-neutral-700">
                  <span className="block text-neutral-500">XRPL account</span>
                  {lockedAddress}
                </p>
              ) : (
                <InvestorWalletConnector onConnect={setAddress} />
              )}
              <button
                type="button"
                disabled={!chosenAddress}
                onClick={() => {
                  if (!chosenAddress) {
                    setError("Connect the wallet this investor will use.")
                    return
                  }
                  setError(null)
                  setStep(1)
                }}
                className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
              >
                Continue
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Know Your Business is shown here and skipped. A provider such as Sumsub is wired in later.
              </p>
              <button type="button" onClick={() => setStep(2)} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                Skip for now
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-neutral-600">
                Submitting sets this investor to pending. Deposits and mandate buckets stay locked until an admin accepts the application. Acceptance creates the two multisig accounts on XRPL.
              </p>
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
