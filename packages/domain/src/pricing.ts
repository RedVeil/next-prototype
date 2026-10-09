const DAY_MS = 86_400_000

/** Whole days from the offer instant to the due date. Negative when the due date has passed. */
export function daysUntilDue(offerIso: string, dueIso: string): number | null {
  const offer = Date.parse(offerIso)
  const due = Date.parse(dueIso)
  if (Number.isNaN(offer) || Number.isNaN(due)) return null
  return Math.round((due - offer) / DAY_MS)
}

/**
 * Financing price charged to the company: amount * APR * days / 365.
 * APR is a percent, so 11 becomes 0.11 inside the formula.
 * A lower APR is a lower price and a higher amount paid to the company.
 */
export function financingPrice(amount: number, aprPercent: number, days: number): number {
  return amount * (aprPercent / 100) * (days / 365)
}

export function amountPaidToCompany(amount: number, aprPercent: number, days: number): number {
  return amount - financingPrice(amount, aprPercent, days)
}

export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100
}

/** Calendar date in YYYY-MM-DD for the zone where these invoices are due. */
export function calendarDate(now = new Date(), timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}
