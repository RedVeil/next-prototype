"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { loginAs } from "./portal/actions"
import type { NavProfile } from "./portal/nav-profile"
import type { PortalRole, PortalUser } from "./portal/users"

const links = [
  {
    href: "/sandbox",
    label: "Admin",
    active: (pathname: string) =>
      pathname === "/" || pathname.startsWith("/sandbox") || pathname.startsWith("/match"),
  },
  {
    href: "/investor",
    label: "Investor",
    active: (pathname: string) => pathname.startsWith("/investor"),
  },
  {
    href: "/seller",
    label: "Seller",
    active: (pathname: string) => pathname.startsWith("/seller"),
  },
]

function userLabel(user: PortalUser) {
  return user.organisation ? `${user.username} · ${user.organisation}` : user.username
}

function ProfileSwitch({
  role,
  current,
  users,
}: {
  role: PortalRole
  current: PortalUser | null
  users: PortalUser[]
}) {
  const title = role === "investor" ? "Investor" : "Seller"
  if (users.length === 0) {
    return <p className="px-3 text-sm text-muted">{title}</p>
  }
  if (users.length === 1) {
    const only = users[0]
    const signedIn = current?.id === only.id
    return <p className="px-3 text-sm">{signedIn ? userLabel(only) : title}</p>
  }

  return (
    <form action={loginAs}>
      <input type="hidden" name="role" value={role} />
      <label className="sr-only" htmlFor={`${role}-profile`}>
        {title} profile
      </label>
      <select
        id={`${role}-profile`}
        name="identity_id"
        defaultValue={current?.id ?? ""}
        aria-label={`${title} profile`}
        onChange={(event) => {
          if (event.currentTarget.value) event.currentTarget.form?.requestSubmit()
        }}
        className="max-w-64 rounded-lg border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-foreground"
      >
        {current ? null : <option value="">Choose {title.toLowerCase()}</option>}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {userLabel(user)}
          </option>
        ))}
      </select>
    </form>
  )
}

export function TopNav({ profile }: { profile: NavProfile }) {
  const pathname = usePathname()
  const investor = pathname.startsWith("/investor")
  const seller = pathname.startsWith("/seller")

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex h-14 items-center gap-1 px-3">
        <nav aria-label="Portals" className="flex items-center gap-1">
          {links.map((link) => {
            const active = link.active(pathname)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-background font-medium" : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto">
          {investor ? (
            <ProfileSwitch role="investor" current={profile.investor} users={profile.investors} />
          ) : seller ? (
            <ProfileSwitch role="seller" current={profile.seller} users={profile.sellers} />
          ) : (
            <p className="px-3 text-sm">Admin</p>
          )}
        </div>
      </div>
    </header>
  )
}
