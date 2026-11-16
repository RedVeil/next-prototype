import Link from "next/link"
import { notFound } from "next/navigation"
import { loadInvestorBid } from "@/auction/domain"
import { formatAmount } from "@/app/portal/format"
import { BidSigner } from "@/app/portal/auction-sign"
import { portalSession } from "@/app/portal/session"

export const dynamic = "force-dynamic"

export default async function InvestorBidPage({ params }: PageProps<"/investor/auctions/[id]">) {
  const session = await portalSession("investor")
  if (!session?.organisationId) notFound()
  const { id } = await params
  const bid = await loadInvestorBid(session.organisationId, id)
  if (!bid) notFound()
  const { row, quote } = bid
  const apr = `${(row.apr * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`
  const canSign = row.roundStatus === "open" && row.state === "invited" && row.offerStatus !== "signed" && quote !== null
  const canCancel = row.offerStatus === "signed" && row.roundStatus === "open" && row.offerId !== null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <Link href="/investor/market" className="text-sm font-medium text-neutral-900 underline">
        Market
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">{row.bucket}</h1>
      <p className="mt-2 text-sm text-neutral-600">
        {row.documentId}. APR starts at {apr}.
      </p>
      <dl className="mt-6 grid gap-3 rounded-lg border border-border bg-white p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Face</dt>
          <dd className="tabular-nums">{formatAmount(row.face)} {row.currency}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Discount</dt>
          <dd className="tabular-nums">{quote ? `${formatAmount(quote.discount)} ${row.currency}` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Proceeds</dt>
          <dd className="tabular-nums">{quote ? `${formatAmount(quote.proceeds)} ${row.currency}` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">RLUSD</dt>
          <dd className="font-medium tabular-nums">{quote ? quote.rlusdText : row.rlusd === null ? "—" : formatAmount(row.rlusd)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-neutral-500">BRL figures are display only. The bid locks RLUSD when you sign.</p>
      {row.offerStatus ? <p className="mt-3 text-sm text-neutral-700">Bid status {row.offerStatus}.</p> : null}
      <BidSigner invitationId={row.id} canSign={canSign} offerId={canCancel ? row.offerId : null} />
    </main>
  )
}
