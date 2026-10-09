export const FUNDER_SERVICE = "funder" as const

export type FunderStatus = "idle" | "stubbed"

export type FunderConfig = {
  fundingAccountId: string
  thresholdXrp: number
}

export type FundedAccount = {
  id: string
  xrpBalance: number
}

export type TopUpPlan = {
  accountId: string
  fundingAccountId: string
  thresholdXrp: number
  status: "stubbed"
}

export const funderStatus: FunderStatus = "stubbed"

export function accountsBelowThreshold(
  accounts: FundedAccount[],
  thresholdXrp: number,
): FundedAccount[] {
  return accounts.filter((account) => account.xrpBalance < thresholdXrp)
}

/** Plans a top-up. It does not submit an XRP payment. */
export function planTopUp(account: FundedAccount, config: FunderConfig): TopUpPlan | null {
  if (account.xrpBalance >= config.thresholdXrp) return null
  return {
    accountId: account.id,
    fundingAccountId: config.fundingAccountId,
    thresholdXrp: config.thresholdXrp,
    status: "stubbed",
  }
}
