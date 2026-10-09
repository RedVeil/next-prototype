import Link from "next/link"
import { PLATFORM_NAME } from "@/lib/brand"
import { InvestorAuthCard } from "@/components/landing/InvestorAuthCard"
import { SellerAuthCard } from "@/components/landing/SellerAuthCard"

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>
}) {
  const { auth } = await searchParams
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background lg:h-dvh">
      <header className="flex h-16 shrink-0 items-center justify-center border-b border-border bg-white px-4">
        <p className="text-[15px] font-semibold tracking-tight text-neutral-900">{PLATFORM_NAME}</p>
      </header>
      {auth === "failed" && (
        <p className="border-b border-border bg-white px-4 py-3 text-center text-sm text-red-700">
          The confirmation link could not be completed. Log in with your email and password.
        </p>
      )}

      <div className="grid flex-1 lg:grid-cols-2">
        <section className="flex items-center border-b border-border bg-white px-6 py-16 sm:px-10 lg:border-r lg:border-b-0">
          <InvestorAuthCard />
        </section>
        <section className="flex items-center bg-background px-6 py-16 sm:px-10">
          <SellerAuthCard />
        </section>
      </div>
      <p className="border-t border-border bg-white px-4 py-3 text-center text-xs text-neutral-400">
        <Link href="/admin/login" className="hover:text-neutral-700">
          Admin
        </Link>
      </p>
    </div>
  )
}
