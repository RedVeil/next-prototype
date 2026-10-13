import { parseInvestorTab } from "./chart-model"
import { InvestorDashboard } from "./investor-dashboard"
import { loadInvestorDashboard } from "./investor-data"

export async function InvestorOverview({
  organisationId,
  tab,
}: {
  organisationId: string
  tab?: string
}) {
  const data = await loadInvestorDashboard(organisationId)
  return <InvestorDashboard data={data} tab={parseInvestorTab(tab)} />
}
