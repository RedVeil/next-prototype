"use client"

import { useEffect, useRef, useState } from "react"
import { formatCountdown } from "@/lib/format"

export function OfferTimer({
  validUntil,
  onExpire,
}: {
  validUntil: number
  onExpire?: () => void
}) {
  const [now, setNow] = useState<number | null>(null)
  const expiredRef = useRef(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(id)
    }
  }, [])

  const remaining = now == null ? null : Math.max(0, validUntil - now)

  useEffect(() => {
    if (remaining !== 0 || expiredRef.current) return
    expiredRef.current = true
    onExpire?.()
  }, [remaining, onExpire])

  if (remaining == null) {
    return <span className="tabular-nums text-neutral-500">15:00</span>
  }

  const expired = remaining === 0

  return (
    <span className={`tabular-nums ${expired ? "text-red-700" : "text-neutral-900"}`}>
      {expired ? "Expired" : formatCountdown(remaining)}
    </span>
  )
}
