export const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"
export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000"

export function isRlusdCurrency(currency: string) {
  const code = currency.toUpperCase()
  return code === "RLUSD" || code === RLUSD_CURRENCY
}

export function rlusdValue(amount: number) {
  const cents = Math.round(amount * 100)
  const whole = Math.trunc(cents / 100)
  const fraction = Math.abs(cents % 100)
  if (fraction === 0) return String(whole)
  if (fraction % 10 === 0) return `${whole}.${fraction / 10}`
  return `${whole}.${String(fraction).padStart(2, "0")}`
}
