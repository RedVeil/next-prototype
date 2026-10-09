"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminFrame } from "@/components/admin/AdminFrame"
import { useSession } from "@/lib/session"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, loading } = useSession()
  const login = pathname === "/admin/login"

  useEffect(() => {
    if (loading || login) return
    if (session.role !== "admin") router.replace("/admin/login")
  }, [loading, login, router, session.role])

  if (login) return children
  if (loading || session.role !== "admin") return null
  return <AdminFrame>{children}</AdminFrame>
}
