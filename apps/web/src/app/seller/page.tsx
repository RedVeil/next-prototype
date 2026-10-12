import { PortalHome } from "../portal/home"

export const dynamic = "force-dynamic"

export default async function SellerPage({ searchParams }: PageProps<"/seller">) {
  const params = await searchParams
  return <PortalHome role="seller" loginError={params.error === "1"} />
}