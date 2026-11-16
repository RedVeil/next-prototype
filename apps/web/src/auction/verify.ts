import { encodeForMultisigning, encodeForSigning, encodeForSigningBatch } from "ripple-binary-codec"
import { deriveAddress, verify } from "ripple-keypairs"
import { decode, encode, hashes } from "xrpl"

export type WalletSignPayload = {
  hash?: string
  tx_blob?: string
  signature?: string
  signerAddress?: string
  tx_json?: Record<string, unknown>
}

export class SignatureRejection extends Error {}

function reject(message: string): never {
  throw new SignatureRejection(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (!isRecord(value)) return value
  const entries = Object.keys(value)
    .sort()
    .map((key) => [key, sorted(value[key])])
  return Object.fromEntries(entries)
}

function samePayload(left: unknown, right: unknown) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right))
}

function withoutSignature(tx: Record<string, unknown>) {
  const copy = { ...tx }
  delete copy.TxnSignature
  delete copy.Signers
  delete copy.SigningPubKey
  delete copy.hash
  return copy
}

export function payloadHash(tx: Record<string, unknown>) {
  return hashes.hashSignedTx(encode(withoutSignature(tx) as never)).toUpperCase()
}

function transactionFrom(payload: WalletSignPayload) {
  if (typeof payload.tx_blob === "string" && payload.tx_blob.length > 0) {
    let decoded: unknown
    try {
      decoded = decode(payload.tx_blob)
    } catch {
      reject("The signed transaction could not be read.")
    }
    if (!isRecord(decoded)) reject("The signed transaction could not be read.")
    const hash = hashes.hashSignedTx(payload.tx_blob).toUpperCase()
    if (payload.hash && payload.hash.toUpperCase() !== hash) {
      reject("The signed transaction hash does not match its blob.")
    }
    return { transaction: decoded, hash }
  }
  if (isRecord(payload.tx_json)) return { transaction: payload.tx_json, hash: payload.hash?.toUpperCase() ?? "" }
  reject("The wallet did not return a signed transaction.")
}

function signerEntry(tx: Record<string, unknown>) {
  const signers = tx.Signers
  if (!Array.isArray(signers) || signers.length !== 1) return null
  const wrapper = signers[0]
  if (!isRecord(wrapper) || !isRecord(wrapper.Signer)) return null
  const signer = wrapper.Signer
  if (typeof signer.Account !== "string" || typeof signer.SigningPubKey !== "string" || typeof signer.TxnSignature !== "string") {
    return null
  }
  if (!signer.SigningPubKey || !signer.TxnSignature) return null
  return { account: signer.Account, publicKey: signer.SigningPubKey, signature: signer.TxnSignature }
}

function signatureHolds(message: string, signature: string, publicKey: string) {
  try {
    return verify(message, signature, publicKey)
  } catch {
    return false
  }
}

export function verifyWalletSignature(
  payload: WalletSignPayload,
  expected: { account: string; signer: string; unsigned: Record<string, unknown>; lastLedger: number },
) {
  const { transaction } = transactionFrom(payload)
  if (transaction.Account !== expected.account) reject("The signed transaction is for a different account.")
  if (transaction.LastLedgerSequence !== expected.lastLedger) {
    reject("The signed transaction changed its last ledger.")
  }
  if (!samePayload(withoutSignature(transaction), withoutSignature(expected.unsigned))) {
    reject("The signed transaction does not match the prepared payload.")
  }

  const multisig = signerEntry(transaction)
  if (multisig) {
    if (multisig.account !== expected.signer) reject("The signer is not the connected wallet.")
    if (deriveAddress(multisig.publicKey) !== expected.signer) reject("The signer key does not match the wallet.")
    const message = encodeForMultisigning({ ...withoutSignature(transaction), SigningPubKey: "" }, expected.signer)
    if (!signatureHolds(message, multisig.signature, multisig.publicKey)) {
      reject("The wallet signature is not valid.")
    }
    return { transaction, signer: multisig.account, publicKey: multisig.publicKey }
  }

  const publicKey = typeof transaction.SigningPubKey === "string" ? transaction.SigningPubKey : ""
  const signature = typeof transaction.TxnSignature === "string" ? transaction.TxnSignature : ""
  if (!publicKey || !signature) reject("The wallet signature is missing.")
  if (deriveAddress(publicKey) !== expected.signer) reject("The signer key does not match the wallet.")
  if (expected.signer !== expected.account) reject("This account requires the wallet's multisig signature.")
  const message = encodeForSigning({ ...withoutSignature(transaction), SigningPubKey: publicKey })
  if (!signatureHolds(message, signature, publicKey)) reject("The wallet signature is not valid.")
  return { transaction, signer: expected.signer, publicKey }
}

export type BatchAuthorization = {
  batchAccount: string
  signer: string
  publicKey: string
  signature: string
}

function batchSignerFrom(payload: WalletSignPayload, batchAccount: string): BatchAuthorization | null {
  const json = isRecord(payload.tx_json) ? payload.tx_json : null
  const signers = json?.BatchSigners
  if (!Array.isArray(signers)) return null
  for (const entry of signers) {
    if (!isRecord(entry) || !isRecord(entry.BatchSigner)) continue
    const signer = entry.BatchSigner
    if (signer.Account !== batchAccount || !Array.isArray(signer.Signers)) continue
    const inner = signer.Signers[0]
    if (!isRecord(inner) || !isRecord(inner.Signer)) continue
    const signature = inner.Signer
    if (
      typeof signature.Account === "string" &&
      typeof signature.SigningPubKey === "string" &&
      typeof signature.TxnSignature === "string"
    ) {
      return {
        batchAccount,
        signer: signature.Account,
        publicKey: signature.SigningPubKey,
        signature: signature.TxnSignature,
      }
    }
  }
  return null
}

export function verifyBatchAuthorization(
  payload: WalletSignPayload,
  expected: {
    outerAccount: string
    outerSequence: number
    flags: number
    txIDs: string[]
    batchAccount: string
    signer: string
  },
) {
  const attached = batchSignerFrom(payload, expected.batchAccount)
  const fromTransaction = (() => {
    try {
      return signerEntry(transactionFrom(payload).transaction)
    } catch {
      return null
    }
  })()
  const jsonKey =
    isRecord(payload.tx_json) && typeof payload.tx_json.SigningPubKey === "string" ? payload.tx_json.SigningPubKey : ""
  const publicKey = attached?.publicKey || fromTransaction?.publicKey || jsonKey
  const signature = attached?.signature || payload.signature || fromTransaction?.signature || ""
  const signer = attached?.signer || payload.signerAddress || fromTransaction?.account || ""
  if (!publicKey || !signature || !signer) reject("The wallet did not sign the bid batch.")
  if (signer !== expected.signer) reject("The signer is not the connected wallet.")
  if (deriveAddress(publicKey) !== expected.signer) reject("The signer key does not match the wallet.")
  const message = encodeForSigningBatch({
    account: expected.outerAccount,
    sequence: expected.outerSequence,
    flags: expected.flags,
    txIDs: expected.txIDs,
    batchAccount: expected.batchAccount,
    signerAccount: expected.signer,
  })
  if (!signatureHolds(message, signature, publicKey)) reject("The wallet signature does not cover this bid.")
  return { batchAccount: expected.batchAccount, signer, publicKey, signature }
}
