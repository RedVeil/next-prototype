import Link from "next/link"
import { CompanyOverview } from "@/components/seller/CompanyOverview"
import { getAdminCompany } from "@/lib/actions"
import { listVisibleInvoices, parseInvoiceListQuery, type InvoiceListSearchParams } from "@/lib/stored-invoices"

export default async function AdminCompanyPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<InvoiceListSearchParams>
}) {
  const { id } = await params
  let company
  try {
    company = await getAdminCompany(id)
  } catch (error) {
    if (error instanceof Error && (error.message === "Not signed in" || error.message === "Not an admin")) return null
    throw error
  }

  const query = parseInvoiceListQuery(await searchParams)
  const invoices =
    company && company.application_status === "accepted" && company.access_status !== "stopped"
      ? await listVisibleInvoices(company.id, query)
      : null

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/companies" className="text-sm text-neutral-500 hover:text-neutral-800">
        Companies
      </Link>
      <div className="mt-6">
        {company ? (
          <CompanyOverview company={company} readOnly invoices={invoices} query={query} invoiceBasePath={`/admin/companies/${id}`} />
        ) : (
          <p className="text-sm text-neutral-600">Company not found.</p>
        )}
      </div>
    </div>
  )
}
