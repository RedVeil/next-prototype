"use client"

import { Suspense } from "react"
import Link from "next/link"
import { PartyLock } from "@/components/layout/PartyLock"
import { InvestorDashboard } from "@/components/investor/dashboard/InvestorDashboard"
import { useSession } from "@/lib/session"

export default function InvestorDashboardPage() {
  const { session } = useSession()
  const investor = session.investor

  if (!investor) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Finish investor setup</h1>
        <p className="mt-3 text-sm text-neutral-600">Submit the application, including the XRPL address that will sign for this investor.</p>
        <Link href="/investor/onboarding" className="mt-4 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
          Continue setup
        </Link>
      </div>
    )
  }

  if (investor.application_status !== "accepted") {
    return (
      <PartyLock
        title="Still in onboarding"
        body="Deposits and mandate buckets stay unavailable until an admin accepts this investor. Acceptance creates the two multisig accounts."
      />
    )
  }

  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading dashboard…</p>}>
      <InvestorDashboard />
    </Suspense>
  )
}
