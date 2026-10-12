"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutPortal } from "./actions"
import type { PortalRole } from "./users"

const home = {
  investor: "/investor",
  seller: "/seller",
} as const

export function RoleSidebar({ role, title }: { role: PortalRole; title: string }) {
  const pathname = usePathname()
  const href = home[role]
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside className="sticky top-14 z-10 flex items-center justify-between border-b border-border bg-surface md:h-[calc(100vh-3.5rem)] md:w-56 md:shrink-0 md:flex-col md:items-stretch md:border-r md:border-b-0">
      <div className="px-5 py-4 md:pt-5 md:pb-2">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
      </div>
      <nav aria-label={title} className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-6">
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
            active ? "bg-background font-medium" : "text-muted hover:text-foreground"
          }`}
        >
          Overview
        </Link>
      </nav>
      <form action={logoutPortal} className="px-3 md:mt-auto md:pb-6">
        <input type="hidden" name="role" value={role} />
        <button type="submit" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground">
          Log out
        </button>
      </form>
    </aside>
  )
}
