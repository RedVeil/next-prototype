export const LEDGER_BOT_SERVICE = "ledger_bot" as const

export const LEDGER_JOB_TYPES = [
  "provision_investor_multisigs",
  "reserve_funds",
  "perfect_sale",
  "mint_invoice_nft",
  "disburse_to_company",
  "settle_repayment",
  "burn_invoice_nft",
  "withdraw_rlusd",
] as const

export type LedgerJobType = (typeof LEDGER_JOB_TYPES)[number]

export type LedgerJobStatus = "queued" | "refused" | "succeeded" | "failed"

export type LedgerJob = {
  id: string
  type: LedgerJobType
  /** The only wallet this job may name. The worker loads that key and no other. */
  botWalletId: string
  payload: Record<string, unknown>
  status: LedgerJobStatus
  attempts: number
  lastError: string | null
  investorId?: string
}

export const SUBMIT_REFUSAL =
  "Ledger bot refuses to submit. XRPL_NETWORK is read, and submission stays unarmed in this phase."

/**
 * Refuses every job passed to it. Investor multisig provisioning is a separate armed path
 * in the worker. This function does not load seeds and does not generate keys.
 */
export function submitLedgerJob(job: LedgerJob, env: { XRPL_NETWORK?: string } = {}): LedgerJob {
  const network = env.XRPL_NETWORK ?? "mainnet"
  return {
    ...job,
    status: "refused",
    attempts: job.attempts + 1,
    lastError: `${SUBMIT_REFUSAL} Network hint: ${network}.`,
  }
}
