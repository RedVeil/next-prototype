"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import { signOut } from "@/lib/actions"
import { initials, PLATFORM_NAME } from "@/lib/brand"
import { useSession } from "@/lib/session"

export function TopBar({ onMenuClick, homeHref }: { onMenuClick?: () => void; homeHref?: string }) {
  const { session } = useSession()
  const name =
    session.role === "investor" ? session.investor?.legal_name : session.company?.legal_name
  const detail =
    session.role === "investor"
      ? "Investor"
      : session.company?.tax_id
        ? `Tax id ${session.company.tax_id}`
        : session.email

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6">
      {onMenuClick ? (
        <button
          type="button"
          className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      ) : (
        homeHref && (
          <Link href={homeHref} className="text-[15px] font-semibold tracking-tight text-neutral-900">
            {PLATFORM_NAME}
          </Link>
        )
      )}
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <form action={signOut}>
          <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-800">
            Log out
          </button>
        </form>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-900">{name || session.email}</p>
          <p className="text-xs text-neutral-500">{detail}</p>
        </div>
        <div
          className="flex size-9 items-center justify-center rounded-full border border-border bg-neutral-100 text-xs font-medium text-neutral-700"
          aria-label="Account"
        >
          {initials(name || session.email || "?")}
        </div>
      </div>
    </header>
  )
}
