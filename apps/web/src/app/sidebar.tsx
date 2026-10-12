"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const pages = [
  { href: "/sandbox", label: "Demo data" },
  { href: "/match", label: "Matching" },
]

export function Sidebar() {
  const pathname = usePathname()
  if (pathname.startsWith("/investor") || pathname.startsWith("/seller")) return null

  return (
    <aside className="sticky top-14 z-10 border-b border-border bg-surface md:h-[calc(100vh-3.5rem)] md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <div className="px-5 pt-5 pb-2">
        <p className="text-sm font-semibold tracking-tight">Sandbox</p>
      </div>
      <nav aria-label="Sandbox" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-6">
        {pages.map((page) => {
          const active = pathname === page.href || pathname.startsWith(`${page.href}/`)
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                active ? "bg-background font-medium" : "text-muted hover:text-foreground"
              }`}
            >
              {page.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
