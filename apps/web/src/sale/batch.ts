import { sign } from "ripple-keypairs"
import { isRlusdCurrency, RLUSD_CURRENCY, RLUSD_ISSUER, rlusdValue } from "../ledger/rlusd"
import {
  BatchFlags,
  Client,
  GlobalFlags,
  MPTokenIssuanceCreateFlags,
  MPTokenIssuanceSetFlags,
  Wallet,
  combineBatchSigners,
  decode,
  decodeAccountID,
  encode,
  encodeForSigningBatch,
  hashes,
  type Batch,
} from "xrpl"

export { RLUSD_CURRENCY, RLUSD_ISSUER }
const INNER = GlobalFlags.tfInnerBatchTxn
const DEPOSIT_AUTH = 0x01000000

export class SaleFailure extends Error {}

type InnerTransaction = Record<string, unknown>

export type SaleSequences = {
  sellerOuter: number
  sellerInners: number[]
  investorInners: number[]
}

export type PreparedSale = {
  tx: Batch
  mptIssuanceId: string
  innerHashes: string[]
  sequences: SaleSequences
  lastLedger: number
}

type AccountFacts = {
  sequence: number
  balanceDrops: number
  ownerCount: number
  depositAuth: boolean
  rlusd: { balance: number; limit: number } | null
  preauthorized: Set<string>
}

function rippledCode(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return null
  const data = error.data
  if (!data || typeof data !== "object" || !("error" in data)) return null
  return typeof data.error === "string" ? data.error : null
}

export function mptIssuanceId(sequence: number, issuer: string) {
  const account = Buffer.from(decodeAccountID(issuer))
  const encoded = Buffer.alloc(4)
  encoded.writeUInt32BE(sequence)
  return Buffer.concat([encoded, account]).toString("hex").toUpperCase()
}

function inner(tx: InnerTransaction, sequence: number): InnerTransaction {
  return {
    ...tx,
    Fee: "0",
    Flags: (Number(tx.Flags ?? 0) | INNER) >>> 0,
    Sequence: sequence,
    SigningPubKey: "",
  }
}

