import { notFound, redirect } from "next/navigation"
import { CompanyProfileView } from "../../../portal/company-profile"
import { loadCompanyProfile } from "../../../portal/market-data"
import { portalSession } from "../../../portal/session"

export const dynamic = "force-dynamic"

export default async function CompanyPage({ params }: PageProps<"/investor/companies/[id]">) {
  const session = await portalSession("investor")
  if (!session) redirect("/investor")
  const { id } = await params
  const profile = await loadCompanyProfile(id)
  if (!profile) notFound()
  return <CompanyProfileView profile={profile} />
}
