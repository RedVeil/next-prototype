import { RoleSidebar } from "../portal/role-sidebar"
import { portalSession } from "../portal/session"

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const session = await portalSession("seller")

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col md:flex-row">
      {session ? <RoleSidebar role="seller" title="Seller" /> : null}
      {children}
    </div>
  )
}
