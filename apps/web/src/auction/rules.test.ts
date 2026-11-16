import assert from "node:assert/strict"
import { deriveAddress, deriveKeypair, generateSeed, sign } from "ripple-keypairs"
import { encodeForMultisigning, encodeForSigningBatch } from "ripple-binary-codec"
import { encode } from "xrpl"
import {
  bidIsFunded,
  chooseNextBid,
  compareBids,
  discountCents,
  quoteInvoice,
  rankBids,
  rlusdCentsFromProceeds,
} from "./price"
import { holdOuterTicket, planSetupSequences, releaseHold, type PoolTicket } from "./tickets"
import { verifyBatchAuthorization, verifyWalletSignature } from "./verify"

process.env.XRPL_SOURCE_TAG = "1"

function ticket(id: string, kind: "inner" | "outer", state: PoolTicket["state"] = "available"): PoolTicket {
  return { id, kind, state, heldAt: null }
}

function halfUpDiscount() {
  assert.equal(discountCents(100_000, 0.12, 30), 986)
  assert.equal(discountCents(1, 0.5, 365), 1)
  const priced = quoteInvoice({ face: 1000, apr: 0.12, days: 30, rate: 0.2, currency: "BRL" })
  assert.equal(priced.discountCents, 986)
  assert.equal(priced.proceedsCents, 100_000 - 986)
  assert.equal(priced.rlusdCents, rlusdCentsFromProceeds(priced.proceedsCents, 0.2))
  assert.equal(priced.rlusdText, "198.03")
}

function ranking() {
  const bids = [
    { id: "b", rlusdCents: 1000, signedAt: "2026-11-16T12:00:00.000Z" },
    { id: "c", rlusdCents: 1000, signedAt: "2026-11-16T11:00:00.000Z" },
    { id: "a", rlusdCents: 1000, signedAt: "2026-11-16T11:00:00.000Z" },
    { id: "d", rlusdCents: 900, signedAt: "2026-11-16T10:00:00.000Z" },
  ]
  assert.deepEqual(
    rankBids(bids).map((bid) => bid.id),
    ["a", "c", "b", "d"],
  )
  assert.equal(compareBids(bids[2], bids[1]) < 0, true)
  const funded = chooseNextBid(
    bids.map((bid) => ({ ...bid, investorId: bid.id })),
    new Set(["a"]),
    (bid) => bidIsFunded({ bidCents: bid.rlusdCents, balanceCents: 1000, otherSignedCents: bid.id === "c" ? 1000 : 0 }),
  )
  assert.equal(funded?.id, "b")
}

function tickets() {
  const pool = [ticket("inner", "inner"), ticket("one", "outer"), ticket("two", "outer")]
  const first = holdOuterTicket(pool, 1_000)
  const second = holdOuterTicket(first.tickets, 1_000)
  assert.equal(first.heldId, "one")
  assert.equal(second.heldId, "two")
  assert.equal(second.tickets.find((item) => item.id === "inner")?.state, "available")
  assert.throws(() => holdOuterTicket(second.tickets, 1_000), /No outer ticket/)
  const released = releaseHold(first.tickets, "one")
  const again = holdOuterTicket(released, 2_000)
  assert.equal(again.heldId, "one")
  const stale = holdOuterTicket(pool, 1_000)
  const afterTimeout = holdOuterTicket(stale.tickets, 1_000 + 10 * 60 * 1000)
  assert.equal(afterTimeout.heldId, "one")

  const plan = planSetupSequences(100, false, 2)
  assert.equal(plan.innerTicket, 101)
  assert.deepEqual(plan.outerTickets, [102, 103])
  assert.equal(plan.issuanceSequence, 104)
  assert.equal(new Set([plan.innerTicket, ...plan.outerTickets]).has(plan.issuanceSequence), false)
  const withTrust = planSetupSequences(100, true, 2)
  assert.equal(withTrust.trustSequence, 100)
  assert.equal(withTrust.issuanceSequence, 105)
  assert.equal(withTrust.innerTicket === withTrust.issuanceSequence, false)
}

function signatures() {
  const keys = deriveKeypair(generateSeed())
  const wallet = deriveKeypair(generateSeed())
  const signerAddress = deriveAddress(wallet.publicKey)
  const multisigAddress = deriveAddress(keys.publicKey)
  const unsigned = {
    TransactionType: "AccountSet",
    Account: multisigAddress,
    Sequence: 8,
    Fee: "12",
    LastLedgerSequence: 90,
    SigningPubKey: "",
    Signers: [{ Signer: { Account: signerAddress, SigningPubKey: "", TxnSignature: "" } }],
  }
  const message = encodeForMultisigning(
    { TransactionType: "AccountSet", Account: multisigAddress, Sequence: 8, Fee: "12", LastLedgerSequence: 90, SigningPubKey: "" },
    signerAddress,
  )
  const signature = sign(message, wallet.privateKey)
  const signed = {
    ...unsigned,
    Signers: [{ Signer: { Account: signerAddress, SigningPubKey: wallet.publicKey, TxnSignature: signature } }],
  }
  const blob = encode(signed as never)
  const verified = verifyWalletSignature(
    { tx_blob: blob },
    { account: multisigAddress, signer: signerAddress, unsigned, lastLedger: 90 },
  )
  assert.equal(verified.signer, signerAddress)
  assert.throws(
    () =>
      verifyWalletSignature(
        { tx_blob: blob },
        { account: multisigAddress, signer: signerAddress, unsigned, lastLedger: 91 },
      ),
    /last ledger/,
  )

  const batchSignature = sign(
    encodeForSigningBatch({
      account: multisigAddress,
      sequence: 7,
      flags: 65536,
      txIDs: ["A".repeat(64)],
      batchAccount: multisigAddress,
      signerAccount: signerAddress,
    }),
    wallet.privateKey,
  )
  const authorization = verifyBatchAuthorization(
    { signature: batchSignature, signerAddress, tx_json: { SigningPubKey: wallet.publicKey } },
    {
      outerAccount: multisigAddress,
      outerSequence: 7,
      flags: 65536,
      txIDs: ["A".repeat(64)],
      batchAccount: multisigAddress,
      signer: signerAddress,
    },
  )
  assert.equal(authorization.signature, batchSignature)
}

halfUpDiscount()
ranking()
tickets()
signatures()
console.log("auction rules ok")
