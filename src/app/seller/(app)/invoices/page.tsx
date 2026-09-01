"use client"

import Link from "next/link"
import { useStore } from "@/lib/store"
import { InvoiceTable } from "@/components/invoices/InvoiceTable"

export default function InvoicesPage() {
  const { activeInvoices } = useStore()

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Invoices</h1>
          <p className="mt-1 text-sm text-neutral-500">
            NF-e, duplicata status, and seller payment history for invoices issued by your CNPJ.
          </p>
        </div>
        <Link
          href="/seller/invoices/new"
          className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Post invoice
        </Link>
      </div>
      <div className="mt-8">
        <InvoiceTable invoices={activeInvoices} />
      </div>
    </div>
  )
}
