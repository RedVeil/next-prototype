import { redirect } from "next/navigation"
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
  return <MarketExplorer query={query} data={data} />
}
