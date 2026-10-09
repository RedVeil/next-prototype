export const RAIL_SERVICE = "rail" as const

export type RailSaleStatus = "unsold" | "sold"

export type RailInvoice = {
  id: string
  originCountry: string
  currency: string
  saleStatus: RailSaleStatus
  soldAt: string | null
}

export type RailMethod = "ripple_payments_pix" | "ripple_payments"

export type DisburseInput = {
  invoiceId: string
  originCountry: string
  amount: number
  currency: string
}

export type CollectRepaymentInput = {
  invoiceId: string
  originCountry: string
  amount: number
  currency: string
}

export type RailStepResult = {
  status: "stubbed"
  method: RailMethod
  originCountry: string
}

export interface CountryRail {
  country: string
  assignCurrency: () => string
  perfectSale: (invoice: RailInvoice, soldAt?: string) => RailInvoice
  disburse: (input: DisburseInput) => RailStepResult
  collectRepayment: (input: CollectRepaymentInput) => RailStepResult
}

/**
 * Brazil assigns BRL. perfectSale only marks the invoice sold.
 * It does not call a registry, PIX, or Ripple Payments.
 */
export const brazilRail: CountryRail = {
  country: "BR",
  assignCurrency() {
    return "BRL"
  },
  perfectSale(invoice, soldAt = new Date().toISOString()) {
    return {
      ...invoice,
      currency: invoice.currency || "BRL",
      saleStatus: "sold",
      soldAt,
    }
  },
  disburse(input) {
    return { status: "stubbed", method: "ripple_payments_pix", originCountry: input.originCountry }
  },
  collectRepayment(input) {
    return { status: "stubbed", method: "ripple_payments", originCountry: input.originCountry }
  },
}

const rails: Record<string, CountryRail> = {
  BR: brazilRail,
}

export function railForCountry(country: string): CountryRail {
  const rail = rails[country]
  if (!rail) {
    throw new Error(`No country rail is registered for ${country}`)
  }
  return rail
}

export function assignInvoiceCurrency(originCountry: string): string {
  return railForCountry(originCountry).assignCurrency()
}
