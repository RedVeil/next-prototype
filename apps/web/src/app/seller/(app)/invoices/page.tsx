import { StoredInvoiceList } from "@/components/invoices/StoredInvoiceList"
import { EmptyState } from "@/components/layout/EmptyState"
import { PartyLock } from "@/components/layout/PartyLock"
import { getSession } from "@/lib/actions"
import { invoiceQueryHasFilters, listVisibleInvoices, parseInvoiceListQuery, type InvoiceListSearchParams } from "@/lib/stored-invoices"

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceListSearchParams>
}) {
  const session = await getSession()
  const company = session.company

  if (!company) {
    return (
      <EmptyState
        title="Invoices"
        body="No invoices are listed. Scanning stores an invoice after the company is accepted and the invoice passes the company filter."
      />
    )
  }

  if (company.application_status !== "accepted") {
    return (
      <PartyLock
        title="Still in onboarding"
        body="This company is pending. Invoice scanning stays unavailable until an admin accepts the application."
      />
    )
  }

  if (company.access_status === "stopped") {
    return (
      <PartyLock
        title="Company stopped"
        body="An admin stopped this company. Existing records stay, and new invoice work is not available."
      />
    )
  }

  const query = parseInvoiceListQuery(await searchParams)
  const list = await listVisibleInvoices(company.id, query)

  if (list.total === 0 && !(invoiceQueryHasFilters(query) && list.unfilteredTotal > 0)) {
    return (
      <EmptyState
        title="Invoices"
        body="No invoices are listed. Scanning stores an invoice after the company is accepted and the invoice passes the company filter."
      />
    )
  }

  return <StoredInvoiceList invoices={list.rows} page={query.page} total={list.total} query={query} />
}
