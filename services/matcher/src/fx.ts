const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=BRL&to=USD"

/** USD received for one BRL. Queried at match time and not stored. */
export async function fetchBrlUsdRate(): Promise<number> {
  const response = await fetch(FRANKFURTER_URL)
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!response.ok) throw new Error(`Frankfurter returned HTTP ${response.status}.`)
  if (!isRecord(body) || !isRecord(body.rates)) throw new Error("Frankfurter did not return a USD rate.")
  const rate = body.rates.USD
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Frankfurter did not return a USD rate.")
  }
  return rate
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
