import { PortalHome } from "../portal/home"

export const dynamic = "force-dynamic"

export default async function InvestorPage({ searchParams }: PageProps<"/investor">) {
  const params = await searchParams
  return <PortalHome role="investor" loginError={params.error === "1"} />
}