async function accountFacts(client: Client, account: string, role: string): Promise<AccountFacts> {
  let info
  try {
    info = await client.request({
      command: "account_info",
      account,
      ledger_index: "validated",
    })
  } catch (error) {
    if (rippledCode(error) === "actNotFound") {
      throw new SaleFailure(`The ${role} multisig is not on the ledger.`)
    }
    throw error
  }

  const root = info.result.account_data
  const lines = await client.request({
    command: "account_lines",
    account,
    ledger_index: "validated",
    peer: RLUSD_ISSUER,
  })
  const line = lines.result.lines.find((entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER)
  const preauthorized = new Set<string>()
  let marker: unknown
  do {
    const page = await client.request({
      command: "account_objects",
      account,
      ledger_index: "validated",
      type: "deposit_preauth",
      limit: 200,
      ...(marker ? { marker: marker as never } : {}),
    })
    for (const entry of page.result.account_objects) {
      if ("Authorize" in entry && typeof entry.Authorize === "string") preauthorized.add(entry.Authorize)
    }
    marker = page.result.marker
  } while (marker)

  return {
    sequence: root.Sequence,
    balanceDrops: Number(root.Balance),
    ownerCount: root.OwnerCount ?? 0,
    depositAuth: (root.Flags & DEPOSIT_AUTH) !== 0,
    rlusd: line ? { balance: Number(line.balance), limit: Number(line.limit) } : null,
    preauthorized,
  }
}

function canReserve(balanceDrops: number, ownerCount: number, extra: number, base: number, increment: number, fee: number) {
  const reserve = base + increment * (ownerCount + extra)
  return balanceDrops >= reserve + fee
}

export async function prepareSale(input: {
  client: Client
  seller: string
  investor: string
  amount: number
}): Promise<PreparedSale> {
  if (input.seller === input.investor) {
    throw new SaleFailure("The seller and the investor use the same multisig.")
  }

  const seller = await accountFacts(input.client, input.seller, "seller")
  const investor = await accountFacts(input.client, input.investor, "investor")
  const saleCents = Math.round(input.amount * 100)
  if (!investor.rlusd || Math.round(investor.rlusd.balance * 100) < saleCents) {
    throw new SaleFailure("The investor's validated RLUSD balance is below the sale amount.")
  }

  const needsTrust = !seller.rlusd || Math.round(seller.rlusd.limit * 100) < saleCents
  const sellerPreauth = seller.depositAuth && !seller.preauthorized.has(input.investor)
  const investorPreauth = investor.depositAuth && !investor.preauthorized.has(input.seller)
  const sellerExtra = (needsTrust ? 1 : 0) + (sellerPreauth ? 1 : 0) + 1
  const investorExtra = (investorPreauth ? 1 : 0) + 1

  const sellerInners: number[] = []
  const investorInners: number[] = []
  const raw: { RawTransaction: InnerTransaction }[] = []
  let sellerSequence = seller.sequence + 1
  let investorSequence = investor.sequence

  const pushSeller = (tx: InnerTransaction) => {
    const sequence = sellerSequence
    sellerSequence += 1
    sellerInners.push(sequence)
    raw.push({ RawTransaction: inner({ ...tx, Account: input.seller }, sequence) })
    return sequence
  }
  const pushInvestor = (tx: InnerTransaction) => {
    const sequence = investorSequence
    investorSequence += 1
    investorInners.push(sequence)
    raw.push({ RawTransaction: inner({ ...tx, Account: input.investor }, sequence) })
    return sequence
  }

  if (needsTrust) {
    pushSeller({
      TransactionType: "TrustSet",
      LimitAmount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: "1000000000" },
    })
  }
  if (sellerPreauth) {
    pushSeller({ TransactionType: "DepositPreauth", Authorize: input.investor })
  }
  if (investorPreauth) {
    pushInvestor({ TransactionType: "DepositPreauth", Authorize: input.seller })
  }

  const createSequence = pushSeller({
    TransactionType: "MPTokenIssuanceCreate",
    MaximumAmount: "1",
    Flags: MPTokenIssuanceCreateFlags.tfMPTCanLock | MPTokenIssuanceCreateFlags.tfMPTCanClawback,
  })
  const issuanceId = mptIssuanceId(createSequence, input.seller)
  pushInvestor({ TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: issuanceId })
  pushSeller({
    TransactionType: "Payment",
    Destination: input.investor,
    Amount: { mpt_issuance_id: issuanceId, value: "1" },
  })
  pushInvestor({
    TransactionType: "Payment",
    Destination: input.seller,
    Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: rlusdValue(input.amount) },
  })
  pushSeller({
    TransactionType: "MPTokenIssuanceSet",
    MPTokenIssuanceID: issuanceId,
    Holder: input.investor,
    Flags: MPTokenIssuanceSetFlags.tfMPTLock,
  })

  if (raw.length > 8) {
    throw new SaleFailure("The sale needs more than 8 inner transactions.")
  }

  const fee = await input.client.request({ command: "fee" })
  const unit = Math.max(Number(fee.result.drops.base_fee), Number(fee.result.drops.open_ledger_fee))
  const feeDrops = unit * (2 + raw.length + 2)
  const server = await input.client.request({ command: "server_info" })
  const reserves = server.result.info.validated_ledger
  const base = Math.round((reserves?.reserve_base_xrp ?? 1) * 1_000_000)
  const increment = Math.round((reserves?.reserve_inc_xrp ?? 0.2) * 1_000_000)
  if (!canReserve(seller.balanceDrops, seller.ownerCount, sellerExtra, base, increment, feeDrops)) {
    throw new SaleFailure("The seller multisig does not have the XRP reserve for this sale.")
  }
  if (!canReserve(investor.balanceDrops, investor.ownerCount, investorExtra, base, increment, 0)) {
    throw new SaleFailure("The investor multisig does not have the XRP reserve for this sale.")
  }

  const ledger = await input.client.request({ command: "ledger", ledger_index: "validated" })
  const tx = {
    TransactionType: "Batch",
    Account: input.seller,
    Flags: BatchFlags.tfAllOrNothing,
    Sequence: seller.sequence,
    Fee: String(feeDrops),
    LastLedgerSequence: Number(ledger.result.ledger_index) + 20,
    RawTransactions: raw,
  } as Batch

  return {
    tx,
    mptIssuanceId: issuanceId,
    innerHashes: raw.map((item) => hashes.hashSignedTx(encode(item.RawTransaction as never))),
    sequences: { sellerOuter: seller.sequence, sellerInners, investorInners },
    lastLedger: Number(ledger.result.ledger_index) + 20,
  }
}

