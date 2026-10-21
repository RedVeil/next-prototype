import { createServiceClient } from "@/lib/supabase/service"
import { parseInvestorTab } from "./chart-model"
import { InvestorDashboard } from "./investor-dashboard"
import { loadInvestorDashboard } from "./investor-data"

export async function InvestorOverview({
  organisationId,
  identityId,
  tab,
}: {
  organisationId: string
  identityId: string
  tab?: string
}) {
  const supabase = createServiceClient()
  const [data, identity] = await Promise.all([
    loadInvestorDashboard(organisationId),
    supabase.from("identities").select("xrpl_address").eq("id", identityId).maybeSingle(),
  ])
  if (identity.error) throw new Error(identity.error.message)
  const walletAddress = typeof identity.data?.xrpl_address === "string" ? identity.data.xrpl_address : ""
  return <InvestorDashboard data={data} walletAddress={walletAddress} tab={parseInvestorTab(tab)} />
}
