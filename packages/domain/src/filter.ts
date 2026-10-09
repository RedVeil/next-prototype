import type { CompanyInvoiceFilter, DomainInvoice } from "./invoice"
import { currentRisk } from "./invoice"
import { isRiskRange, rangeLiesInside, type RiskRange } from "./risk"

export type FilterableInvoice = Pick<
  DomainInvoice,
  "buyerTaxId" | "product" | "riskAssessment"
>

/**
 * A company with no saved filter keeps every invoice ineligible.
 * A blank customer or product list does not restrict that dimension.
 * When the filter risk range is set, the invoice's current range must lie entirely inside it.
 */
export function passesCompanyFilter(
  invoice: FilterableInvoice,
  companyRange: RiskRange,
  filter: CompanyInvoiceFilter | null,
): boolean {
  if (!filter) return false
  if (
    filter.customerTaxIds.length > 0 &&
    !filter.customerTaxIds.includes(invoice.buyerTaxId)
  ) {
    return false
  }
  if (filter.products.length > 0 && !filter.products.includes(invoice.product)) {
    return false
  }
  if (filter.riskLow != null || filter.riskHigh != null) {
    if (filter.riskLow == null || filter.riskHigh == null) return false
    const bounds = { low: filter.riskLow, high: filter.riskHigh }
    if (!isRiskRange(bounds)) return false
    if (!rangeLiesInside(currentRisk(companyRange, invoice.riskAssessment), bounds)) {
      return false
    }
  }
  return true
}

export function withEligibility<T extends FilterableInvoice & { eligibleForMatching: boolean }>(
  invoices: T[],
  companyRange: RiskRange,
  filter: CompanyInvoiceFilter | null,
): T[] {
  return invoices.map((invoice) => ({
    ...invoice,
    eligibleForMatching: passesCompanyFilter(invoice, companyRange, filter),
  }))
}