export type PreparedRepayment = {
  tx: Batch
  innerHashes: string[]
  lastLedger: number
}

export async function prepareRepayment(input: {
  client: Client
  repayment: string
  seller: string
  investor: string
  issuanceId: string
  amount: number
}): Promise<PreparedRepayment> {
  if (input.repayment === input.seller || input.repayment === input.investor || input.seller === input.investor) {
    throw new SaleFailure("The repayment, seller, and investor must be different multisigs.")
  }
  if (!/^[0-9A-Fa-f]{48}$/.test(input.issuanceId)) throw new SaleFailure("This invoice has no MPT.")
  if (!(input.amount > 0)) throw new SaleFailure("The repayment amount must be greater than zero.")

  const repayment = await accountFacts(input.client, input.repayment, "repayment")
  const seller = await accountFacts(input.client, input.seller, "seller")
  const investor = await accountFacts(input.client, input.investor, "investor")
  const due = Math.round(input.amount * 100)
  if (!repayment.rlusd || Math.round(repayment.rlusd.balance * 100) < due) {
    throw new SaleFailure("The repayment multisig does not have enough RLUSD.")
  }
  if (investor.depositAuth && !investor.preauthorized.has(input.repayment)) {
    throw new SaleFailure("The investor has not preauthorized the repayment multisig.")
  }

  const issuanceId = input.issuanceId.toUpperCase()
  const raw: { RawTransaction: InnerTransaction }[] = []
  let repaymentSequence = repayment.sequence + 1
  let sellerSequence = seller.sequence

  const pushRepayment = (tx: InnerTransaction) => {
    const sequence = repaymentSequence
    repaymentSequence += 1
    raw.push({ RawTransaction: inner({ ...tx, Account: input.repayment }, sequence) })
  }
  const pushSeller = (tx: InnerTransaction) => {
    const sequence = sellerSequence
    sellerSequence += 1
    raw.push({ RawTransaction: inner({ ...tx, Account: input.seller }, sequence) })
  }

  pushSeller({
    TransactionType: "MPTokenIssuanceSet",
    MPTokenIssuanceID: issuanceId,
    Holder: input.investor,
    Flags: MPTokenIssuanceSetFlags.tfMPTUnlock,
  })
  pushSeller({
    TransactionType: "Clawback",
    Holder: input.investor,
    Amount: { mpt_issuance_id: issuanceId, value: "1" },
  })
  pushSeller({
    TransactionType: "MPTokenIssuanceDestroy",
    MPTokenIssuanceID: issuanceId,
  })
  pushRepayment({
    TransactionType: "Payment",
    Destination: input.investor,
    Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: rlusdValue(input.amount) },
  })

  if (raw.length > 8) throw new SaleFailure("The repayment needs more than 8 inner transactions.")

  const fee = await input.client.request({ command: "fee" })
  const unit = Math.max(Number(fee.result.drops.base_fee), Number(fee.result.drops.open_ledger_fee))
  const feeDrops = unit * (2 + raw.length + 2)
  const server = await input.client.request({ command: "server_info" })
  const reserves = server.result.info.validated_ledger
  const base = Math.round((reserves?.reserve_base_xrp ?? 1) * 1_000_000)
  const increment = Math.round((reserves?.reserve_inc_xrp ?? 0.2) * 1_000_000)
  if (!canReserve(repayment.balanceDrops, repayment.ownerCount, 0, base, increment, feeDrops)) {
    throw new SaleFailure("The repayment multisig does not have the XRP reserve for this repayment.")
  }
  if (!canReserve(seller.balanceDrops, seller.ownerCount, 0, base, increment, 0)) {
    throw new SaleFailure("The seller multisig does not have the XRP reserve for this repayment.")
  }

  const ledger = await input.client.request({ command: "ledger", ledger_index: "validated" })
  const tx = {
    TransactionType: "Batch",
    Account: input.repayment,
    Flags: BatchFlags.tfAllOrNothing,
    Sequence: repayment.sequence,
    Fee: String(feeDrops),
    LastLedgerSequence: Number(ledger.result.ledger_index) + 20,
    RawTransactions: raw,
  } as Batch

  return {
    tx,
    innerHashes: raw.map((item) => hashes.hashSignedTx(encode(item.RawTransaction as never))),
    lastLedger: Number(ledger.result.ledger_index) + 20,
  }
}

