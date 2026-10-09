import { EmptyState } from "@/components/layout/EmptyState"

export default function NewInvoicePage() {
  return (
    <EmptyState
      title="New invoice"
      body="Invoices cannot be submitted from this screen. NF-e lookup and pricing are not connected."
    />
  )
}
