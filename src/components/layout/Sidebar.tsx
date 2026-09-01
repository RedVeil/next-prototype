"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CheckCircle2,
  FileText,
  LayoutGrid,
  Layers,
  Link2,
  Receipt,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { PLATFORM_NAME } from "@/lib/mock-data"

export type SidebarNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const SELLER_NAV: SidebarNavItem[] = [
  { href: "/seller/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/seller/invoices", label: "Invoices", icon: FileText },
  { href: "/seller/sold", label: "Sold invoices", icon: CheckCircle2 },
  { href: "/seller/connections", label: "Connections", icon: Link2 },
]

export const INVESTOR_NAV: SidebarNavItem[] = [
  { href: "/investor/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/investor/buckets", label: "Investment Buckets", icon: Layers },
  { href: "/investor/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/investor/transactions", label: "Transactions", icon: Receipt },
  { href: "/investor/account", label: "Account", icon: UserRound },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

type SidebarProps = {
  nav: SidebarNavItem[]
  homeHref: string
  footer: string
  mobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({
  nav,
  homeHref,
  footer,
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col self-stretch border-r border-border bg-white lg:static lg:z-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } transition-transform`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href={homeHref} className="text-[15px] font-semibold tracking-tight text-neutral-900">
            {PLATFORM_NAME}
          </Link>
          <button
            type="button"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {nav.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-neutral-100 font-medium text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <p className="border-t border-border px-5 py-4 text-xs text-neutral-400">{footer}</p>
      </aside>
    </>
  )
}
