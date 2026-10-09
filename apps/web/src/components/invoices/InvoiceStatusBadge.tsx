import type { InvoiceStatus } from "@/lib/types"
import { StatusBadge } from "@/components/ui/StatusBadge"

const config: Record<
  InvoiceStatus,
  { label: string; tone: "neutral" | "positive" | "warning" | "danger" }
> = {
  eligible: { label: "Eligible", tone: "positive" },
  waiting_acceptance: { label: "Waiting for buyer acceptance", tone: "warning" },
  offer_available: { label: "Offer available", tone: "positive" },
  sold: { label: "Funded", tone: "positive" },
  repaid: { label: "Repaid", tone: "positive" },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, tone } = config[status]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}
