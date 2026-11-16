import { isValidClassicAddress } from "xrpl"
import { loadCatalogue } from "../app/match/load"
import { daysUntilDue, listEligibleBuckets } from "../app/match/match"
import { frankfurterRate } from "../app/match/rate"
import { withClient } from "../app/sandbox/ledger"
import { createServiceClient } from "../lib/supabase/service"
import { decode, encode } from "xrpl"
import {
  AuctionFailure,
  holderHasMpt,
  innerHashes,
  issuanceFromValidated,
  issuanceOutstanding,
  openLedgerFee,
  readAccount,
  readTx,
  reserveCovers,
  reserves,
  signedHash,
  submitIdentical,
  validatedLedger,
  waitForValidation,
} from "./ledger"
import { auctionHours, bidIsFunded, cents, DEFAULT_AUCTION_HOURS, FX_SOURCE, quoteInvoice, rankBids, rlusdCentsFromProceeds } from "./price"
import { OUTER_POOL_CAP } from "./tickets"
import {
  attachBatchSigner,
  buildBidBatch,
  buildHolderAuthorize,
  buildSequenceCancel,
  buildSetupTransactions,
  forSellerSignature,
  innerPaymentKinds,
  ledgerForDeadline,
} from "./tx"
import { payloadHash, SignatureRejection, verifyBatchAuthorization, verifyWalletSignature, type BatchAuthorization, type WalletSignPayload } from "./verify"
import { mptIssuanceId, transactionResult } from "../sale/batch"

type Service = ReturnType<typeof createServiceClient>
type Row = Record<string, unknown>

const OPEN_ROUND = ["setup_pending", "open", "accepting", "submitted"]
const OPEN_ORDER = ["queued", "preparing", "submitted", "accepting", "unknown"]

function fail(error: unknown, fallback: string) {
  if (error instanceof AuctionFailure || error instanceof SignatureRejection) return error.message
  return error instanceof Error ? error.message : fallback
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function stamp() {
  return new Date().toISOString()
}

async function organisationParty(supabase: Service, organisationId: string, identityId: string) {
  const [identity, multisig] = await Promise.all([
    supabase.from("identities").select("xrpl_address").eq("id", identityId).maybeSingle(),
    supabase
      .from("multisigs")
      .select("id, address, status, quorum")
      .eq("organisation_id", organisationId)
      .eq("type", "org")
      .maybeSingle(),
  ])
  if (identity.error) throw new Error(identity.error.message)
  if (multisig.error) throw new Error(multisig.error.message)
  const wallet = typeof identity.data?.xrpl_address === "string" ? identity.data.xrpl_address : ""
  if (!isValidClassicAddress(wallet)) throw new AuctionFailure("Set an XRPL address on this user before signing.")
  const address = typeof multisig.data?.address === "string" ? multisig.data.address : ""
  const status = multisig.data?.status
  if (!multisig.data || !isValidClassicAddress(address) || (status !== "live" && status !== "paused")) {
    throw new AuctionFailure("This organisation has no multisig.")
  }
  const signer = await supabase
    .from("org_multisig_signers")
    .select("weight")
    .eq("multisig_id", multisig.data.id as string)
    .eq("address", wallet)
    .maybeSingle()
  if (signer.error) throw new Error(signer.error.message)
  if (asNumber(signer.data?.weight) < asNumber(multisig.data.quorum)) {
    throw new AuctionFailure("The connected wallet cannot meet the quorum.")
  }
  return { wallet, account: address, multisigId: multisig.data.id as string }
}

async function sellerDuration(supabase: Service, organisationId: string) {
  const { data, error } = await supabase
    .from("organisations")
    .select("auction_duration_hours")
    .eq("id", organisationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const hours = asNumber(data?.auction_duration_hours) || DEFAULT_AUCTION_HOURS
  return auctionHours(hours)
}

async function eligibleFor(invoiceId: string, sellerId: string) {
  const rate = await frankfurterRate()
  const catalogue = await loadCatalogue()
  const invoice = catalogue.invoices.find((item) => item.id === invoiceId)
  if (!invoice) throw new AuctionFailure("That invoice is not in the catalogue.")
  const buckets = catalogue.buckets.filter((bucket) => bucket.organisationId !== sellerId)
  return {
    rate,
    invoice,
    eligible: listEligibleBuckets({ today: today(), rate, invoice, buckets }),
  }
}

async function ignoredInvestors(supabase: Service, invoiceId: string) {
  const { data, error } = await supabase.from("auction_ignores").select("investor_organisation_id").eq("invoice_id", invoiceId)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row) => row.investor_organisation_id as string))
}

function feeFor(unit: number, signatures = 1) {
  return String(unit * (1 + signatures))
}

function batchFee(unit: number, innerCount: number) {
  return String(unit * (2 + innerCount + 2))
}

export async function setAuctionDuration(organisationId: string, hours: number) {
  try {
    const duration = auctionHours(hours)
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("organisations")
      .update({ auction_duration_hours: duration })
      .eq("id", organisationId)
    if (error) return { error: error.message }
    return { message: `Auctions run for ${duration} hours.` }
  } catch (error) {
    return { error: fail(error, "The auction length could not be saved.") }
  }
}

