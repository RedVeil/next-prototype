export const RISK_MIN = 0
export const RISK_MAX = 10000

export type RiskRange = {
  low: number
  high: number
}

export function isRiskBound(value: number): boolean {
  return Number.isInteger(value) && value >= RISK_MIN && value <= RISK_MAX
}

export function isRiskRange(range: RiskRange): boolean {
  return isRiskBound(range.low) && isRiskBound(range.high) && range.low <= range.high
}

/** The inner range lies entirely inside the outer range. */
export function rangeLiesInside(inner: RiskRange, outer: RiskRange): boolean {
  return inner.low >= outer.low && inner.high <= outer.high
}

/**
 * Widen a 0–100 point heuristic into a 0–10000 range.
 * The stored score is the range. A component breakdown is not part of it.
 */
export function widenPointScore(point: number, pad = 1500): RiskRange {
  const center = Math.round(Math.min(100, Math.max(0, point)) * 100)
  return {
    low: Math.max(RISK_MIN, center - pad),
    high: Math.min(RISK_MAX, center + pad),
  }
}
