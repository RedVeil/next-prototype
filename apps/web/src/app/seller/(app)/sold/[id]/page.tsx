import { EmptyState } from "@/components/layout/EmptyState"

export default function SoldDetailPage() {
  return (
    <EmptyState
      title="Sold invoice"
      body="This sale is not available. There is no sold invoice to show."
    />
  )
}