export async function openRound(organisationId: string, identityId: string, invoiceId: string) {
  try {
    const supabase = createServiceClient()
    const invoice = await supabase
      .from("organisation_invoices")
      .select("id, seller_organisation_id, buyer_organisation_id, repaid, due_date, face_value, currency, document_id, mpt_issuance_id")
      .eq("id", invoiceId)
      .maybeSingle()
    if (invoice.error) return { error: invoice.error.message }
    const row = invoice.data
    if (!row || row.seller_organisation_id !== organisationId) return { error: "That invoice belongs to another seller." }
    if (row.buyer_organisation_id) return { error: "This invoice is already sold." }
    if (row.repaid) return { error: "This invoice is already repaid." }
    if (daysUntilDue(today(), String(row.due_date ?? "")) === null) return { error: "This invoice has no due date." }

    const existing = await supabase
      .from("auction_rounds")
      .select("id, status, setup_unsigned, setup_signed")
      .eq("invoice_id", invoiceId)
      .in("status", OPEN_ROUND)
      .maybeSingle()
    if (existing.error) return { error: existing.error.message }
    if (existing.data?.status === "setup_pending") {
      const transactions = (existing.data.setup_unsigned as { transactions?: unknown } | null)?.transactions
      if (existing.data.setup_signed) return recordSetup(organisationId, identityId, existing.data.id as string, [])
      return {
        roundId: existing.data.id as string,
        transactions: Array.isArray(transactions) ? transactions : [],
        message: "Sign the auction setup.",
      }
    }
    if (existing.data) return { error: "This invoice already has an auction." }

    const party = await organisationParty(supabase, organisationId, identityId)
    const duration = await sellerDuration(supabase, organisationId)
    const { eligible } = await eligibleFor(invoiceId, organisationId)
    const ignored = await ignoredInvestors(supabase, invoiceId)
    const invited = eligible.filter((bucket) => !ignored.has(bucket.organisationId))
    if (invited.length === 0) return { error: "No eligible bucket can be invited." }
    const outerCount = Math.min(OUTER_POOL_CAP, invited.length)
    const bucketIds = invited.slice(0, outerCount).map((bucket) => bucket.bucketId)

    const prepared = await withClient(async (client) => {
      const account = await readAccount(client, party.account, "seller")
      const unit = await openLedgerFee(client)
      const ledger = await validatedLedger(client)
      const reserve = await reserves(client)
      const reuse = typeof row.mpt_issuance_id === "string" && /^[0-9A-Fa-f]{48}$/.test(row.mpt_issuance_id)
      if (reuse) {
        const outstanding = await issuanceOutstanding(client, String(row.mpt_issuance_id))
        if (outstanding !== 0) throw new AuctionFailure("This invoice's MPT is already outstanding.")
      }
      const needsTrust = account.rlusdLimitCents === null
      const fee = feeFor(unit)
      const setup = buildSetupTransactions({
        seller: party.account,
        signer: party.wallet,
        accountSequence: account.sequence,
        needsTrust,
        outerCount,
        reuseIssuance: reuse,
        fee,
        lastLedger: ledger + 20,
      })
      const extra = (needsTrust ? 1 : 0) + setup.sequences.ticketCount + (reuse ? 0 : 1)
      const feeDrops = Number(fee) * setup.transactions.length
      if (!reserveCovers(account.balanceDrops, account.ownerCount, extra, reserve.base, reserve.increment, feeDrops)) {
        throw new AuctionFailure("The seller multisig does not have the XRP reserve for this auction.")
      }
      return {
        setup,
        reuseIssuanceId: reuse ? String(row.mpt_issuance_id).toUpperCase() : null,
        seller: party.account,
        signer: party.wallet,
      }
    })

    const inserted = await supabase
      .from("auction_rounds")
      .insert({
        invoice_id: invoiceId,
        seller_organisation_id: organisationId,
        status: "setup_pending",
        duration_hours: duration,
        seller_account: prepared.seller,
        setup_unsigned: {
          transactions: prepared.setup.transactions,
          sequences: prepared.setup.sequences,
          bucketIds,
          reuseIssuanceId: prepared.reuseIssuanceId,
          signer: prepared.signer,
        },
      })
      .select("id")
      .single()
    if (inserted.error) return { error: inserted.error.message }
    return {
      roundId: inserted.data.id as string,
      transactions: prepared.setup.transactions,
      message: "Sign the auction setup.",
    }
  } catch (error) {
    return { error: fail(error, "The auction could not be opened.") }
  }
}

export async function recordSetup(organisationId: string, identityId: string, roundId: string, payloads: WalletSignPayload[]) {
  try {
    const supabase = createServiceClient()
    const round = await ownedRound(supabase, organisationId, roundId)
    if (round.status !== "setup_pending") return { error: "This auction is not waiting for setup." }
    const stored = round.setup_unsigned as {
      transactions?: Row[]
      sequences?: { innerTicket: number; outerTickets: number[]; issuanceSequence: number }
      bucketIds?: string[]
      reuseIssuanceId?: string | null
      signer?: string
    }
    const unsigned = stored.transactions ?? []
    const party = await organisationParty(supabase, organisationId, identityId)
    let blobs = Array.isArray(round.setup_signed) ? (round.setup_signed as string[]) : []
    if (blobs.length === 0) {
      if (payloads.length !== unsigned.length) return { error: "Sign every setup transaction." }
      blobs = payloads.map((payload, index) => {
        const expected = unsigned[index]
        const verified = verifyWalletSignature(payload, {
          account: party.account,
          signer: party.wallet,
          unsigned: expected,
          lastLedger: Number(expected.LastLedgerSequence),
        })
        return typeof payload.tx_blob === "string" && payload.tx_blob ? payload.tx_blob : encode(verified.transaction as never)
      })
      const saved = await supabase
        .from("auction_rounds")
        .update({ setup_signed: blobs, updated_at: stamp() })
        .eq("id", roundId)
        .eq("status", "setup_pending")
        .is("setup_signed", null)
        .select("id")
      if (saved.error) return { error: saved.error.message }
      if (!saved.data?.length) return recordSetup(organisationId, identityId, roundId, [])
    }

    const results = await withClient(async (client) => {
      const submitted = []
      for (const blob of blobs) submitted.push(await submitIdentical(client, blob))
      return submitted
    })
    if (results.some((result) => result.kind === "unknown" || result.kind === "pending")) {
      return { message: "Setup is signed. Waiting for the ledger.", pending: true }
    }
    const failed = results.find((result) => result.kind === "failed")
    if (failed && failed.kind === "failed") {
      await supabase
        .from("auction_rounds")
        .update({ status: "failed", failure_reason: failed.reason, updated_at: stamp() })
        .eq("id", roundId)
        .eq("status", "setup_pending")
      return { error: failed.reason }
    }

    const validatedResults = results.flatMap((result) => (result.kind === "validated" ? [result] : []))
    if (validatedResults.length !== results.length) return { message: "Setup is signed. Waiting for the ledger.", pending: true }
    const validated = await withClient(async (client) => {
      const txs = []
      for (const result of validatedResults) {
        const waited = result.tx ?? (await waitForValidation(client, result.hash))
        if (!waited || transactionResult(waited) !== "tesSUCCESS") {
          throw new AuctionFailure("Setup is signed. Waiting for the ledger.")
        }
        txs.push(waited)
      }
      return txs
    })

    const ticketTx = validated.find((tx) => (tx.tx_json as { TransactionType?: string } | undefined)?.TransactionType === "TicketCreate")
    const createTx = validated.find(
      (tx) => (tx.tx_json as { TransactionType?: string } | undefined)?.TransactionType === "MPTokenIssuanceCreate",
    )
    const ticketJson = ticketTx?.tx_json as { Sequence?: number; TicketCount?: number } | undefined
    if (!ticketJson || typeof ticketJson.Sequence !== "number" || typeof ticketJson.TicketCount !== "number") {
      return { error: "The ticket create did not validate." }
    }
    const innerTicket = ticketJson.Sequence + 1
    const outerTickets = Array.from({ length: ticketJson.TicketCount - 1 }, (_, index) => innerTicket + 1 + index)
    let issuanceId = stored.reuseIssuanceId ? stored.reuseIssuanceId.toUpperCase() : null
    if (!issuanceId) {
      if (!createTx) return { error: "The MPT create did not validate." }
      issuanceId = issuanceFromValidated(createTx, party.account)
      const createJson = createTx.tx_json as { Sequence?: number }
      if (!issuanceId && typeof createJson.Sequence === "number") issuanceId = mptIssuanceId(createJson.Sequence, party.account)
      if (!issuanceId) return { error: "The MPT issuance id was not in the validated create." }
      if (typeof createJson.Sequence === "number" && createJson.Sequence === innerTicket) {
        return { error: "The MPT create used the shared inner ticket." }
      }
    }

    const deadline = new Date(Date.now() + asNumber(round.duration_hours) * 60 * 60 * 1000).toISOString()
    const recorded = await supabase
      .from("auction_rounds")
      .update({
        deadline,
        shared_inner_ticket: innerTicket,
        issuance_id: issuanceId,
        seller_account: party.account,
        updated_at: stamp(),
      })
      .eq("id", roundId)
      .eq("status", "setup_pending")
      .select("id")
    if (recorded.error) return { error: recorded.error.message }
    if (!recorded.data?.length) return { message: "The auction is open." }

    await supabase.from("organisation_invoices").update({ mpt_issuance_id: issuanceId }).eq("id", round.invoice_id).is("mpt_issuance_id", null)
    const existingTickets = await supabase.from("auction_tickets").select("id").eq("round_id", roundId).limit(1)
    if (existingTickets.error) return { error: existingTickets.error.message }
    if (!existingTickets.data?.length) {
      const tickets = [
        { seller_account: party.account, ticket_sequence: innerTicket, kind: "inner", round_id: roundId, state: "available" },
        ...outerTickets.map((sequence) => ({
          seller_account: party.account,
          ticket_sequence: sequence,
          kind: "outer",
          round_id: roundId,
          state: "available",
        })),
      ]
      const ticketInsert = await supabase.from("auction_tickets").insert(tickets)
      if (ticketInsert.error) return { error: ticketInsert.error.message }
    }

    const { eligible, invoice } = await eligibleFor(String(round.invoice_id), organisationId)
    const ignored = await ignoredInvestors(supabase, String(round.invoice_id))
    const wanted = new Set(stored.bucketIds ?? [])
    const invitations = eligible.filter(
      (bucket) => wanted.has(bucket.bucketId) && !ignored.has(bucket.organisationId),
    )
    if (invitations.length === 0) {
      await supabase
        .from("auction_rounds")
        .update({ status: "failed", failure_reason: "No eligible bucket remained.", updated_at: stamp() })
        .eq("id", roundId)
      return { error: "No eligible bucket remained." }
    }
    const invitationRows = invitations.map((bucket) => ({
      round_id: roundId,
      invoice_id: round.invoice_id,
      investor_organisation_id: bucket.organisationId,
      bucket_id: bucket.bucketId,
      state: "invited",
    }))
    const created = await supabase.from("auction_invitations").insert(invitationRows).select("id, investor_organisation_id, bucket_id")
    if (created.error && created.error.code !== "23505") return { error: created.error.message }
    const notices = (created.data ?? []).map((invitation) => {
      const bucket = invitations.find((item) => item.bucketId === invitation.bucket_id)
      return {
        organisation_id: invitation.investor_organisation_id,
        invoice_id: round.invoice_id,
        round_id: roundId,
        invitation_id: invitation.id,
        body: `${invoice.documentId} matches ${bucket?.label ?? "a bucket"}.`,
      }
    })
    if (notices.length > 0) {
      const noticeInsert = await supabase.from("auction_notices").insert(notices)
      if (noticeInsert.error) return { error: noticeInsert.error.message }
    }
    const opened = await supabase
      .from("auction_rounds")
      .update({ status: "open", updated_at: stamp() })
      .eq("id", roundId)
      .eq("status", "setup_pending")
    if (opened.error) return { error: opened.error.message }
    return { message: `Auction open. ${invitations.length} invitations sent.` }
  } catch (error) {
    return { error: fail(error, "The auction setup could not be recorded.") }
  }
}

