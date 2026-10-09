import { widenPointScore, type RiskRange } from "@antecipa/domain"

export const RISK_SERVICE = "risk" as const

export type RiskJobStatus = "queued" | "stubbed"

export type ScoreInput = {
  invoiceId: string
  companyRisk: RiskRange
  /** Today's 0–100 point heuristic, when one exists. */
  pointScore?: number
}

export type ScoreResult = {
  invoiceId: string
  low: number
  high: number
  status: RiskJobStatus
}

/**
 * Scoring entry point. It does not call NF-e, Open Finance, or a bureau.
 * Until an invoice has its own assessment, callers keep using the company range.
 * A point score becomes a wide range; the component breakdown is not stored.
 */
export function scoreInvoice(input: ScoreInput): ScoreResult {
  const range = input.pointScore == null ? input.companyRisk : widenPointScore(input.pointScore)
  return {
    invoiceId: input.invoiceId,
    low: range.low,
    high: range.high,
    status: "stubbed",
  }
}
