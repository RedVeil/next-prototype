"use client"

import { useEffect, useState } from "react"
import { Sidebar, SELLER_NAV, type SidebarNavItem } from "./Sidebar"
import { TopBar } from "./TopBar"
import { useSession } from "@/lib/session"
import { usePathname, useRouter } from "next/navigation"

function Shell({
  children,
  ready,
  nav,
  homeHref,
  footer,
}: {
  children: React.ReactNode
  ready: boolean
  nav: SidebarNavItem[]
  homeHref: string
  footer: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!ready) return null

  return (
    <div className="flex min-h-dvh flex-1">
      <Sidebar
        nav={nav}
        homeHref={homeHref}
        footer={footer}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const accepted = session.company?.application_status === "accepted"
  const nav = accepted ? SELLER_NAV : SELLER_NAV.filter((item) => item.href === "/seller/dashboard")

  useEffect(() => {
    if (loading || pathname.startsWith("/admin")) return
    if (session.role !== "company") router.replace("/")
  }, [loading, pathname, router, session.role])

  return (
    <Shell ready={!loading && session.role === "company"} nav={nav} homeHref="/seller/dashboard" footer="Invoice financing for Brazilian SMEs">
      {children}
    </Shell>
  )
}

export function InvestorAppShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading || pathname.startsWith("/admin")) return
    if (session.role !== "investor") router.replace("/")
  }, [loading, pathname, router, session.role])

  if (loading || session.role !== "investor") return null

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <TopBar homeHref="/investor/dashboard" />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
