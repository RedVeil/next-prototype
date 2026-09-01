"use client"

import { RoleAuthCard } from "./RoleAuthCard"
import { useStore } from "@/lib/store"

export function SellerAuthCard() {
  const { selectProfile } = useStore()

  return (
    <RoleAuthCard
      title="Seller of invoices"
      description="Present invoices you have issued as sacador and receive financing offers."
      loginHref="/seller/dashboard"
      signupHref="/seller/onboarding"
      onLogin={() => selectProfile("existing")}
      onSignup={() => selectProfile("fresh")}
    />
  )
}
