import { portalSession } from "./session"
import { loadPortalUsers, type PortalUser } from "./users"

export type NavProfile = {
  investor: PortalUser | null
  seller: PortalUser | null
  investors: PortalUser[]
  sellers: PortalUser[]
}

export async function loadNavProfile(): Promise<NavProfile> {
  try {
    const [investor, seller, investors, sellers] = await Promise.all([
      portalSession("investor"),
      portalSession("seller"),
      loadPortalUsers("investor"),
      loadPortalUsers("seller"),
    ])
    return { investor, seller, investors, sellers }
  } catch {
    return { investor: null, seller: null, investors: [], sellers: [] }
  }
}
