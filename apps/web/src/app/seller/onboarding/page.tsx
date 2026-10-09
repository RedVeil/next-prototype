"use client"

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"
import { RequireProfile } from "@/components/layout/RequireProfile"

export default function OnboardingPage() {
  return (
    <RequireProfile role="company">
      <OnboardingWizard />
    </RequireProfile>
  )
}
