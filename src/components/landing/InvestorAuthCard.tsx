"use client"

import { RoleAuthCard } from "./RoleAuthCard"
import { useStore } from "@/lib/store"

export function InvestorAuthCard() {
  const { selectInvestorProfile } = useStore()

  return (
    <RoleAuthCard
      title="Investor"
      description="Commit capital once, then define standing investment buckets that draw from the same pool."
      loginHref="/investor/dashboard"
      signupHref="/investor/onboarding"
      onLogin={() => selectInvestorProfile("existing")}
      onSignup={() => selectInvestorProfile("fresh")}
    />
  )
}
