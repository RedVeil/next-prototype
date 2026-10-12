import { RoleSidebar } from "../portal/role-sidebar"
import { portalSession } from "../portal/session"

export default async function InvestorLayout({ children }: LayoutProps<"/investor">) {
  const session = await portalSession("investor")

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col md:flex-row">
      {session ? <RoleSidebar role="investor" title="Investor" /> : null}
      {children}
    </div>
  )
}
