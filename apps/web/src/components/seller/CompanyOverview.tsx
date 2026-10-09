import Link from "next/link"
import { AddInvoiceButton } from "@/components/invoices/AddInvoiceButton"
import { StoredInvoiceList } from "@/components/invoices/StoredInvoiceList"
import { PartyLock } from "@/components/layout/PartyLock"
import { invoiceQueryHasFilters, parseInvoiceListQuery, type InvoiceListQuery, type ListedInvoice } from "@/lib/stored-invoices"
import type { CompanyRow } from "@/lib/records"

export function CompanyOverview({
  company,
  readOnly = false,
  invoices = null,
  query = parseInvoiceListQuery({}),
  invoiceBasePath = "/seller/dashboard",
}: {
  company: CompanyRow | null
  readOnly?: boolean
  invoices?: { rows: ListedInvoice[]; total: number; unfilteredTotal: number } | null
  query?: InvoiceListQuery
  invoiceBasePath?: string
}) {
  if (!company) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Finish company setup</h1>
        <p className="mt-3 text-sm text-neutral-600">Submit the company application before this dashboard has an organization to show.</p>
        {!readOnly && (
          <Link href="/seller/onboarding" className="mt-4 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
            Continue setup
          </Link>
        )}
      </div>
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

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{company.legal_name}</h1>
          <p className="mt-2 text-sm text-neutral-500">Tax id {company.tax_id}. Country {company.country}.</p>
        </div>
        {!readOnly && <AddInvoiceButton />}
      </div>
      {invoices && (invoices.total > 0 || (invoiceQueryHasFilters(query) && invoices.unfilteredTotal > 0)) ? (
        <div className="mt-8">
          <StoredInvoiceList
            invoices={invoices.rows}
            page={query.page}
            total={invoices.total}
            query={query}
            basePath={invoiceBasePath}
            embedded
            canAccept={!readOnly}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm leading-relaxed text-neutral-600">
          The company is accepted. Invoices appear after the scanner stores ones that pass the company filter.
        </p>
      )}
    </div>
  )
}
