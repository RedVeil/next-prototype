"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { invoiceScore, organisationScore } from "./score"

export type ActionState = { error?: string; message?: string } | null

const PARAMETER_KEYS = [
  "obligor_score",
  "seller_score",
  "repaid_seller_points",
  "repaid_obligor_points",
  "score_floor",
] as const

function weightValue(formData: FormData, key: string) {
  const raw = formData.get(key)
  const value = typeof raw === "string" ? Number(raw) : Number.NaN
  return value
}

export async function updateRiskScores(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const weights = new Map<string, number>()
  for (const key of PARAMETER_KEYS) {
    const raw = formData.get(key)
    if (raw === null && key === "score_floor") {
      weights.set(key, 0)
      continue
    }
    const value = weightValue(formData, key)
    if (!Number.isFinite(value) || value < 0) {
      return { error: "Each weight must be zero or greater." }
    }
    if ((key === "repaid_seller_points" || key === "repaid_obligor_points") && value > 100) {
      return { error: "A repayment step cannot be more than 100 percent." }
    }
    if (key === "score_floor" && value > 10000) {
      return { error: "The floor cannot be higher than 10000." }
    }
    weights.set(key, value)
  }

  const sellerWeight = weights.get("seller_score") ?? 0
  const obligorWeight = weights.get("obligor_score") ?? 0
  if (sellerWeight + obligorWeight === 0) {
    return { error: "The seller and obligor weights cannot both be zero." }
  }

  const supabase = createServiceClient()
  for (const key of PARAMETER_KEYS) {
    if (key === "score_floor" && formData.get(key) === null) continue
    const { error } = await supabase
      .from("risk_parameters")
      .update({ weight: weights.get(key) })
      .eq("key", key)
    if (error) return { error: error.message }
  }

  revalidatePath("/sandbox")
  return { message: "Saved the scoring weights." }
}

type ServiceClient = ReturnType<typeof createServiceClient>

async function applyRiskScores(supabase: ServiceClient, weights: Map<string, number>): Promise<ActionState> {
  const sellerWeight = weights.get("seller_score") ?? 0
  const obligorWeight = weights.get("obligor_score") ?? 0
  if (sellerWeight + obligorWeight === 0) {
    return { error: "The seller and obligor weights cannot both be zero." }
  }

  const { data: organisations, error: organisationError } = await supabase
    .from("organisations")
    .select("id, risk_score_base")
  if (organisationError) return { error: organisationError.message }

  const { data: invoices, error: invoiceError } = await supabase
    .from("organisation_invoices")
    .select("id, seller_organisation_id, obligor_organisation_id, repaid")
  if (invoiceError) return { error: invoiceError.message }

  const repaidAsSeller = new Map<string, number>()
  const repaidAsObligor = new Map<string, number>()
  for (const invoice of invoices ?? []) {
    if (!invoice.repaid) continue
    const sellerId = invoice.seller_organisation_id as string
    const obligorId = invoice.obligor_organisation_id as string
    repaidAsSeller.set(sellerId, (repaidAsSeller.get(sellerId) ?? 0) + 1)
    repaidAsObligor.set(obligorId, (repaidAsObligor.get(obligorId) ?? 0) + 1)
  }

  const sellerStep = weights.get("repaid_seller_points") ?? 0
  const obligorStep = weights.get("repaid_obligor_points") ?? 0
  const floor = weights.get("score_floor") ?? 0
  const scores = new Map<string, number>()
  for (const organisation of organisations ?? []) {
    const id = organisation.id as string
    const score = organisationScore(
      Number(organisation.risk_score_base),
      repaidAsSeller.get(id) ?? 0,
      repaidAsObligor.get(id) ?? 0,
      sellerStep,
      obligorStep,
      floor,
    )
    scores.set(id, score)
    const { error } = await supabase.from("organisations").update({ risk_score: score }).eq("id", id)
    if (error) return { error: error.message }
  }

  for (const invoice of invoices ?? []) {
    const seller = scores.get(invoice.seller_organisation_id as string)
    const obligor = scores.get(invoice.obligor_organisation_id as string)
    if (seller === undefined || obligor === undefined) {
      return { error: "An invoice points at an organisation that is missing." }
    }
    const score = invoiceScore(seller, obligor, sellerWeight, obligorWeight)
    if (score === null) return { error: "The seller and obligor weights cannot both be zero." }
    const { error } = await supabase
      .from("organisation_invoices")
      .update({ risk_score: score })
      .eq("id", invoice.id)
    if (error) return { error: error.message }
  }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Scored ${(organisations ?? []).length} organisations and ${(invoices ?? []).length} invoices.` }
}

export async function scoreRisk(_state: ActionState, _formData: FormData): Promise<ActionState> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("risk_parameters").select("key, weight")
  if (error) return { error: error.message }
  const weights = new Map<string, number>()
  for (const key of PARAMETER_KEYS) {
    const row = (data ?? []).find((item) => item.key === key)
    weights.set(key, row ? Number(row.weight) : 0)
  }
  return applyRiskScores(supabase, weights)
}

export async function setManualScore(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const organisationId = formData.get("organisation_id")
  const score = Number(formData.get("risk_score_base"))
  if (typeof organisationId !== "string" || !organisationId) {
    return { error: "Choose an organisation." }
  }
  if (!Number.isInteger(score) || score < 0 || score > 10000) {
    return { error: "A manual score is a whole number from 0 to 10000." }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("organisations")
    .update({ risk_score_base: score, risk_score: score })
    .eq("id", organisationId)
  if (error) return { error: error.message }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: "Saved the baseline." }
}
