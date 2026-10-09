import { EmptyState } from "@/components/layout/EmptyState"

export default function ConnectionsPage() {
  return (
    <EmptyState
      title="Connections"
      body="NF-e and Open Finance are not connected. There is no sync and no detected invoices."
    />
  )
}