async function ownedRound(supabase: Service, organisationId: string, roundId: string) {
  const { data, error } = await supabase.from("auction_rounds").select("*").eq("id", roundId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.seller_organisation_id !== organisationId) throw new AuctionFailure("That auction belongs to another seller.")
  return data
}

export async function prepareBid(organisationId: string, identityId: string, invitationId: string) {
  try {
    const supabase = createServiceClient()
    const invitation = await investorInvitation(supabase, organisationId, invitationId)
    if (invitation.state !== "invited") return { error: "This invitation is closed." }
    const round = invitation.round as Row
    if (round.status !== "open") return { error: "This auction is not open." }
    if (new Date(String(round.deadline)).getTime() <= Date.now()) return { error: "This auction has ended." }
    const existingOffer = await supabase
      .from("invoice_offers")
      .select("id")
      .eq("invitation_id", invitationId)
      .eq("status", "signed")
      .maybeSingle()
    if (existingOffer.error) return { error: existingOffer.error.message }
    if (existingOffer.data) return { error: "This bid is already signed." }

    const held = await supabase
      .from("auction_tickets")
      .select("id, ticket_sequence, prepared, held_at")
      .eq("round_id", round.id as string)
      .eq("kind", "outer")
      .eq("state", "held")
    if (held.error) return { error: held.error.message }
    const mine = (held.data ?? []).find((ticket) => {
      const prepared = ticket.prepared as { invitationId?: string } | null
      return prepared?.invitationId === invitationId
    })
    if (mine?.prepared) {
      return { ticketId: mine.id as string, ...(mine.prepared as object) }
    }

    const party = await organisationParty(supabase, organisationId, identityId)
    const bucket = await supabase.from("organisation_buckets").select("apr, name").eq("id", invitation.bucket_id).maybeSingle()
    if (bucket.error) return { error: bucket.error.message }
    const invoice = await supabase
      .from("organisation_invoices")
      .select("face_value, currency, due_date")
      .eq("id", invitation.invoice_id)
      .maybeSingle()
    if (invoice.error) return { error: invoice.error.message }
    const days = daysUntilDue(today(), String(invoice.data?.due_date ?? ""))
    if (days === null || days < 0) return { error: "This invoice can no longer be priced." }
    const currency = String(invoice.data?.currency ?? "")
    const rate = currency.trim().toUpperCase() === "BRL" ? await frankfurterRate() : 1
    const quote = quoteInvoice({
      face: asNumber(invoice.data?.face_value),
      apr: asNumber(bucket.data?.apr),
      days,
      rate,
      currency,
    })
    const quotedAt = stamp()

    let ticketId = mine?.id as string | undefined
    let ticketSequence = mine ? asNumber(mine.ticket_sequence) : 0
    if (!ticketId) {
      const hold = await supabase.rpc("hold_outer_auction_ticket", { p_round_id: round.id })
      if (hold.error) return { error: hold.error.message }
      ticketId = String(hold.data)
      const ticket = await supabase.from("auction_tickets").select("ticket_sequence").eq("id", ticketId).maybeSingle()
      if (ticket.error) return { error: ticket.error.message }
      ticketSequence = asNumber(ticket.data?.ticket_sequence)
    }

    const built = await withClient(async (client) => {
      const sellerAccount = String(round.seller_account)
      const seller = await readAccount(client, sellerAccount, "seller")
      const investor = await readAccount(client, party.account, "investor")
      if (investor.rlusdCents < quote.rlusdCents) throw new AuctionFailure("The wallet does not have enough RLUSD for this bid.")
      const issuanceId = String(round.issuance_id)
      const authorized = await holderHasMpt(client, party.account, issuanceId)
      const unit = await openLedgerFee(client)
      const ledger = await validatedLedger(client)
      const deadlineLedger = ledgerForDeadline(ledger, Date.now(), new Date(String(round.deadline)).getTime())
      const authorize = authorized
        ? null
        : buildHolderAuthorize({
            investor: party.account,
            signer: party.wallet,
            issuanceId,
            sequence: investor.sequence,
            fee: feeFor(unit),
            lastLedger: ledger + 20,
          })
      const investorSequence = investor.sequence + (authorize ? 1 : 0)
      const sellerPreauth = seller.depositAuth && !seller.preauthorized.has(party.account)
      const investorPreauth = investor.depositAuth && !investor.preauthorized.has(sellerAccount)
      const rawCount = 3 + (sellerPreauth ? 1 : 0) + (investorPreauth ? 1 : 0)
      const bid = buildBidBatch({
        seller: sellerAccount,
        investor: party.account,
        issuanceId,
        rlusd: quote.rlusd,
        outerTicket: ticketSequence,
        innerTicket: asNumber(round.shared_inner_ticket),
        sellerSequence: seller.sequence,
        investorSequence,
        sellerPreauth,
        investorPreauth,
        lastLedger: deadlineLedger,
        fee: batchFee(unit, rawCount),
      })
      const reserve = await reserves(client)
      if (!reserveCovers(investor.balanceDrops, investor.ownerCount, authorize ? 2 : 1, reserve.base, reserve.increment, 0)) {
        throw new AuctionFailure("The investor multisig does not have the XRP reserve for this bid.")
      }
      return { authorize, bid, deadlineLedger }
    })

    const prepared = {
      invitationId,
      investorId: organisationId,
      signer: party.wallet,
      account: party.account,
      quote: {
        ...quote,
        apr: asNumber(bucket.data?.apr),
        rate,
        source: currency.trim().toUpperCase() === "BRL" ? FX_SOURCE : "par",
        quotedAt,
        days,
        currency,
        bucketName: String(bucket.data?.name ?? "Bucket"),
      },
      batch: built.bid.tx,
      txIDs: built.bid.txIDs,
      flags: Number(built.bid.tx.Flags),
      outerSequence: ticketSequence,
      investorSequence: built.bid.investorSequence,
      authorize: built.authorize,
      lastLedger: built.deadlineLedger,
    }
    const saved = await supabase
      .from("auction_tickets")
      .update({ prepared, held_at: stamp() })
      .eq("id", ticketId)
      .eq("state", "held")
      .select("id")
    if (saved.error) return { error: saved.error.message }
    return { ticketId, ...prepared }
  } catch (error) {
    return { error: fail(error, "The bid could not be prepared.") }
  }
}

