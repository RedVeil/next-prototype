import { CompanyOverview } from "@/components/seller/CompanyOverview"
import { getSession } from "@/lib/actions"
import { listVisibleInvoices, parseInvoiceListQuery, type InvoiceListSearchParams } from "@/lib/stored-invoices"

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceListSearchParams>
}) {
  const session = await getSession()
  const company = session.company
  const query = parseInvoiceListQuery(await searchParams)
  const invoices =
    company && company.application_status === "accepted" && company.access_status !== "stopped"
      ? await listVisibleInvoices(company.id, query)
      : null

  return <CompanyOverview company={company} invoices={invoices} query={query} invoiceBasePath="/seller/dashboard" />
}
