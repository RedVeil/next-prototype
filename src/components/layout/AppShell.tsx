"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar, SELLER_NAV, INVESTOR_NAV, type SidebarNavItem } from "./Sidebar"
import { TopBar } from "./TopBar"
import { useStore } from "@/lib/store"
import type { SessionRole } from "@/lib/types"

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

function RoleShell({
  children,
  requiredRole,
  nav,
  homeHref,
  footer,
}: {
  children: React.ReactNode
  requiredRole: SessionRole
  nav: SidebarNavItem[]
  homeHref: string
  footer: string
}) {
  const { role, seller, investor } = useStore()
  const router = useRouter()
  const entity = requiredRole === "investor" ? investor : seller
  const ready = role === requiredRole && Boolean(entity)

  useEffect(() => {
    if (role !== requiredRole) {
      router.replace("/")
    }
  }, [role, requiredRole, router])

  return (
    <Shell ready={ready} nav={nav} homeHref={homeHref} footer={footer}>
      {children}
    </Shell>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleShell
      requiredRole="seller"
      nav={SELLER_NAV}
      homeHref="/seller/dashboard"
      footer="Invoice financing for Brazilian SMEs"
    >
      {children}
    </RoleShell>
  )
}

export function InvestorAppShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleShell
      requiredRole="investor"
      nav={INVESTOR_NAV}
      homeHref="/investor/dashboard"
      footer="Standing mandates against shared committed capital"
    >
      {children}
    </RoleShell>
  )
}