export async function releaseBid(organisationId: string, ticketId: string) {
  try {
    const supabase = createServiceClient()
    const ticket = await supabase.from("auction_tickets").select("id, prepared, state").eq("id", ticketId).maybeSingle()
    if (ticket.error) return { error: ticket.error.message }
    const prepared = ticket.data?.prepared as { investorId?: string } | null
    if (!ticket.data || prepared?.investorId !== organisationId || ticket.data.state !== "held") {
      return { error: "That ticket hold was not found." }
    }
    const { error } = await supabase.rpc("release_held_auction_ticket", { p_ticket_id: ticketId })
    if (error) return { error: error.message }
    return { message: "The ticket hold was released." }
  } catch (error) {
    return { error: fail(error, "The ticket hold could not be released.") }
  }
}

export async function storeSignedBid(
  organisationId: string,
  identityId: string,
  ticketId: string,
  bidPayload: WalletSignPayload,
  authorizePayload: WalletSignPayload | null,
) {
  try {
    const supabase = createServiceClient()
    const party = await organisationParty(supabase, organisationId, identityId)
    const ticket = await supabase.from("auction_tickets").select("*").eq("id", ticketId).maybeSingle()
    if (ticket.error) return { error: ticket.error.message }
    const prepared = ticket.data?.prepared as {
      invitationId: string
      investorId: string
      signer: string
      account: string
      quote: {
        apr: number
        discount: number
        proceeds: number
        rlusd: number
        rate: number
        source: string
        quotedAt: string
        days: number
        currency: string
      }
      batch: Row
      txIDs: string[]
      flags: number
      outerSequence: number
      investorSequence: number
      authorize: Row | null
      lastLedger: number
    } | null
    if (!ticket.data || ticket.data.state !== "held" || !prepared || prepared.investorId !== organisationId) {
      return { error: "Prepare the bid again." }
    }
    const authorization = verifyBatchAuthorization(bidPayload, {
      outerAccount: String(await roundAccount(supabase, String(ticket.data.round_id))),
      outerSequence: prepared.outerSequence,
      flags: prepared.flags,
      txIDs: prepared.txIDs,
      batchAccount: prepared.account,
      signer: party.wallet,
    })
    if (prepared.authorize) {
      if (!authorizePayload) return { error: "Sign the MPT authorization before the bid." }
      const verified = verifyWalletSignature(authorizePayload, {
        account: prepared.account,
        signer: party.wallet,
        unsigned: prepared.authorize,
        lastLedger: Number(prepared.authorize.LastLedgerSequence),
      })
      const blob =
        typeof authorizePayload.tx_blob === "string" && authorizePayload.tx_blob
          ? authorizePayload.tx_blob
          : encode(verified.transaction as never)
      const submitted = await withClient(async (client) => {
        const result = await submitIdentical(client, blob)
        if (result.kind === "failed") throw new AuctionFailure(result.reason)
        if (result.kind === "unknown") return null
        return (await waitForValidation(client, result.hash)) ?? null
      })
      if (!submitted || transactionResult(submitted) !== "tesSUCCESS") {
        return { message: "The MPT authorization is waiting for a ledger.", pending: true }
      }
    }

    const hash = payloadHash(prepared.batch)
    const inserted = await supabase
      .from("invoice_offers")
      .insert({
        round_id: ticket.data.round_id,
        invitation_id: prepared.invitationId,
        invoice_id: (await invitationInvoice(supabase, prepared.invitationId)),
        investor_organisation_id: organisationId,
        bucket_id: (await invitationBucket(supabase, prepared.invitationId)),
        apr: prepared.quote.apr,
        brl_discount: prepared.quote.discount,
        brl_proceeds: prepared.quote.proceeds,
        rlusd_amount: prepared.quote.rlusd,
        fx_rate: prepared.quote.rate,
        fx_source: prepared.quote.source,
        fx_quoted_at: prepared.quote.quotedAt,
        outer_ticket_id: ticketId,
        payload_hash: hash,
        signed_authorization: authorization,
        unsigned_tx: prepared.batch,
        investor_sequence: prepared.investorSequence,
        status: "signed",
        signed_at: prepared.quote.quotedAt,
      })
      .select("id")
      .single()
    if (inserted.error) return { error: inserted.error.message }
    await supabase
      .from("auction_tickets")
      .update({ state: "attached", offer_id: inserted.data.id, prepared: null })
      .eq("id", ticketId)
      .eq("state", "held")
    return { message: "Bid signed.", offerId: inserted.data.id as string }
  } catch (error) {
    return { error: fail(error, "The bid could not be stored.") }
  }
}

