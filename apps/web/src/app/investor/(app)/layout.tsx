import { InvestorAppShell } from "@/components/layout/AppShell"

export default function InvestorAppLayout({ children }: { children: React.ReactNode }) {
  return <InvestorAppShell>{children}</InvestorAppShell>
}
