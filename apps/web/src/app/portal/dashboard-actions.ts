"use server"

import { revalidatePath } from "next/cache"
import { createBucket, createInvoice, updateBucket, acceptInvoice, type ActionState } from "@/app/sandbox/actions"
import {
  prepareInvestorTransfer,
  recordInvestorDeposit,
  submitInvestorWithdrawal,
  type FundsPreparation,
  type FundsResult,
} from "@/portfolio/funds"
import { createServiceClient } from "@/lib/supabase/service"
import { portalSession } from "./session"

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

async function investorOrganisation() {
  const session = await portalSession("investor")
  if (!session?.organisationId) return { error: "Sign in as an investor." }
  return { organisationId: session.organisationId }
}

async function sellerOrganisation() {
  const session = await portalSession("seller")
  if (!session?.organisationId) return { error: "Sign in as a seller." }
  return { organisationId: session.organisationId }
}

function refreshPortals() {
  revalidatePath("/investor")
  revalidatePath("/investor/market")
  revalidatePath("/seller")
  revalidatePath("/sandbox")
  revalidatePath("/match")
}

function refreshFunds(result: FundsResult) {
  if (result.message || result.recorded) refreshPortals()
  return result
}

export async function prepareFunds(kind: string, amount: number): Promise<FundsPreparation> {
  return prepareInvestorTransfer(kind, amount)
}

export async function recordDeposit(hash: string): Promise<FundsResult> {
  return refreshFunds(await recordInvestorDeposit(hash))
}

export async function submitWithdrawal(blob: string): Promise<FundsResult> {
  return refreshFunds(await submitInvestorWithdrawal(blob))
}

async function ownBucket(organisationId: string, id: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("organisation_buckets")
    .select("id")
    .eq("id", id)
    .eq("organisation_id", organisationId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: "That bucket was not found." }
  return { id }
}

export async function createPortalBucket(_state: ActionState, formData: FormData): Promise<ActionState> {
  const investor = await investorOrganisation()
  if ("error" in investor) return investor
  formData.set("organisation_id", investor.organisationId)
  const result = await createBucket(null, formData)
  if (!result?.error) refreshPortals()
  return result
}

export async function updatePortalBucket(_state: ActionState, formData: FormData): Promise<ActionState> {
  const investor = await investorOrganisation()
  if ("error" in investor) return investor
  const id = text(formData, "id")
  if (!id) return { error: "Choose a bucket to edit." }
  const owned = await ownBucket(investor.organisationId, id)
  if ("error" in owned) return owned
  formData.set("organisation_id", investor.organisationId)
  const result = await updateBucket(null, formData)
  if (!result?.error) refreshPortals()
  return result
}

export async function setPortalBucketStatus(id: string, status: "active" | "paused"): Promise<ActionState> {
  const investor = await investorOrganisation()
  if ("error" in investor) return investor
  const owned = await ownBucket(investor.organisationId, id)
  if ("error" in owned) return owned
  const supabase = createServiceClient()
  const { error } = await supabase.from("organisation_buckets").update({ status }).eq("id", id)
  if (error) return { error: error.message }
  refreshPortals()
  return { message: status === "paused" ? "Bucket paused." : "Bucket active." }
}

export async function deletePortalBucket(id: string): Promise<ActionState> {
  const investor = await investorOrganisation()
  if ("error" in investor) return investor
  const owned = await ownBucket(investor.organisationId, id)
  if ("error" in owned) return owned

  const supabase = createServiceClient()
  const { count, error: countError } = await supabase
    .from("organisation_invoices")
    .select("id", { count: "exact", head: true })
    .eq("buyer_bucket_id", id)
  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) return { error: "This bucket still has invoices." }

  const { error } = await supabase.from("organisation_buckets").delete().eq("id", id)
  if (error) return { error: error.message }
  refreshPortals()
  return { message: "Bucket deleted." }
}

export async function createSellerInvoice(_state: ActionState, formData: FormData): Promise<ActionState> {
  const seller = await sellerOrganisation()
  if ("error" in seller) return seller
  formData.set("seller_organisation_id", seller.organisationId)
  const result = await createInvoice(null, formData)
  if (!result?.error) refreshPortals()
  return result
}

export async function acceptSellerInvoice(_state: ActionState, formData: FormData): Promise<ActionState> {
  const seller = await sellerOrganisation()
  if ("error" in seller) return seller
  const invoiceId = text(formData, "invoice_id")
  if (!invoiceId) return { error: "Choose an invoice." }

  const supabase = createServiceClient()
  const { data: invoice, error } = await supabase
    .from("organisation_invoices")
    .select("seller_organisation_id, buyer_organisation_id, repaid")
    .eq("id", invoiceId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!invoice || invoice.seller_organisation_id !== seller.organisationId) {
    return { error: "That invoice belongs to another seller." }
  }
  if (invoice.buyer_organisation_id) return { error: "This invoice is already sold." }
  if (invoice.repaid) return { error: "This invoice is already repaid." }

  const result = await acceptInvoice(null, formData)
  if (!result?.error) refreshPortals()
  return result
}
