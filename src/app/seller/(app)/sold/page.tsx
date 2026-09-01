"use client"

import Link from "next/link"
import { useStore } from "@/lib/store"
import { formatBRL, formatDays, formatPercent } from "@/lib/format"
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge"

export default function SoldInvoicesPage() {
  const { soldInvoices, getOffer, getSettlement } = useStore()

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Sold invoices
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Receivables you have assigned. Buyer repayment is collected according to registered
          payment instructions.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-white">
        {soldInvoices.length === 0 ? (
          <p className="px-5 py-10 text-sm text-neutral-500">
            No sold invoices yet. Eligible invoices can be financed from{" "}
            <Link href="/seller/invoices" className="font-medium text-neutral-900 underline">
              Invoices
            </Link>
            .
          </p>
        ) : (
          <table className="min-w-[800px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Face value</th>
                <th className="px-4 py-3">Seller received</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Buyer payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {soldInvoices.map((invoice) => {
                const offer = getOffer(invoice.id)
                const settlement = getSettlement(invoice.id)
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/seller/sold/${invoice.id}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {invoice.buyerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatBRL(invoice.faceValue)}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatBRL(settlement?.sellerReceived ?? offer?.finalPrice ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {offer ? formatPercent(offer.discountPercentage) : "—"}
                    </td>
                    <td className="px-4 py-3">{formatDays(invoice.daysToMaturity)}</td>
                    <td className="px-4 py-3">
                      {settlement?.buyerPayment === "received" ? (
                        <span className="text-emerald-800">Received</span>
                      ) : (
                        <span className="text-amber-800">Awaiting buyer payment</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {invoice.status === "repaid" ? (
                        <InvoiceStatusBadge status="repaid" />
                      ) : settlement?.buyerPayment === "received" ? (
                        <span className="text-sm text-neutral-700">Settling</span>
                      ) : (
                        <span className="text-amber-800">Awaiting buyer payment</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
