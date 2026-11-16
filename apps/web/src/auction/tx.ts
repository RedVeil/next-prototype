import { RLUSD_CURRENCY, RLUSD_ISSUER, rlusdValue } from "../ledger/rlusd"
import { xrplSourceTag } from "../ledger/source-tag"
import {
  BatchFlags,
  GlobalFlags,
  MPTokenIssuanceCreateFlags,
  MPTokenIssuanceSetFlags,
  encode,
  hashes,
  type Batch,
  type SubmittableTransaction,
} from "xrpl"
import { planSetupSequences } from "./tickets"

const INNER = GlobalFlags.tfInnerBatchTxn

export const SUBMISSION_MARGIN_LEDGERS = 20
export const LEDGER_SECONDS = 4

type JsonTx = Record<string, unknown>

export type SetupPlan = {
  needsTrust: boolean
  outerCount: number
  sequences: ReturnType<typeof planSetupSequences>
  transactions: JsonTx[]
}

function withSigner(tx: JsonTx, signer: string): JsonTx {
  return {
    ...tx,
    SigningPubKey: "",
    Signers: [{ Signer: { Account: signer, SigningPubKey: "", TxnSignature: "" } }],
  }
}

export function ledgerForDeadline(currentLedger: number, nowMs: number, deadlineMs: number) {
  const seconds = Math.max(0, (deadlineMs - nowMs) / 1000)
  const ledgers = Math.ceil(seconds / LEDGER_SECONDS)
  return currentLedger + ledgers + SUBMISSION_MARGIN_LEDGERS
}

export function buildSetupTransactions(input: {
  seller: string
  signer: string
  accountSequence: number
  needsTrust: boolean
  outerCount: number
  reuseIssuance: boolean
  fee: string
  lastLedger: number
}): SetupPlan {
  const sequences = planSetupSequences(input.accountSequence, input.needsTrust, input.outerCount)
  const common = {
    Account: input.seller,
    Fee: input.fee,
    LastLedgerSequence: input.lastLedger,
    SourceTag: xrplSourceTag(),
  }
  const transactions: JsonTx[] = []
  if (sequences.trustSequence !== null) {
    transactions.push(
      withSigner(
        {
          ...common,
          TransactionType: "TrustSet",
          Sequence: sequences.trustSequence,
          LimitAmount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: "1000000000" },
        },
        input.signer,
      ),
    )
  }
  transactions.push(
    withSigner(
      {
        ...common,
        TransactionType: "TicketCreate",
        Sequence: sequences.ticketCreateSequence,
        TicketCount: sequences.ticketCount,
      },
      input.signer,
    ),
  )
  if (!input.reuseIssuance) {
    transactions.push(
      withSigner(
        {
          ...common,
          TransactionType: "MPTokenIssuanceCreate",
          Sequence: sequences.issuanceSequence,
          MaximumAmount: "1",
          Flags: MPTokenIssuanceCreateFlags.tfMPTCanLock | MPTokenIssuanceCreateFlags.tfMPTCanClawback,
        },
        input.signer,
      ),
    )
  }
  return { needsTrust: input.needsTrust, outerCount: input.outerCount, sequences, transactions }
}

function inner(tx: JsonTx, sequence?: number, ticket?: number): JsonTx {
  const flagged = {
    ...tx,
    Fee: "0",
    Flags: (Number(tx.Flags ?? 0) | INNER) >>> 0,
    SigningPubKey: "",
    SourceTag: xrplSourceTag(),
  }
  if (ticket !== undefined) return { ...flagged, TicketSequence: ticket }
  return { ...flagged, Sequence: sequence }
}

export type BuiltBid = {
  tx: JsonTx
  txIDs: string[]
  investorSequence: number
  sellerLockSequence: number
}

