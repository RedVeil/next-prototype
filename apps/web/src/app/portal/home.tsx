import { AuthSplit } from "./auth-split"
import { InvestorOverview } from "./investor-overview"
import { portalSession } from "./session"
import { SellerOverview } from "./seller-overview"
import { loadPortalUsers, type PortalRole } from "./users"

function Problem({ detail }: { detail: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-sm text-red-700">{detail}</p>
    </main>
  )
}

export async function PortalHome({
  role,
  loginError,
  query = {},
}: {
  role: PortalRole
  loginError?: boolean
  query?: Record<string, string | string[] | undefined>
}) {
  let session: Awaited<ReturnType<typeof portalSession>> = null
  let users: Awaited<ReturnType<typeof loadPortalUsers>> = []
  let detail = ""

  try {
    session = await portalSession(role)
    if (!session) users = await loadPortalUsers(role)
  } catch (error) {
    detail = error instanceof Error ? error.message : "The database did not respond."
  }

  if (detail) return <Problem detail={detail} />
  if (!session) return <AuthSplit role={role} users={users} loginError={loginError} />
  if (!session.organisationId) return <Problem detail="This user is not linked to an organisation." />

  try {
    if (role === "investor") {
      const tab = query.tab
      return await InvestorOverview({
        organisationId: session.organisationId,
        tab: Array.isArray(tab) ? tab[0] : tab,
      })
    }
    return await SellerOverview({
      organisationId: session.organisationId,
      organisation: session.organisation,
      query,
    })
  } catch (error) {
    return <Problem detail={error instanceof Error ? error.message : "The database did not respond."} />
  }
}
