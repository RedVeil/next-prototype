import { cookies } from "next/headers"
import { cache } from "react"
import { loadPortalUsers, type PortalRole } from "./users"

const cookieName: Record<PortalRole, string> = {
  investor: "portal-investor",
  seller: "portal-seller",
}

export function portalCookie(role: PortalRole) {
  return cookieName[role]
}

export const portalSession = cache(async (role: PortalRole) => {
  const id = (await cookies()).get(cookieName[role])?.value
  if (!id) return null
  const users = await loadPortalUsers(role)
  return users.find((user) => user.id === id) ?? null
})
