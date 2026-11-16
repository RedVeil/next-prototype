"use server"

import { revalidatePath } from "next/cache"
import {
  declineInvitation,
  ignoreInvoice,
  openRound,
  prepareAccept,
  prepareBid,
  preparePull,
  recordSetup,
  releaseBid,
  setAuctionDuration,
  storeAcceptance,
  storePull,
  storeSignedBid,
} from "@/auction/domain"
import type { WalletSignPayload } from "@/auction/verify"
import { portalSession } from "./session"

function refresh() {
  revalidatePath("/seller")
  revalidatePath("/investor")
  revalidatePath("/investor/market")
}

async function seller() {
  const session = await portalSession("seller")
  if (!session?.organisationId) return { error: "Sign in as a seller." }
  return { organisationId: session.organisationId, identityId: session.id }
}

async function investor() {
  const session = await portalSession("investor")
  if (!session?.organisationId) return { error: "Sign in as an investor." }
  return { organisationId: session.organisationId, identityId: session.id }
}

function signedIn(value: { error: string } | { organisationId: string; identityId: string }): value is {
  organisationId: string
  identityId: string
} {
  return "organisationId" in value
}

export async function saveAuctionDuration(_state: { error?: string; message?: string } | null, formData: FormData) {
  const current = await seller()
  if (!signedIn(current)) return current
  const hours = Number(formData.get("hours"))
  const result = await setAuctionDuration(current.organisationId, hours)
  if (!("error" in result)) refresh()
  return result
}

export async function startAuction(invoiceId: string) {
  const current = await seller()
  if (!signedIn(current)) return current
  const result = await openRound(current.organisationId, current.identityId, invoiceId)
  if (!("error" in result)) refresh()
  return result
}

export async function submitSetup(roundId: string, payloads: WalletSignPayload[]) {
  const current = await seller()
  if (!signedIn(current)) return current
  const result = await recordSetup(current.organisationId, current.identityId, roundId, payloads)
  if (!("error" in result)) refresh()
  return result
}

export async function startAccept(roundId: string) {
  const current = await seller()
  if (!signedIn(current)) return current
  return prepareAccept(current.organisationId, current.identityId, roundId)
}

export async function submitAccept(roundId: string, offerId: string, payload: WalletSignPayload) {
  const current = await seller()
  if (!signedIn(current)) return current
  const result = await storeAcceptance(current.organisationId, current.identityId, roundId, offerId, payload)
  if (!("error" in result)) refresh()
  return result
}

export async function startBid(invitationId: string) {
  const current = await investor()
  if (!signedIn(current)) return current
  return prepareBid(current.organisationId, current.identityId, invitationId)
}

export async function cancelHold(ticketId: string) {
  const current = await investor()
  if (!signedIn(current)) return current
  return releaseBid(current.organisationId, ticketId)
}

export async function submitBid(ticketId: string, bid: WalletSignPayload, authorize: WalletSignPayload | null) {
  const current = await investor()
  if (!signedIn(current)) return current
  const result = await storeSignedBid(current.organisationId, current.identityId, ticketId, bid, authorize)
  if (!("error" in result)) refresh()
  return result
}

export async function declineInvite(invitationId: string) {
  const current = await investor()
  if (!signedIn(current)) return current
  const result = await declineInvitation(current.organisationId, invitationId)
  if (!("error" in result)) refresh()
  return result
}

export async function ignoreInvite(invitationId: string) {
  const current = await investor()
  if (!signedIn(current)) return current
  const result = await ignoreInvoice(current.organisationId, invitationId)
  if (!("error" in result)) refresh()
  return result
}

export async function startPull(offerId: string) {
  const current = await investor()
  if (!signedIn(current)) return current
  return preparePull(current.organisationId, current.identityId, offerId)
}

export async function submitCancellation(offerId: string, payload: WalletSignPayload) {
  const current = await investor()
  if (!signedIn(current)) return current
  const result = await storePull(current.organisationId, current.identityId, offerId, payload)
  if (!("error" in result)) refresh()
  return result
}
