import { roundMoney, toRlusd } from "@/app/sandbox/settle"
import { formatAmount, formatSignedAmount } from "./format"

export type MoneyRow = {
  amount: number
  currency: string
}

function codeOf(currency: string) {
  const code = currency.trim().toUpperCase()
  return code || currency
}

function usdOf(amount: number, currency: string, rate: number | null) {
  const code = codeOf(currency)
  if (rate === null) return code === "USD" || code === "RLUSD" ? roundMoney(amount) : null
  return toRlusd(amount, code, rate)
}

export function MoneyGroup({
  rows,
  rate,
  signed = false,
  compact = false,
}: {
  rows: MoneyRow[]
  rate: number | null
  signed?: boolean
  compact?: boolean
}) {
  if (rows.length === 0) return <span>—</span>
  const parts = rows.map((row) => ({
    code: codeOf(row.currency),
    amount: row.amount,
    usd: usdOf(row.amount, row.currency, rate),
  }))
  const usd = parts.every((part) => part.usd !== null)
    ? roundMoney(parts.reduce((sum, part) => sum + (part.usd ?? 0), 0))
    : null
  const format = signed ? formatSignedAmount : formatAmount
  const originals = parts.some((part) => part.code !== "USD")
    ? parts.map((part) => `${format(part.amount)} ${part.code}`).join(" · ")
    : ""
  return (
    <span className="block">
      <span className="block">{usd === null ? "—" : `${format(usd)} USD`}</span>
      {originals ? (
        <span
          className={`block font-normal tracking-normal text-neutral-500 ${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}
        >
          {originals}
        </span>
      ) : null}
    </span>
  )
}
