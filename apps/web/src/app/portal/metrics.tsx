export function money(value: number, currency: string) {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
  return `${formatted} ${currency}`
}

export function moneyByCurrency(rows: { amount: number; currency: string }[]) {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount)
  }
  if (totals.size === 0) return "0"
  return [...totals.entries()].map(([currency, amount]) => money(amount, currency)).join(" · ")
}

export function percent(rate: number) {
  return `${(rate * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </section>
  )
}
