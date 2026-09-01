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

export function formatScoreRange(min: number, max: number): string {
  return `${min}–${max}`
}

export function formatIndustries(industries: string[]): string {
  if (industries.length === 0 || industries.includes("Any")) return "Any"
  return industries.join(", ")
}

export function confidenceFromHistory(
  historicalInvoices: number,
  matchedPayments: number,
): "Low" | "Medium" | "High" {
  if (historicalInvoices === 0) return "Low"
  if (historicalInvoices >= 20 && matchedPayments / historicalInvoices >= 0.9) {
    return "High"
  }
  if (historicalInvoices >= 5) return "Medium"
  return "Low"
}
