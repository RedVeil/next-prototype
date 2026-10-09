import { EmptyState } from "@/components/layout/EmptyState"

export default function InvoiceDetailPage() {
  return (
    <EmptyState
      title="Invoice"
      body="This invoice is not available. Risk scoring and offers are not running, so there is nothing to review."
    />
  )
}
