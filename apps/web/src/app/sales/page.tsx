import { formatAmount, formatDateOnly, formatWhen } from "@/app/portal/format"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

type SaleRow = {
  id: string
  createdAt: string
  invoice: string
  seller: string
  buyer: string
  bucket: string
  status: string
  currency: string
  soldPrice: number
  offerRlusd: number
  soldDate: string
  detail: string
}

const columns = [
  "Created",
  "Invoice",
  "Seller",
  "Buyer",
  "Bucket",
  "Status",
  "Sold price",
  "Offer",
  "Sold date",
  "Detail",
]

function asNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function statusLabel(status: string) {
  if (status === "queued") return "Queued"
  if (status === "preparing") return "Preparing"
  if (status === "submitted") return "Submitted"
  if (status === "succeeded") return "Succeeded"
  if (status === "failed") return "Failed"
  if (status === "expired") return "Expired"
  return status
}

function statusClass(status: string) {
  if (status === "succeeded") return "text-emerald-800"
  if (status === "failed" || status === "expired") return "text-red-700"
  return ""
}

async function loadSales(): Promise<SaleRow[]> {
  const supabase = createServiceClient()
  const [orders, organisations, invoices, buckets] = await Promise.all([
    supabase
      .from("sale_orders")
      .select(
        "id, invoice_id, seller_organisation_id, buyer_organisation_id, buyer_bucket_id, offer_rlusd, sold_price, sold_date, status, failure_reason, expires_at, tx_hash, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("organisations").select("id, legal_name"),
    supabase.from("organisation_invoices").select("id, document_id, currency"),
    supabase.from("organisation_buckets").select("id, name"),
  ])

  const failed = [orders, organisations, invoices, buckets].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const organisationName = new Map(
    (organisations.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )
  const invoiceById = new Map(
    (invoices.data ?? []).map((row) => [
      row.id as string,
      { documentId: row.document_id as string, currency: row.currency as string },
    ]),
  )
  const bucketName = new Map((buckets.data ?? []).map((row) => [row.id as string, row.name as string]))

  return (orders.data ?? []).map((row) => {
    const invoice = invoiceById.get(row.invoice_id as string)
    const status = row.status as string
    const reason = typeof row.failure_reason === "string" ? row.failure_reason.trim() : ""
    const hash = typeof row.tx_hash === "string" ? row.tx_hash.trim() : ""
    const detail = reason
      ? reason
      : hash
        ? hash
        : status === "queued" || status === "preparing" || status === "submitted"
          ? `Expires ${formatWhen(row.expires_at as string)}`
          : "—"
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      invoice: invoice?.documentId || "Invoice",
      seller: organisationName.get(row.seller_organisation_id as string) ?? "Seller",
      buyer: organisationName.get(row.buyer_organisation_id as string) ?? "Buyer",
      bucket: bucketName.get(row.buyer_bucket_id as string) ?? "Bucket",
      status,
      currency: invoice?.currency ?? "",
      soldPrice: asNumber(row.sold_price),
      offerRlusd: asNumber(row.offer_rlusd),
      soldDate: row.sold_date as string,
      detail,
    }
  })
}

export default async function SalesPage() {
  let sales: SaleRow[] | null = null
  let detail = ""
  try {
    sales = await loadSales()
  } catch (error) {
    detail = error instanceof Error ? error.message : "The sale orders did not respond."
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every sale order stored in the database, newest first.
        </p>
      </div>
      {detail ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-red-700">{detail}</p>
      ) : sales ? (
        <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-medium whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="border-t border-border px-3 py-6 text-muted">
                    None yet.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWhen(sale.createdAt)}</td>
                    <td className="px-3 py-2 font-medium">{sale.invoice}</td>
                    <td className="px-3 py-2">{sale.seller}</td>
                    <td className="px-3 py-2">{sale.buyer}</td>
                    <td className="px-3 py-2">{sale.bucket}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${statusClass(sale.status)}`}>
                      {statusLabel(sale.status)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {formatAmount(sale.soldPrice)}
                      {sale.currency ? ` ${sale.currency}` : ""}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatAmount(sale.offerRlusd)} RLUSD</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateOnly(sale.soldDate)}</td>
                    <td className="px-3 py-2 text-muted">
                      <div className="max-w-xs break-all">{sale.detail}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  )
}
