import { redirect } from "next/navigation"
import { InvestorInvitations } from "../../portal/investor-invitations"
import { MarketExplorer } from "../../portal/market-explorer"
import { loadMarket } from "../../portal/market-data"
import { parseMarketQuery } from "../../portal/market-query"
import { portalSession } from "../../portal/session"

export const dynamic = "force-dynamic"

export default async function MarketPage({ searchParams }: PageProps<"/investor/market">) {
  const session = await portalSession("investor")
  if (!session) redirect("/investor")
  const query = parseMarketQuery(await searchParams)
  const data = await loadMarket(query)
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {session.organisationId ? <InvestorInvitations organisationId={session.organisationId} /> : null}
      <MarketExplorer query={query} data={data} />
    </div>
  )
}
