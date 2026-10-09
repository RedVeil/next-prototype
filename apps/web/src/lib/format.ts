export function formatRLUSD(value: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
  return `${formatted} RLUSD`
}

export function formatSignedRLUSD(value: number): string {
  const formatted = formatRLUSD(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatSignedBRL(value: number): string {
  const formatted = formatBRL(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function formatMillionsBRL(value: number): string {
  const millions = value / 1_000_000
  const text = millions.toFixed(2).replace(/(\.\d)0$/, "$1")
  return `R$ ${text}m`
}

export function formatCompactBRL(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) {
    return `${sign}${formatMillionsBRL(abs)}`
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000
    const text = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1)
    return `${sign}R$ ${text}k`
  }
  return `${sign}${formatBRL(abs)}`
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits).replace(".", ",")}%`
}

export function formatDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`
}

export function formatScore(score: number): string {
  return `${score} / 100`
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function scoreBand(score: number): string {
  if (score >= 90) return "Very strong"
  if (score >= 80) return "Strong"
  if (score >= 70) return "Moderate"
  if (score >= 60) return "Elevated"
  return "High risk"
}

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
