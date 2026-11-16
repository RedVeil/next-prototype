import Link from "next/link"
import { loadInvestorInvitations } from "@/auction/domain"
import { formatAmount } from "./format"

export async function InvestorInvitations({ organisationId }: { organisationId: string }) {
  const data = await loadInvestorInvitations(organisationId)
  if (data.rows.length === 0 && data.notices.length === 0) return null
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-8">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Invitations</h2>
      <p className="mt-1 text-sm text-neutral-500">One row per bucket. Ignore hides that invoice for this organisation.</p>
      {data.notices.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-neutral-700">
          {data.notices.map((notice) => (
            <li key={notice.id}>{notice.body}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Bucket</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Face</th>
              <th className="px-4 py-3 font-medium">Bid</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{row.bucket}</td>
                <td className="px-4 py-3">{row.documentId}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatAmount(row.face)} {row.currency}
                </td>
                <td className="px-4 py-3 tabular-nums">{row.rlusd === null ? "—" : `${formatAmount(row.rlusd)} RLUSD`}</td>
                <td className="px-4 py-3">
                  <Link href={`/investor/auctions/${row.id}`} className="font-medium text-neutral-900 underline">
                    {row.offerStatus === "signed" ? "Bid" : "Open"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
