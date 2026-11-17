import { createServiceClient } from "@/lib/supabase/service"
import { InvestorDashboard } from "./investor-dashboard"
import { loadInvestorShell } from "./investor-data"

export async function InvestorOverview({
  organisationId,
  identityId,
}: {
  organisationId: string
  identityId: string
}) {
  const supabase = createServiceClient()
  const [data, identity] = await Promise.all([
    loadInvestorShell(organisationId),
    supabase.from("identities").select("xrpl_address").eq("id", identityId).maybeSingle(),
  ])
  if (identity.error) throw new Error(identity.error.message)
  const walletAddress = typeof identity.data?.xrpl_address === "string" ? identity.data.xrpl_address : ""
  return <InvestorDashboard data={data} walletAddress={walletAddress} />
}
