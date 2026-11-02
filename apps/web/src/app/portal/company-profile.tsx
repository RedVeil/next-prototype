import Link from "next/link"
import type { CompanyProfile, CompanyRole } from "./market-data"
import { InvoiceStatsGrid, InvoiceTable, joinList, ProductTable } from "./market-present"

function RoleBlock({
  title,
  detail,
  role,
  rate,
}: {
  title: string
  detail: string
  role: CompanyRole
  rate: number | null
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{detail}</p>
      <InvoiceStatsGrid stats={role.stats} />
      <h3 className="mt-6 text-sm font-semibold tracking-tight text-neutral-900">Invoices</h3>
      <InvoiceTable invoices={role.invoices} rate={rate} />
      <h3 className="mt-6 text-sm font-semibold tracking-tight text-neutral-900">Products</h3>
      <ProductTable products={role.products} />
    </section>
  )
}

export function CompanyProfileView({ profile }: { profile: CompanyProfile }) {
  const org = profile.organisation
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
      <Link href="/investor/market" className="text-sm font-medium text-neutral-900 underline">
        Market
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">{org.legalName}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
        {org.description.trim() || "No description."}
      </p>
      <dl className="mt-6 grid gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Company id</dt>
          <dd className="mt-1 text-sm">{org.companyId}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Region</dt>
          <dd className="mt-1 text-sm">{org.country}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Risk score</dt>
          <dd className="mt-1 text-sm tabular-nums">{org.riskScore}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Industries</dt>
          <dd className="mt-1 text-sm">{joinList(org.industries)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Invoice currencies</dt>
          <dd className="mt-1 text-sm">{joinList(org.invoiceCurrencies)}</dd>
        </div>
      </dl>

      <RoleBlock
        title="As seller"
        detail="Invoices this organisation sold, with tenor measured from origination to due date."
        role={profile.seller}
        rate={profile.usdRate}
      />
      <RoleBlock
        title="As obligor"
        detail="Invoices this organisation owes, with the same size, tenor, and risk figures."
        role={profile.obligor}
        rate={profile.usdRate}
      />
    </main>
  )
}
