import { PLATFORM_NAME } from "@/lib/mock-data"
import { InvestorAuthCard } from "@/components/landing/InvestorAuthCard"
import { SellerAuthCard } from "@/components/landing/SellerAuthCard"

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background lg:h-dvh">
      <header className="flex h-16 shrink-0 items-center justify-center border-b border-border bg-white px-4">
        <p className="text-[15px] font-semibold tracking-tight text-neutral-900">{PLATFORM_NAME}</p>
      </header>

      <div className="grid flex-1 lg:grid-cols-2">
        <section className="flex items-center border-b border-border bg-white px-6 py-16 sm:px-10 lg:border-r lg:border-b-0">
          <InvestorAuthCard />
        </section>
        <section className="flex items-center bg-background px-6 py-16 sm:px-10">
          <SellerAuthCard />
        </section>
      </div>
    </div>
  )
}
