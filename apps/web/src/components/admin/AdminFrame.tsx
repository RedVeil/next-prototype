"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ADMIN_NAV } from "@/components/layout/Sidebar"
import { PLATFORM_NAME } from "@/lib/brand"

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-white lg:block">
        <div className="flex h-16 items-center border-b border-border px-5">
          <p className="text-[15px] font-semibold tracking-tight">{PLATFORM_NAME}</p>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {ADMIN_NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm ${
                  active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <p className="px-5 py-4 text-xs text-neutral-400">Admin is not linked from the landing page.</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 overflow-x-auto border-b border-border bg-white px-4 lg:hidden">
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 text-sm text-neutral-700">
              {item.label}
            </Link>
          ))}
        </header>
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
