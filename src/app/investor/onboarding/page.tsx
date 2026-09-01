"use client"

import { InvestorOnboardingWizard } from "@/components/onboarding/InvestorOnboardingWizard"
import { RequireProfile } from "@/components/layout/RequireProfile"

export default function InvestorOnboardingPage() {
  return (
    <RequireProfile role="investor">
      <InvestorOnboardingWizard />
    </RequireProfile>
  )
}
