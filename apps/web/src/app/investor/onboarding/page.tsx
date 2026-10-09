"use client"

import { InvestorOnboardingWizard } from "@/components/onboarding/InvestorOnboardingWizard"
import { RequireProfile } from "@/components/layout/RequireProfile"
import { XrplWalletProvider } from "@/components/wallet/XrplWalletProvider"

export default function InvestorOnboardingPage() {
  return (
    <RequireProfile role="investor">
      <XrplWalletProvider>
        <InvestorOnboardingWizard />
      </XrplWalletProvider>
    </RequireProfile>
  )
}
