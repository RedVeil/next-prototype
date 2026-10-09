export const INVOICE_LIFECYCLE = [
  "submitted",
  "nfe_checked",
  "scored",
  "listed",
  "offered",
  "accepted",
  "reserved",
  "nft_issued",
  "paying_out",
  "paid_to_company",
  "awaiting_repayment",
  "repaid",
  "settled",
  "declined",
  "expired",
  "failed",
] as const

export type InvoiceLifecycleStatus = (typeof INVOICE_LIFECYCLE)[number]

export type SaleStatus = "unsold" | "sold"

export type ApplicationStatus = "pending" | "accepted"

export type AccessStatus = "allowed" | "stopped"

export type RecordSource = "application" | "admin"

/** Reserved means RLUSD moved from investor multisig 1 to investor multisig 2. */
export const RESERVED_STATUS = "reserved" satisfies InvoiceLifecycleStatus

/** Settled means central multisig 2 burned the NFT after full repayment. */
export const SETTLED_STATUS = "settled" satisfies InvoiceLifecycleStatus
