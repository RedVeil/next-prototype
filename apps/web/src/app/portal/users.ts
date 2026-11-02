import { cache } from "react"
import { createServiceClient } from "@/lib/supabase/service"

export type PortalRole = "investor" | "seller"

export type PortalUser = {
  id: string
  username: string
  organisationId: string
  organisation: string
}

export const loadPortalUsers = cache(async (role: PortalRole): Promise<PortalUser[]> => {
  const supabase = createServiceClient()
  const [identities, members, roles, organisations] = await Promise.all([
    supabase.from("identities").select("id, username"),
    supabase.from("organisation_members").select("id, identity_id, organisation_id"),
    supabase.from("membership_roles").select("member_id, role").eq("role", role),
    supabase.from("organisations").select("id, legal_name"),
  ])

  const failed = [identities, members, roles, organisations].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const memberById = new Map((members.data ?? []).map((row) => [row.id as string, row]))
  const usernameById = new Map(
    (identities.data ?? []).map((row) => [row.id as string, row.username as string]),
  )
  const organisationName = new Map(
    (organisations.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )

  const users: PortalUser[] = []
  for (const roleRow of roles.data ?? []) {
    const member = memberById.get(roleRow.member_id as string)
    if (!member) continue
    const id = member.identity_id as string
    const username = usernameById.get(id)
    if (!username) continue
    const organisationId = member.organisation_id as string
    users.push({
      id,
      username,
      organisationId,
      organisation: organisationName.get(organisationId) ?? "",
    })
  }

  users.sort((a, b) => a.username.localeCompare(b.username) || a.organisation.localeCompare(b.organisation))
  return users
})
