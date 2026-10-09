import { EmptyState } from "@/components/layout/EmptyState"

export default function AdminInvoicesPage() {
  return (
    <EmptyState
      title="Invoices"
      body="No invoices are stored. Scanning, scoring, matching, and NFT sales are not connected, so this list stays empty."
    />
  )
}
