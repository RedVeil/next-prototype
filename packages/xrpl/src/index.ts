export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000"

/** Mainnet RLUSD issuer published by Ripple. Override with RLUSD_ISSUER when it changes. */
export const DEFAULT_RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"

export const ASF_DISABLE_MASTER = 4
export const ASF_DEPOSIT_AUTH = 9

export type IssuedAmount = {
  currency: string
  issuer: string
  value: string
}

export type UnsignedPayment = {
  TransactionType: "Payment"
  Account: string
  Destination: string
  Amount: IssuedAmount
}

export type UnsignedNftMint = {
  TransactionType: "NFTokenMint"
  Account: string
  NFTokenTaxon: number
  URI?: string
  Flags: number
  Destination: string
}

export type UnsignedNftBurn = {
  TransactionType: "NFTokenBurn"
  Account: string
  NFTokenID: string
  Owner?: string
}

export type SignerEntry = {
  SignerEntry: {
    Account: string
    SignerWeight: number
  }
}

export type UnsignedSignerListSet = {
  TransactionType: "SignerListSet"
  Account: string
  SignerQuorum: number
  SignerEntries: SignerEntry[]
}

export type UnsignedAccountSet = {
  TransactionType: "AccountSet"
  Account: string
  SetFlag: number
}

export type UnsignedDepositPreauth = {
  TransactionType: "DepositPreauth"
  Account: string
  Authorize?: string
  Unauthorize?: string
}

export type UnsignedTrustSet = {
  TransactionType: "TrustSet"
  Account: string
  LimitAmount: IssuedAmount
}

export type UnsignedTransaction =
  | UnsignedPayment
  | UnsignedNftMint
  | UnsignedNftBurn
  | UnsignedSignerListSet
  | UnsignedAccountSet
  | UnsignedDepositPreauth
  | UnsignedTrustSet

export type ReservationPaymentInput = {
  investorMultisig1: string
  investorMultisig2: string
  rlusdIssuer: string
  amount: string
}

export type RepaymentPaymentInput = {
  centralMultisig3: string
  investorMultisig1: string
  rlusdIssuer: string
  amount: string
}

export type NftMintInput = {
  centralMultisig2: string
  investorMultisig1: string
  taxon?: number
  uriHex?: string
}

export type NftBurnInput = {
  centralMultisig2: string
  tokenId: string
  holder: string
}

/** Reservation of RLUSD from investor multisig 1 to investor multisig 2. Not signed or submitted. */
export function buildReservationPayment(input: ReservationPaymentInput): UnsignedPayment {
  return {
    TransactionType: "Payment",
    Account: input.investorMultisig1,
    Destination: input.investorMultisig2,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: input.rlusdIssuer,
      value: input.amount,
    },
  }
}

/** RLUSD repayment from central multisig 3 to investor multisig 1. Not signed or submitted. */
export function buildRepaymentPayment(input: RepaymentPaymentInput): UnsignedPayment {
  return {
    TransactionType: "Payment",
    Account: input.centralMultisig3,
    Destination: input.investorMultisig1,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: input.rlusdIssuer,
      value: input.amount,
    },
  }
}

/**
 * NFTokenMint by central multisig 2, with investor multisig 1 as the intended holder.
 * On XRPL the issuer account is the NFT contract. This builder does not sign or submit.
 */
export function buildInvoiceNftMint(input: NftMintInput): UnsignedNftMint {
  return {
    TransactionType: "NFTokenMint",
    Account: input.centralMultisig2,
    NFTokenTaxon: input.taxon ?? 0,
    URI: input.uriHex,
    Flags: 0,
    Destination: input.investorMultisig1,
  }
}

/** NFTokenBurn by central multisig 2 after full repayment. Not signed or submitted. */
export function buildInvoiceNftBurn(input: NftBurnInput): UnsignedNftBurn {
  return {
    TransactionType: "NFTokenBurn",
    Account: input.centralMultisig2,
    NFTokenID: input.tokenId,
    Owner: input.holder,
  }
}

/** Signer list for a multisig account. Entries are sorted by address, as XRPL requires. */
export function buildSignerListSet(input: {
  account: string
  quorum: number
  signers: { address: string; weight: number }[]
}): UnsignedSignerListSet {
  const signers = [...input.signers].sort((a, b) => (a.address < b.address ? -1 : 1))
  return {
    TransactionType: "SignerListSet",
    Account: input.account,
    SignerQuorum: input.quorum,
    SignerEntries: signers.map((signer) => ({
      SignerEntry: { Account: signer.address, SignerWeight: signer.weight },
    })),
  }
}

export function buildDepositAuth(account: string): UnsignedAccountSet {
  return { TransactionType: "AccountSet", Account: account, SetFlag: ASF_DEPOSIT_AUTH }
}

export function buildDisableMaster(account: string): UnsignedAccountSet {
  return { TransactionType: "AccountSet", Account: account, SetFlag: ASF_DISABLE_MASTER }
}

export function buildDepositPreauth(input: {
  account: string
  authorize?: string
  unauthorize?: string
}): UnsignedDepositPreauth {
  return {
    TransactionType: "DepositPreauth",
    Account: input.account,
    Authorize: input.authorize,
    Unauthorize: input.unauthorize,
  }
}

/** Trust line so the account can hold RLUSD. The limit is high on purpose. */
export function buildTrustSet(input: {
  account: string
  issuer: string
  limit?: string
}): UnsignedTrustSet {
  return {
    TransactionType: "TrustSet",
    Account: input.account,
    LimitAmount: {
      currency: RLUSD_CURRENCY,
      issuer: input.issuer,
      value: input.limit ?? "1000000000",
    },
  }
}

/** Withdrawal of RLUSD from investor multisig 1 back to the investor's own account. */
export function buildWithdrawPayment(input: {
  investorMultisig1: string
  investorAccount: string
  rlusdIssuer: string
  amount: string
}): UnsignedPayment {
  return {
    TransactionType: "Payment",
    Account: input.investorMultisig1,
    Destination: input.investorAccount,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: input.rlusdIssuer,
      value: input.amount,
    },
  }
}

/** This package never submits. The ledger bot and the withdrawal action submit. */
export function submitTransaction(_tx: UnsignedTransaction): never {
  throw new Error("XRPL submission is not available. Transaction builders do not submit.")
}