async function roundAccount(supabase: Service, roundId: string) {
  const { data, error } = await supabase.from("auction_rounds").select("seller_account").eq("id", roundId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.seller_account
}

async function invitationInvoice(supabase: Service, invitationId: string) {
  const { data, error } = await supabase.from("auction_invitations").select("invoice_id").eq("id", invitationId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.invoice_id
}

async function invitationBucket(supabase: Service, invitationId: string) {
  const { data, error } = await supabase.from("auction_invitations").select("bucket_id").eq("id", invitationId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.bucket_id
}

async function investorInvitation(supabase: Service, organisationId: string, invitationId: string) {
  const { data, error } = await supabase
    .from("auction_invitations")
    .select("*, round:auction_rounds(*)")
    .eq("id", invitationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.investor_organisation_id !== organisationId) throw new AuctionFailure("That invitation belongs to another investor.")
  const ignored = await supabase
    .from("auction_ignores")
    .select("invoice_id")
    .eq("investor_organisation_id", organisationId)
    .eq("invoice_id", data.invoice_id)
    .maybeSingle()
  if (ignored.error) throw new Error(ignored.error.message)
  if (ignored.data) throw new AuctionFailure("This invoice is ignored.")
  return data
}

export async function declineInvitation(organisationId: string, invitationId: string) {
  try {
    const supabase = createServiceClient()
    const invitation = await investorInvitation(supabase, organisationId, invitationId)
    const { error } = await supabase
      .from("auction_invitations")
      .update({ state: "declined", updated_at: stamp() })
      .eq("id", invitation.id)
      .eq("state", "invited")
    if (error) return { error: error.message }
    return { message: "Invitation declined." }
  } catch (error) {
    return { error: fail(error, "The invitation could not be declined.") }
  }
}

export async function ignoreInvoice(organisationId: string, invitationId: string) {
  try {
    const supabase = createServiceClient()
    const invitation = await investorInvitation(supabase, organisationId, invitationId)
    const ignored = await supabase.from("auction_ignores").insert({
      investor_organisation_id: organisationId,
      invoice_id: invitation.invoice_id,
    })
    if (ignored.error && ignored.error.code !== "23505") return { error: ignored.error.message }
    const { error } = await supabase
      .from("auction_invitations")
      .update({ state: "ignored", updated_at: stamp() })
      .eq("id", invitation.id)
    if (error) return { error: error.message }
    return { message: "This invoice is hidden for your organisation." }
  } catch (error) {
    return { error: fail(error, "The invoice could not be ignored.") }
  }
}

export async function preparePull(organisationId: string, identityId: string, offerId: string) {
  try {
    const supabase = createServiceClient()
    const offer = await ownedOffer(supabase, organisationId, offerId)
    if (offer.status !== "signed") return { error: "This bid cannot be cancelled." }
    const round = await supabase.from("auction_rounds").select("status, deadline").eq("id", offer.round_id).maybeSingle()
    if (round.error) return { error: round.error.message }
    if (round.data?.status !== "open") return { error: "The seller has already accepted a bid." }
    if (new Date(String(round.data.deadline)).getTime() <= Date.now()) return { error: "This auction has ended." }
    const party = await organisationParty(supabase, organisationId, identityId)
    const cancel = await withClient(async (client) => {
      const unit = await openLedgerFee(client)
      const ledger = await validatedLedger(client)
      return buildSequenceCancel({
        account: party.account,
        signer: party.wallet,
        sequence: asNumber(offer.investor_sequence),
        fee: feeFor(unit),
        lastLedger: ledger + 20,
      })
    })
    return { offerId, transaction: cancel }
  } catch (error) {
    return { error: fail(error, "The cancellation could not be prepared.") }
  }
}

export async function storePull(organisationId: string, identityId: string, offerId: string, payload: WalletSignPayload) {
  try {
    const supabase = createServiceClient()
    const offer = await ownedOffer(supabase, organisationId, offerId)
    if (offer.status !== "signed") return { error: "This bid cannot be cancelled." }
    const party = await organisationParty(supabase, organisationId, identityId)
    const signed = payload.tx_json && typeof payload.tx_json === "object" ? payload.tx_json : null
    const transaction = (signed ?? (payload.tx_blob ? (decode(payload.tx_blob) as Row) : null)) as Row | null
    if (!transaction || transaction.TransactionType !== "AccountSet") return { error: "Sign a cancellation of the bid sequence." }
    if (Number(transaction.Sequence) !== asNumber(offer.investor_sequence)) {
      return { error: "The cancellation does not use the bid sequence." }
    }
    if (transaction.Account !== party.account) return { error: "The cancellation is for a different account." }
    const verified = verifyWalletSignature(payload, {
      account: party.account,
      signer: party.wallet,
      unsigned: transaction,
      lastLedger: Number(transaction.LastLedgerSequence),
    })
    const blob = typeof payload.tx_blob === "string" && payload.tx_blob ? payload.tx_blob : encode(verified.transaction as never)
    await supabase.from("invoice_offers").update({ cancel_blob: blob }).eq("id", offerId).eq("status", "signed")
    const submitted = await withClient((client) => submitIdentical(client, blob))
    if (submitted.kind === "failed") return { error: submitted.reason }
    if (submitted.kind === "unknown" || submitted.kind === "pending") {
      const validated = submitted.kind === "pending" ? await withClient((client) => waitForValidation(client, submitted.hash)) : null
      if (!validated || transactionResult(validated) !== "tesSUCCESS") {
        return { message: "The cancellation is waiting for a ledger.", pending: true }
      }
    }
    await supabase.from("invoice_offers").update({ status: "pulled" }).eq("id", offerId).eq("status", "signed")
    await supabase
      .from("auction_tickets")
      .update({ state: "released", offer_id: offerId })
      .eq("id", offer.outer_ticket_id)
      .eq("state", "attached")
    return { message: "Bid cancelled. The shared ticket was not spent." }
  } catch (error) {
    return { error: fail(error, "The bid could not be cancelled.") }
  }
}

async function ownedOffer(supabase: Service, organisationId: string, offerId: string) {
  const { data, error } = await supabase.from("invoice_offers").select("*").eq("id", offerId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.investor_organisation_id !== organisationId) throw new AuctionFailure("That bid belongs to another investor.")
  return data
}

async function otherCommittedCents(supabase: Service, investorId: string, offerId: string) {
  const [offers, orders] = await Promise.all([
    supabase.from("invoice_offers").select("id, rlusd_amount").eq("investor_organisation_id", investorId).eq("status", "signed"),
    supabase.from("sale_orders").select("offer_id, offer_rlusd").eq("buyer_organisation_id", investorId).in("status", OPEN_ORDER),
  ])
  if (offers.error) throw new Error(offers.error.message)
  if (orders.error) throw new Error(orders.error.message)
  const counted = new Set<string>([offerId])
  let total = 0
  for (const offer of offers.data ?? []) {
    if (offer.id === offerId) continue
    counted.add(offer.id as string)
    total += Math.round(asNumber(offer.rlusd_amount) * 100)
  }
  for (const order of orders.data ?? []) {
    const id = typeof order.offer_id === "string" ? order.offer_id : ""
    if (id && counted.has(id)) continue
    total += Math.round(asNumber(order.offer_rlusd) * 100)
  }
  return total
}

export async function prepareAccept(organisationId: string, identityId: string, roundId: string) {
  try {
    const supabase = createServiceClient()
    const round = await ownedRound(supabase, organisationId, roundId)
    if (round.status !== "open") return { error: "This auction is not open for acceptance." }
    if (new Date(String(round.deadline)).getTime() <= Date.now()) return { error: "This auction has ended." }
    const offers = await supabase
      .from("invoice_offers")
      .select("id, investor_organisation_id, rlusd_amount, signed_at, unsigned_tx, signed_authorization, payload_hash")
      .eq("round_id", roundId)
      .eq("status", "signed")
    if (offers.error) return { error: offers.error.message }
    const ranked = rankBids(
      (offers.data ?? []).map((offer) => ({
        ...offer,
        id: offer.id as string,
        investorId: offer.investor_organisation_id as string,
        rlusdCents: Math.round(asNumber(offer.rlusd_amount) * 100),
        signedAt: String(offer.signed_at),
      })),
    )
    const party = await organisationParty(supabase, organisationId, identityId)
    const chosen = await withClient(async (client) => {
      const balances = new Map<string, number>()
      for (const offer of ranked) {
        if (!balances.has(offer.investorId)) {
          const investor = await investorAccount(supabase, offer.investorId)
          const facts = await readAccount(client, investor, "investor")
          balances.set(offer.investorId, facts.rlusdCents)
        }
        const committed = await otherCommittedCents(supabase, offer.investorId, offer.id)
        if (
          bidIsFunded({
            bidCents: offer.rlusdCents,
            balanceCents: balances.get(offer.investorId) ?? 0,
            otherSignedCents: committed,
          })
        ) {
          return offer
        }
      }
      return null
    })
    if (!chosen) return { error: "No signed bid has enough RLUSD." }
    const authorization = chosen.signed_authorization as BatchAuthorization
    const batch = attachBatchSigner(chosen.unsigned_tx as Row, authorization)
    const transaction = forSellerSignature(batch, party.wallet)
    if (!innerPaymentKinds(transaction).mpt || !innerPaymentKinds(transaction).rlusd) {
      return { error: "The bid is missing one of the two payments." }
    }
    return { offerId: chosen.id, transaction, payloadHash: chosen.payload_hash as string }
  } catch (error) {
    return { error: fail(error, "The winning bid could not be prepared.") }
  }
}

async function investorAccount(supabase: Service, organisationId: string) {
  const { data, error } = await supabase
    .from("multisigs")
    .select("address, status")
    .eq("organisation_id", organisationId)
    .eq("type", "org")
    .maybeSingle()
  if (error) throw new Error(error.message)
  const address = typeof data?.address === "string" ? data.address : ""
  if (!isValidClassicAddress(address) || (data?.status !== "live" && data?.status !== "paused")) {
    throw new AuctionFailure("The investor multisig is not live.")
  }
  return address
}

export async function storeAcceptance(organisationId: string, identityId: string, roundId: string, offerId: string, payload: WalletSignPayload) {
  try {
    const prepared = await prepareAccept(organisationId, identityId, roundId)
    if ("error" in prepared || !("transaction" in prepared)) return prepared
    if (prepared.offerId !== offerId) return { error: "A different bid is now the best funded bid." }
    const supabase = createServiceClient()
    const party = await organisationParty(supabase, organisationId, identityId)
    const round = await ownedRound(supabase, organisationId, roundId)
    const verified = verifyWalletSignature(payload, {
      account: party.account,
      signer: party.wallet,
      unsigned: prepared.transaction as Row,
      lastLedger: Number((prepared.transaction as Row).LastLedgerSequence),
    })
    const blob = typeof payload.tx_blob === "string" && payload.tx_blob ? payload.tx_blob : encode(verified.transaction as never)
    const offer = await supabase.from("invoice_offers").select("*").eq("id", offerId).maybeSingle()
    if (offer.error) return { error: offer.error.message }
    if (!offer.data) return { error: "That bid was not found." }
    const inserted = await supabase
      .from("sale_orders")
      .insert({
        invoice_id: offer.data.invoice_id,
        seller_organisation_id: organisationId,
        buyer_organisation_id: offer.data.investor_organisation_id,
        buyer_bucket_id: offer.data.bucket_id,
        offer_rlusd: offer.data.rlusd_amount,
        face_rlusd: offer.data.rlusd_amount,
        sold_price: offer.data.brl_proceeds,
        sold_date: today(),
        status: "accepting",
        expires_at: round.deadline,
        signed_blob: blob,
        tx_hash: signedHash(blob),
        last_ledger_sequence: Number((prepared.transaction as Row).LastLedgerSequence),
        inner_hashes: innerHashes(blob),
        mpt_issuance_id: round.issuance_id,
        offer_id: offerId,
        unsigned_tx: prepared.transaction,
      })
      .select("id")
      .single()
    if (inserted.error) return { error: inserted.error.message }
    await supabase.from("auction_rounds").update({ status: "accepting", updated_at: stamp() }).eq("id", roundId).eq("status", "open")
    await reconcileAuctions()
    return { message: "The signed bid was submitted. The invoice stays unsold until both payments validate." }
  } catch (error) {
    return { error: fail(error, "The acceptance could not be stored.") }
  }
}

export async function reconcileAuctions() {
  const supabase = createServiceClient()
  await expireRounds(supabase)
  const { data, error } = await supabase
    .from("sale_orders")
    .select("id, invoice_id, offer_id, buyer_organisation_id, buyer_bucket_id, offer_rlusd, face_rlusd, sold_price, status, signed_blob, tx_hash, last_ledger_sequence, mpt_issuance_id")
    .in("status", ["accepting", "submitted", "unknown"])
    .not("signed_blob", "is", null)
  if (error) throw new Error(error.message)
  for (const order of data ?? []) {
    if (typeof order.signed_blob !== "string") continue
    await reconcileOrder(supabase, order)
  }
}

async function expireRounds(supabase: Service) {
  const { data, error } = await supabase
    .from("auction_rounds")
    .select("id, deadline, status")
    .eq("status", "open")
    .lte("deadline", stamp())
  if (error) throw new Error(error.message)
  for (const round of data ?? []) {
    await supabase.from("invoice_offers").update({ status: "expired" }).eq("round_id", round.id).eq("status", "signed")
    await supabase
      .from("auction_tickets")
      .update({ state: "released" })
      .eq("round_id", round.id)
      .in("state", ["available", "held"])
    await supabase
      .from("auction_rounds")
      .update({ status: "expired", failure_reason: "The auction deadline passed.", updated_at: stamp() })
      .eq("id", round.id)
      .eq("status", "open")
  }
}

async function reconcileOrder(supabase: Service, order: Row) {
  const blob = String(order.signed_blob)
  const result = await withClient((client) => submitIdentical(client, blob))
  if (result.kind === "unknown" || result.kind === "pending") {
    const validated = result.kind === "pending" ? await withClient((client) => readTx(client, result.hash)) : null
    if (!validated?.validated) {
      await supabase.from("sale_orders").update({ status: "unknown", tx_hash: result.hash, updated_at: stamp() }).eq("id", order.id)
      await supabase
        .from("auction_rounds")
        .update({ status: "submitted", updated_at: stamp() })
        .eq("invoice_id", order.invoice_id)
        .in("status", ["accepting", "submitted"])
      return
    }
    if (transactionResult(validated) !== "tesSUCCESS") {
      await failBid(supabase, order, `The batch result was ${transactionResult(validated) ?? "unknown"}.`, true)
      return
    }
    await settleValidated(supabase, order, blob)
    return
  }
  if (result.kind === "failed") {
    await failBid(supabase, order, result.reason, false)
    return
  }
  await settleValidated(supabase, order, blob)
}

async function paymentsValidated(blob: string) {
  const hashes = innerHashes(blob)
  return withClient(async (client) => {
    let mpt = false
    let rlusd = false
    for (const hash of hashes) {
      const inner = await readTx(client, hash)
      const result = inner ? transactionResult(inner) : null
      if (!inner?.validated || result !== "tesSUCCESS") {
        if (inner?.validated && result && result !== "tesSUCCESS") {
          return { ok: false as const, confirmed: true, reason: `An inner transaction result was ${result}.` }
        }
        return { ok: false as const, confirmed: false, reason: "An inner transaction is not in a validated ledger yet." }
      }
      const json = inner.tx_json as { TransactionType?: string; Amount?: Record<string, unknown> } | undefined
      if (json?.TransactionType === "Payment" && json.Amount && "mpt_issuance_id" in json.Amount) mpt = true
      if (json?.TransactionType === "Payment" && json.Amount && "currency" in json.Amount) rlusd = true
    }
    if (!mpt || !rlusd) return { ok: false as const, confirmed: true, reason: "The batch did not validate both payments." }
    return { ok: true as const }
  })
}

async function settleValidated(supabase: Service, order: Row, blob: string) {
  const payments = await paymentsValidated(blob)
  if (!payments.ok) {
    if (payments.confirmed) await failBid(supabase, order, payments.reason, true)
    else await supabase.from("sale_orders").update({ status: "submitted", updated_at: stamp() }).eq("id", order.id)
    return
  }
  const offer = await supabase.from("invoice_offers").select("*").eq("id", order.offer_id).maybeSingle()
  if (offer.error) throw new Error(offer.error.message)
  const invoice = await supabase
    .from("organisation_invoices")
    .select("face_value, currency, buyer_organisation_id")
    .eq("id", order.invoice_id)
    .maybeSingle()
  if (invoice.error) throw new Error(invoice.error.message)
  if (invoice.data?.buyer_organisation_id && invoice.data.buyer_organisation_id !== order.buyer_organisation_id) {
    await failBid(supabase, order, "The invoice was already sold.", true)
    return
  }
  const currency = String(invoice.data?.currency ?? "")
  const rate = asNumber(offer.data?.fx_rate)
  const face = asNumber(invoice.data?.face_value)
  const faceUsd = currency.trim().toUpperCase() === "BRL" ? rlusdCentsFromProceeds(cents(face), rate) / 100 : face
  const bucket = await supabase.from("organisation_buckets").select("exposure_used_usd").eq("id", order.buyer_bucket_id).maybeSingle()
  if (bucket.error) throw new Error(bucket.error.message)
  const sold = await supabase
    .from("organisation_invoices")
    .update({
      buyer_organisation_id: order.buyer_organisation_id,
      buyer_bucket_id: order.buyer_bucket_id,
      sold_price: offer.data?.brl_proceeds ?? order.sold_price,
      sold_date: today(),
      mpt_issuance_id: order.mpt_issuance_id,
    })
    .eq("id", order.invoice_id)
    .is("buyer_organisation_id", null)
    .select("id")
  if (sold.error) throw new Error(sold.error.message)
  if (sold.data?.length) {
    await supabase
      .from("organisation_buckets")
      .update({ exposure_used_usd: Math.round((asNumber(bucket.data?.exposure_used_usd) + faceUsd) * 100) / 100 })
      .eq("id", order.buyer_bucket_id)
  }
  await supabase.from("sale_orders").update({ status: "succeeded", failure_reason: null, updated_at: stamp() }).eq("id", order.id)
  await supabase.from("invoice_offers").update({ status: "won" }).eq("id", order.offer_id).eq("status", "signed")
  await supabase
    .from("invoice_offers")
    .update({ status: "lost" })
    .eq("round_id", offer.data?.round_id)
    .eq("status", "signed")
    .neq("id", order.offer_id)
  const roundId = offer.data?.round_id as string | undefined
  if (roundId) {
    await supabase.from("auction_rounds").update({ status: "settled", updated_at: stamp() }).eq("id", roundId)
    await supabase.from("auction_tickets").update({ state: "spent" }).eq("round_id", roundId).eq("kind", "inner")
    await supabase.from("auction_tickets").update({ state: "spent" }).eq("id", offer.data?.outer_ticket_id)
    await supabase
      .from("auction_tickets")
      .update({ state: "released" })
      .eq("round_id", roundId)
      .eq("kind", "outer")
      .neq("id", offer.data?.outer_ticket_id)
      .in("state", ["available", "held", "attached"])
  }
}

async function failBid(supabase: Service, order: Row, reason: string, spentTicket: boolean) {
  await supabase.rpc("void_sale_order", { p_order_id: order.id, p_status: "failed", p_reason: reason })
  if (order.offer_id) {
    await supabase.from("invoice_offers").update({ status: "failed" }).eq("id", order.offer_id).eq("status", "signed")
    const offer = await supabase.from("invoice_offers").select("round_id, outer_ticket_id").eq("id", order.offer_id).maybeSingle()
    if (offer.data) {
      await supabase
        .from("auction_tickets")
        .update({ state: spentTicket ? "spent" : "released" })
        .eq("id", offer.data.outer_ticket_id)
      const round = await supabase.from("auction_rounds").select("deadline, status").eq("id", offer.data.round_id).maybeSingle()
      const ended = round.data?.deadline && new Date(String(round.data.deadline)).getTime() <= Date.now()
      await supabase
        .from("auction_rounds")
        .update({
          status: ended ? "expired" : "open",
          failure_reason: ended ? "The auction deadline passed." : null,
          updated_at: stamp(),
        })
        .eq("id", offer.data.round_id)
        .in("status", ["accepting", "submitted"])
    }
  }
}

export async function loadSellerAuction(organisationId: string, invoiceId: string) {
  const supabase = createServiceClient()
  const [invoice, roundResult, duration] = await Promise.all([
    supabase
      .from("organisation_invoices")
      .select("id, document_id, seller_organisation_id, buyer_organisation_id, face_value, currency, due_date, sold_price, repaid")
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("auction_rounds")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sellerDuration(supabase, organisationId).catch(() => DEFAULT_AUCTION_HOURS),
  ])
  if (invoice.error) throw new Error(invoice.error.message)
  if (!invoice.data || invoice.data.seller_organisation_id !== organisationId) return null
  if (roundResult.error) throw new Error(roundResult.error.message)
  const round = roundResult.data
  let eligibleCount = 0
  let responseCount = 0
  let best: { rlusd: number; proceeds: number; currency: string } | null = null
  if (round) {
    const [invitations, offers] = await Promise.all([
      supabase.from("auction_invitations").select("id, state").eq("round_id", round.id),
      supabase.from("invoice_offers").select("id, invitation_id, status, rlusd_amount, brl_proceeds, signed_at").eq("round_id", round.id),
    ])
    if (invitations.error) throw new Error(invitations.error.message)
    if (offers.error) throw new Error(offers.error.message)
    eligibleCount = (invitations.data ?? []).length
    const responded = new Set<string>()
    for (const invitation of invitations.data ?? []) {
      if (invitation.state === "declined" || invitation.state === "ignored") responded.add(invitation.id as string)
    }
    for (const offer of offers.data ?? []) responded.add(offer.invitation_id as string)
    responseCount = responded.size
    const signed = rankBids(
      (offers.data ?? [])
        .filter((offer) => offer.status === "signed")
        .map((offer) => ({
          id: offer.id as string,
          rlusdCents: Math.round(asNumber(offer.rlusd_amount) * 100),
          signedAt: String(offer.signed_at),
          rlusd: asNumber(offer.rlusd_amount),
          proceeds: asNumber(offer.brl_proceeds),
        })),
    )
    if (signed[0]) best = { rlusd: signed[0].rlusd, proceeds: signed[0].proceeds, currency: String(invoice.data.currency) }
  }
  return {
    invoice: {
      id: invoice.data.id as string,
      documentId: invoice.data.document_id as string,
      face: asNumber(invoice.data.face_value),
      currency: invoice.data.currency as string,
      due: String(invoice.data.due_date ?? ""),
      sold: Boolean(invoice.data.buyer_organisation_id),
      soldPrice: invoice.data.sold_price === null ? null : asNumber(invoice.data.sold_price),
      repaid: Boolean(invoice.data.repaid),
    },
    duration,
    round: round
      ? {
          id: round.id as string,
          status: round.status as string,
          deadline: (round.deadline as string | null) ?? null,
          failure: (round.failure_reason as string | null) ?? null,
          needsSignature: round.status === "setup_pending" && !round.setup_signed,
        }
      : null,
    eligibleCount,
    responseCount,
    best,
  }
}

export async function loadInvestorInvitations(organisationId: string) {
  const supabase = createServiceClient()
  const [invitations, ignores, offers, notices] = await Promise.all([
    supabase
      .from("auction_invitations")
      .select("id, invoice_id, bucket_id, state, round_id, created_at")
      .eq("investor_organisation_id", organisationId)
      .order("created_at", { ascending: false }),
    supabase.from("auction_ignores").select("invoice_id").eq("investor_organisation_id", organisationId),
    supabase
      .from("invoice_offers")
      .select("id, invitation_id, status, rlusd_amount, signed_at")
      .eq("investor_organisation_id", organisationId),
    supabase
      .from("auction_notices")
      .select("id, body, created_at")
      .eq("organisation_id", organisationId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ])
  if (invitations.error) throw new Error(invitations.error.message)
  if (ignores.error) throw new Error(ignores.error.message)
  if (offers.error) throw new Error(offers.error.message)
  if (notices.error) throw new Error(notices.error.message)
  const noticeIds = (notices.data ?? []).map((row) => row.id as string)
  if (noticeIds.length > 0) {
    await supabase.from("auction_notices").update({ read_at: stamp() }).in("id", noticeIds)
  }
  const hidden = new Set((ignores.data ?? []).map((row) => row.invoice_id as string))
  const visible = (invitations.data ?? []).filter((row) => row.state !== "ignored" && !hidden.has(row.invoice_id as string))
  const invoiceIds = [...new Set(visible.map((row) => row.invoice_id as string))]
  const bucketIds = [...new Set(visible.map((row) => row.bucket_id as string))]
  const roundIds = [...new Set(visible.map((row) => row.round_id as string))]
  const [invoices, buckets, rounds] = await Promise.all([
    invoiceIds.length
      ? supabase.from("organisation_invoices").select("id, document_id, face_value, currency, due_date").in("id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    bucketIds.length
      ? supabase.from("organisation_buckets").select("id, name, apr").in("id", bucketIds)
      : Promise.resolve({ data: [], error: null }),
    roundIds.length
      ? supabase.from("auction_rounds").select("id, status, deadline").in("id", roundIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (invoices.error) throw new Error(invoices.error.message)
  if (buckets.error) throw new Error(buckets.error.message)
  if (rounds.error) throw new Error(rounds.error.message)
  const invoiceById = new Map((invoices.data ?? []).map((row) => [row.id as string, row]))
  const bucketById = new Map((buckets.data ?? []).map((row) => [row.id as string, row]))
  const roundById = new Map((rounds.data ?? []).map((row) => [row.id as string, row]))
  const offerByInvitation = new Map((offers.data ?? []).map((row) => [row.invitation_id as string, row]))
  return {
    notices: (notices.data ?? []).map((row) => ({ id: row.id as string, body: row.body as string })),
    rows: visible.map((row) => {
      const invoice = invoiceById.get(row.invoice_id as string)
      const bucket = bucketById.get(row.bucket_id as string)
      const round = roundById.get(row.round_id as string)
      const offer = offerByInvitation.get(row.id as string)
      return {
        id: row.id as string,
        state: row.state as string,
        bucket: String(bucket?.name ?? "Bucket"),
        apr: asNumber(bucket?.apr),
        documentId: String(invoice?.document_id ?? "Invoice"),
        face: asNumber(invoice?.face_value),
        currency: String(invoice?.currency ?? ""),
        due: String(invoice?.due_date ?? ""),
        roundStatus: String(round?.status ?? ""),
        deadline: (round?.deadline as string | null) ?? null,
        offerId: (offer?.id as string | undefined) ?? null,
        offerStatus: (offer?.status as string | undefined) ?? null,
        rlusd: offer ? asNumber(offer.rlusd_amount) : null,
      }
    }),
  }
}

export async function loadInvestorBid(organisationId: string, invitationId: string) {
  const list = await loadInvestorInvitations(organisationId)
  const row = list.rows.find((item) => item.id === invitationId)
  if (!row) return null
  if (row.roundStatus !== "open" || row.offerStatus === "signed") {
    return { row, quote: null as null | { discount: number; proceeds: number; rlusd: number; rlusdText: string; days: number } }
  }
  const days = daysUntilDue(today(), row.due.slice(0, 10))
  if (days === null || days < 0) return { row, quote: null }
  const currency = row.currency
  const rate = currency.trim().toUpperCase() === "BRL" ? await frankfurterRate() : 1
  const quote = quoteInvoice({ face: row.face, apr: row.apr, days, rate, currency })
  return { row, quote: { discount: quote.discount, proceeds: quote.proceeds, rlusd: quote.rlusd, rlusdText: quote.rlusdText, days } }
}

export async function sellerRounds(organisationId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("auction_rounds")
    .select("invoice_id, status, created_at")
    .eq("seller_organisation_id", organisationId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  const byInvoice = new Map<string, string>()
  for (const row of data ?? []) {
    const id = row.invoice_id as string
    if (!byInvoice.has(id)) byInvoice.set(id, row.status as string)
  }
  return byInvoice
}
