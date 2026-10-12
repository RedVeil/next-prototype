export async function frankfurterRate() {
  const response = await fetch("https://api.frankfurter.app/latest?from=BRL&to=USD")
  if (!response.ok) throw new Error("Frankfurter did not return a rate.")
  const body = (await response.json()) as { rates?: { USD?: number } }
  const rate = body.rates?.USD
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Frankfurter did not return a USD rate.")
  }
  return rate
}
