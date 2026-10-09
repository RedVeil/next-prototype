import { Suspense } from "react"
import Link from "next/link"
import { PartyLock } from "@/components/layout/PartyLock"
import { InvestorDashboard } from "@/components/investor/dashboard/InvestorDashboard"
import { getAdminInvestorPreview } from "@/lib/actions"

export default async function AdminInvestorPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let preview
  try {
    preview = await getAdminInvestorPreview(id)
  } catch (error) {
    if (error instanceof Error && (error.message === "Not signed in" || error.message === "Not an admin")) return null
    throw error
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/investors" className="text-sm text-neutral-500 hover:text-neutral-800">
        Investors
      </Link>
      <div className="mt-6">
        {!preview && <p className="text-sm text-neutral-600">Investor not found.</p>}
        {preview && preview.applicationStatus !== "accepted" && (
          <PartyLock
            title="Still in onboarding"
            body="Deposits and mandate buckets stay unavailable until an admin accepts this investor. Acceptance creates the two multisig accounts."
          />
        )}
        {preview?.dashboard && (
          <Suspense fallback={<p className="text-sm text-neutral-500">Loading dashboard…</p>}>
            <InvestorDashboard readOnly initialData={preview.dashboard} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