export function signPreparedBatch(sellerWallet: Wallet, investorWallet: Wallet, investorAccount: string, batch: Batch) {
  const copy = JSON.parse(JSON.stringify(batch)) as Batch
  if (typeof copy.Flags !== "number" || typeof copy.Sequence !== "number") {
    throw new Error("The batch is missing its flags or sequence.")
  }
  const txIDs = copy.RawTransactions.map((raw) => hashes.hashSignedTx(encode(raw.RawTransaction)))
  const payload = encodeForSigningBatch({
    account: copy.Account,
    sequence: copy.Sequence,
    flags: copy.Flags,
    txIDs,
    batchAccount: investorAccount,
    signerAccount: investorWallet.classicAddress,
  } as never)
  copy.BatchSigners = [
    {
      BatchSigner: {
        Account: investorAccount,
        Signers: [
          {
            Signer: {
              Account: investorWallet.classicAddress,
              SigningPubKey: investorWallet.publicKey,
              TxnSignature: sign(payload, investorWallet.privateKey),
            },
          },
        ],
      },
    },
  ]
  const investorSignature = copy.BatchSigners
  const signed = sellerWallet.sign(decode(combineBatchSigners([copy])) as unknown as Batch, true)
  if (hashes.hashSignedTx(signed.tx_blob) !== signed.hash) {
    throw new Error("The signed batch hash does not match its blob.")
  }
  return { blob: signed.tx_blob, hash: signed.hash, investorSignature }
}

export function signRepaymentBatch(repaymentWallet: Wallet, sellerWallet: Wallet, sellerAccount: string, batch: Batch) {
  const copy = JSON.parse(JSON.stringify(batch)) as Batch
  if (typeof copy.Flags !== "number" || typeof copy.Sequence !== "number") {
    throw new Error("The batch is missing its flags or sequence.")
  }
  const txIDs = copy.RawTransactions.map((raw) => hashes.hashSignedTx(encode(raw.RawTransaction)))
  const payload = encodeForSigningBatch({
    account: copy.Account,
    sequence: copy.Sequence,
    flags: copy.Flags,
    txIDs,
    batchAccount: sellerAccount,
    signerAccount: sellerWallet.classicAddress,
  } as never)
  copy.BatchSigners = [
    {
      BatchSigner: {
        Account: sellerAccount,
        Signers: [
          {
            Signer: {
              Account: sellerWallet.classicAddress,
              SigningPubKey: sellerWallet.publicKey,
              TxnSignature: sign(payload, sellerWallet.privateKey),
            },
          },
        ],
      },
    },
  ]
  const signed = repaymentWallet.sign(decode(combineBatchSigners([copy])) as unknown as Batch, true)
  if (hashes.hashSignedTx(signed.tx_blob) !== signed.hash) {
    throw new Error("The signed batch hash does not match its blob.")
  }
  return { blob: signed.tx_blob, hash: signed.hash }
}

export function submitDisposition(engine: string) {
  if (engine.startsWith("tes") || engine === "terQUEUED" || engine === "terPRE_SEQ") return "accepted" as const
  if (engine.startsWith("ter") || engine.startsWith("tel")) return "retry" as const
  if (engine === "tefPAST_SEQ") return "sequence" as const
  if (engine === "tefMAX_LEDGER") return "expired" as const
  return "reject" as const
}

export function transactionResult(tx: { meta?: unknown }) {
  if (!tx.meta || typeof tx.meta !== "object") return null
  const result = (tx.meta as { TransactionResult?: unknown }).TransactionResult
  return typeof result === "string" ? result : null
}

export function issuanceIdFromMeta(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = issuanceIdFromMeta(item)
      if (found) return found
    }
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.mpt_issuance_id === "string" && /^[0-9A-Fa-f]{48}$/.test(record.mpt_issuance_id)) {
    return record.mpt_issuance_id.toUpperCase()
  }
  for (const item of Object.values(record)) {
    const found = issuanceIdFromMeta(item)
    if (found) return found
  }
  return null
}
