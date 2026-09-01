"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import type { SessionRole } from "@/lib/types"

export function RequireProfile({
  children,
  role = "seller",
}: {
  children: React.ReactNode
  role?: SessionRole
}) {
  const { role: currentRole } = useStore()
  const router = useRouter()

  useEffect(() => {
    if (currentRole !== role) {
      router.replace("/")
    }
  }, [currentRole, role, router])

  if (currentRole !== role) return null
  return children
}
