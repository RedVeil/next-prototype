import { railForCountry, type RailMethod } from "@antecipa/rails"

export const PAYOUTS_SERVICE = "payouts" as const

export type PayoutDirection = "disbursement" | "repayment"

export type PayoutStatus = "queued" | "stubbed"

export type PayoutPlan = {
  direction: PayoutDirection
  originCountry: string
  method: RailMethod
  status: PayoutStatus
}

/**
 * Disbursement and repayment go through the invoice origin country's rail.
 * PIX is not hardcoded here. This slice does not send funds.
 */
export function planPayout(direction: PayoutDirection, originCountry: string): PayoutPlan {
  const rail = railForCountry(originCountry)
  const method =
    direction === "disbursement"
      ? rail.disburse({ invoiceId: "", originCountry, amount: 0, currency: rail.assignCurrency() }).method
      : rail.collectRepayment({
          invoiceId: "",
          originCountry,
          amount: 0,
          currency: rail.assignCurrency(),
        }).method
  return {
    direction,
    originCountry,
    method,
    status: "stubbed",
  }
}
