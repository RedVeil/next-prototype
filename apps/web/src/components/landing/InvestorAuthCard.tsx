"use client"

import { RoleAuthCard } from "./RoleAuthCard"

export function InvestorAuthCard() {
  return (
    <RoleAuthCard
      role="investor"
      title="Investor"
      description="Commit capital once, then define standing investment buckets that draw from the same pool."
    />
  )
}
