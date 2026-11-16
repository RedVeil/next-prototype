import Link from "next/link"
import { notFound } from "next/navigation"
import { loadSellerAuction } from "@/auction/domain"
import { formatAmount, formatDateOnly } from "@/app/portal/format"
import { AcceptSigner, AuctionCountdown, SetupSigner } from "@/app/portal/auction-sign"
import { portalSession } from "@/app/portal/session"

export const dynamic = "force-dynamic"

export default async function SellerAuctionPage({ params }: PageProps<"/seller/invoices/[id]">) {
  const session = await portalSession("seller")
  if (!session?.organisationId) notFound()
  const { id } = await params
  const auction = await loadSellerAuction(session.organisationId, id)
  if (!auction) notFound()
  const { invoice, round } = auction
  const open = round?.status === "open"
  const settingUp = round?.status === "setup_pending"

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <Link href="/seller" className="text-sm font-medium text-neutral-900 underline">
        Invoices
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">{invoice.documentId}</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Face {formatAmount(invoice.face)} {invoice.currency}. Due {formatDateOnly(invoice.due)}. The invoice stays unsold until both payments validate.
      </p>
      {invoice.sold ? (
        <p className="mt-6 text-sm font-medium text-emerald-800">
          Sold for {formatAmount(invoice.soldPrice)} {invoice.currency}.
        </p>
      ) : (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Time left</p>
              {round?.deadline && open ? <AuctionCountdown deadline={round.deadline} /> : <p className="mt-2 text-3xl font-semibold">—</p>}
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Eligible</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{auction.eligibleCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Responses</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{auction.responseCount}</p>
            </div>
          </section>
          <section className="mt-4 rounded-lg border border-border bg-white p-4">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Best RLUSD bid</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {auction.best ? `${formatAmount(auction.best.rlusd)} RLUSD` : "—"}
            </p>
            {auction.best ? (
              <p className="mt-1 text-sm text-neutral-500">
                Proceeds {formatAmount(auction.best.proceeds)} {auction.best.currency} are display only.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-neutral-500">Auction length {auction.duration} hours. Status {round?.status ?? "not started"}.</p>
            {round?.failure ? <p className="mt-2 text-sm text-red-700">{round.failure}</p> : null}
            {!round || round.status === "expired" || round.status === "failed" ? (
              <SetupSigner invoiceId={invoice.id} roundId={null} pendingLedger={false} />
            ) : null}
            {settingUp && round ? (
              <SetupSigner invoiceId={invoice.id} roundId={round.id} pendingLedger={!round.needsSignature} />
            ) : null}
            {open && round && auction.best ? <AcceptSigner roundId={round.id} /> : null}
            {round?.status === "accepting" || round?.status === "submitted" ? (
              <p className="mt-4 text-sm text-neutral-600">The signed batch is submitted. This invoice is not sold yet.</p>
            ) : null}
          </section>
        </>
      )}
    </main>
  )
}
