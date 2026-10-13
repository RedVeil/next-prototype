export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export function formatSignedAmount(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const formatted = formatAmount(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function formatWhen(value: string | null): string {
  if (!value) return "—"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export function formatJoined(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date)
}

export function formatDateOnly(value: string | null): string {
  if (!value) return "—"
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return formatJoined(value)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

export function formatChartTime(value: string, compact: boolean): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  if (compact) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
}

export function formatApr(rate: number): string {
  const pct = rate * 100
  const text = Number.isInteger(pct)
    ? String(pct)
    : pct.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return `${text}%`
}