export function buildBidBatch(input: {
  seller: string
  investor: string
  issuanceId: string
  rlusd: number
  outerTicket: number
  innerTicket: number
  sellerSequence: number
  investorSequence: number
  sellerPreauth: boolean
  investorPreauth: boolean
  lastLedger: number
  fee: string
}): BuiltBid {
  if (input.seller === input.investor) throw new Error("The seller and the investor use the same multisig.")
  if (input.outerTicket === input.innerTicket) throw new Error("The bid ticket and the shared ticket are the same.")
  const raw: { RawTransaction: JsonTx }[] = []
  let sellerSequence = input.sellerSequence
  let investorSequence = input.investorSequence
  const pushSeller = (tx: JsonTx, ticket?: number) => {
    if (ticket !== undefined) {
      raw.push({ RawTransaction: inner({ ...tx, Account: input.seller }, undefined, ticket) })
      return
    }
    const sequence = sellerSequence
    sellerSequence += 1
    raw.push({ RawTransaction: inner({ ...tx, Account: input.seller }, sequence) })
  }
  const pushInvestor = (tx: JsonTx) => {
    const sequence = investorSequence
    investorSequence += 1
    raw.push({ RawTransaction: inner({ ...tx, Account: input.investor }, sequence) })
  }

  if (input.sellerPreauth) pushSeller({ TransactionType: "DepositPreauth", Authorize: input.investor })
  if (input.investorPreauth) pushInvestor({ TransactionType: "DepositPreauth", Authorize: input.seller })
  pushSeller(
    {
      TransactionType: "Payment",
      Destination: input.investor,
      Amount: { mpt_issuance_id: input.issuanceId, value: "1" },
    },
    input.innerTicket,
  )
  const paymentSequence = investorSequence
  pushInvestor({
    TransactionType: "Payment",
    Destination: input.seller,
    Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: rlusdValue(input.rlusd) },
  })
  const lockSequence = sellerSequence
  pushSeller({
    TransactionType: "MPTokenIssuanceSet",
    MPTokenIssuanceID: input.issuanceId,
    Holder: input.investor,
    Flags: MPTokenIssuanceSetFlags.tfMPTLock,
  })
  if (raw.length > 8) throw new Error("The bid needs more than 8 inner transactions.")

  const tx: JsonTx = {
    TransactionType: "Batch",
    Account: input.seller,
    Flags: BatchFlags.tfAllOrNothing,
    TicketSequence: input.outerTicket,
    Fee: input.fee,
    LastLedgerSequence: input.lastLedger,
    RawTransactions: raw,
    SourceTag: xrplSourceTag(),
  }
  return {
    tx,
    txIDs: raw.map((item) => hashes.hashSignedTx(encode(item.RawTransaction as never))),
    investorSequence: paymentSequence,
    sellerLockSequence: lockSequence,
  }
}

export function buildHolderAuthorize(input: {
  investor: string
  signer: string
  issuanceId: string
  sequence: number
  fee: string
  lastLedger: number
}): JsonTx {
  return withSigner(
    {
      TransactionType: "MPTokenAuthorize",
      Account: input.investor,
      MPTokenIssuanceID: input.issuanceId,
      Sequence: input.sequence,
      Fee: input.fee,
      LastLedgerSequence: input.lastLedger,
      SourceTag: xrplSourceTag(),
    },
    input.signer,
  )
}

export function buildSequenceCancel(input: {
  account: string
  signer: string
  sequence: number
  fee: string
  lastLedger: number
}): JsonTx {
  return withSigner(
    {
      TransactionType: "AccountSet",
      Account: input.account,
      Sequence: input.sequence,
      Fee: input.fee,
      LastLedgerSequence: input.lastLedger,
      SourceTag: xrplSourceTag(),
    },
    input.signer,
  )
}

export function attachBatchSigner(tx: JsonTx, authorization: {
  batchAccount: string
  signer: string
  publicKey: string
  signature: string
}) {
  return {
    ...tx,
    BatchSigners: [
      {
        BatchSigner: {
          Account: authorization.batchAccount,
          Signers: [
            {
              Signer: {
                Account: authorization.signer,
                SigningPubKey: authorization.publicKey,
                TxnSignature: authorization.signature,
              },
            },
          ],
        },
      },
    ],
  }
}

export function forSellerSignature(tx: JsonTx, signer: string) {
  return withSigner(tx, signer)
}

export function innerPaymentKinds(tx: JsonTx) {
  const raw = tx.RawTransactions
  if (!Array.isArray(raw)) return { mpt: false, rlusd: false }
  let mpt = false
  let rlusd = false
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const innerTx = (item as { RawTransaction?: JsonTx }).RawTransaction
    if (!innerTx || innerTx.TransactionType !== "Payment") continue
    const amount = innerTx.Amount
    if (!amount || typeof amount !== "object") continue
    if ("mpt_issuance_id" in amount) mpt = true
    if ("currency" in amount) rlusd = true
  }
  return { mpt, rlusd }
}

export type { Batch, SubmittableTransaction }
