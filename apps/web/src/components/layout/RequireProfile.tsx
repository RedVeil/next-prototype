"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@/lib/session"

export function RequireProfile({
  children,
  role,
}: {
  children: React.ReactNode
  role: "company" | "investor"
}) {
  const { session, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (session.role !== role) router.replace("/")
  }, [loading, role, router, session.role])

  if (loading || session.role !== role) return null
  return children
}
