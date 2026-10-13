"use server"

import { revalidatePath } from "next/cache"
import { loadCatalogue } from "@/app/match/load"
import { runMatch } from "@/app/match/match"
import { frankfurterRate } from "@/app/match/rate"
import { invoiceScore } from "@/app/risk/score"
import { createServiceClient } from "@/lib/supabase/service"
import { repaymentOf, roundMoney, toRlusd } from "./settle"

export type ActionState = { error?: string; message?: string } | null

type ServiceClient = ReturnType<typeof createServiceClient>

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on"
}

async function industryId(name: string) {
  const supabase = createServiceClient()
  const pattern = name.replace(/[%_\\]/g, "\\$&")
  const { data: existing, error: readError } = await supabase
    .from("industries")
    .select("id")
    .ilike("name", pattern)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (existing) return existing.id as string

  const { data: created, error: insertError } = await supabase
    .from("industries")
    .insert({ name })
    .select("id")
    .single()
  if (insertError) {
    const { data: raced, error: racedError } = await supabase
      .from("industries")
      .select("id")
      .ilike("name", pattern)
      .maybeSingle()
    if (racedError || !raced) throw new Error(insertError.message)
    return raced.id as string
  }
  return created.id as string
}

function readOrganisation(formData: FormData) {
  const legalName = text(formData, "legal_name")
  const companyId = text(formData, "company_id")
  const country = text(formData, "country") || "BR"
  const description = text(formData, "description")
  const method = text(formData, "method")
  const identifier = text(formData, "identifier")
  const industryNames = ["industry_1", "industry_2", "industry_3"]
    .map((name) => text(formData, name))
    .filter(Boolean)

  if (!legalName || !companyId) {
    return { error: "Legal name and company id are required." }
  }
  if (new Set(industryNames.map((name) => name.toLowerCase())).size !== industryNames.length) {
    return { error: "Choose each industry once." }
  }
  if ((method && !identifier) || (!method && identifier)) {
    return { error: "A payment method needs both a method and an identifier." }
  }

  return {
    input: {
      legalName,
      companyId,
      country,
      description,
      method,
      identifier,
      industryNames,
      useBrl: checked(formData, "use_brl"),
      useRlusd: checked(formData, "use_rlusd"),
      paymentMethodId: text(formData, "payment_method_id"),
    },
  }
}

async function saveIndustries(supabase: ServiceClient, organisationId: string, industryNames: string[]) {
  const { error: deleteError } = await supabase
    .from("organisation_industries")
    .delete()
    .eq("organisation_id", organisationId)
  if (deleteError) return deleteError.message

  try {
    for (const name of industryNames) {
      const id = await industryId(name)
      const { error: linkError } = await supabase.from("organisation_industries").insert({
        organisation_id: organisationId,
        industry_id: id,
      })
      if (linkError) return linkError.message
    }
  } catch (error) {
    return error instanceof Error ? error.message : "Could not save industries."
  }
  return null
}

async function saveCurrencies(
  supabase: ServiceClient,
  organisationId: string,
  useBrl: boolean,
  useRlusd: boolean,
) {
  const wanted = [
    useBrl ? { currency: "BRL", use: "invoices" } : null,
    useRlusd ? { currency: "RLUSD", use: "funding" } : null,
  ].filter((row) => row !== null)
  const { data: existing, error: readError } = await supabase
    .from("organisation_currencies")
    .select("id, currency, use")
    .eq("organisation_id", organisationId)
  if (readError) return readError.message

  const keep = new Set(wanted.map((row) => `${row.currency}:${row.use}`))
  const removeIds = (existing ?? [])
    .filter((row) => {
      const managed =
        (row.currency === "BRL" && row.use === "invoices") ||
        (row.currency === "RLUSD" && row.use === "funding")
      return managed && !keep.has(`${row.currency}:${row.use}`)
    })
    .map((row) => row.id as string)
  if (removeIds.length > 0) {
    const { error } = await supabase.from("organisation_currencies").delete().in("id", removeIds)
    if (error) return error.message
  }

  const have = new Set((existing ?? []).map((row) => `${row.currency}:${row.use}`))
  const insertRows = wanted.filter((row) => !have.has(`${row.currency}:${row.use}`))
  if (insertRows.length > 0) {
    const { error } = await supabase.from("organisation_currencies").insert(
      insertRows.map((row) => ({ ...row, organisation_id: organisationId })),
    )
    if (error) return error.message
  }
  return null
}

async function savePayment(
  supabase: ServiceClient,
  organisationId: string,
  method: string,
  identifier: string,
  paymentMethodId: string,
) {
  if (method && identifier) {
    if (paymentMethodId) {
      const { error } = await supabase
        .from("payment_methods")
        .update({ method, identifier })
        .eq("id", paymentMethodId)
        .eq("organisation_id", organisationId)
      if (error) return error.message
    } else {
      const { error } = await supabase.from("payment_methods").insert({
        organisation_id: organisationId,
        method,
        identifier,
      })
      if (error) return error.message
    }
  } else if (paymentMethodId) {
    const { error } = await supabase
      .from("payment_methods")
      .delete()
      .eq("id", paymentMethodId)
      .eq("organisation_id", organisationId)
    if (error) return error.message
  }
  return null
}

type OrganisationInput = Extract<ReturnType<typeof readOrganisation>, { input: unknown }>["input"]

async function saveOrganisationExtras(
  supabase: ServiceClient,
  organisationId: string,
  input: OrganisationInput,
) {
  const industryError = await saveIndustries(supabase, organisationId, input.industryNames)
  if (industryError) return industryError
  const currencyError = await saveCurrencies(supabase, organisationId, input.useBrl, input.useRlusd)
  if (currencyError) return currencyError
  return savePayment(supabase, organisationId, input.method, input.identifier, input.paymentMethodId)
}

export async function createOrganisation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const read = readOrganisation(formData)
  if ("error" in read) return read

  const supabase = createServiceClient()
  const { data: organisation, error } = await supabase
    .from("organisations")
    .insert({
      legal_name: read.input.legalName,
      company_id: read.input.companyId,
      country: read.input.country,
      description: read.input.description,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }

  const extraError = await saveOrganisationExtras(supabase, organisation.id as string, read.input)
  if (extraError) return { error: extraError }

  revalidatePath("/sandbox")
  return { message: `Saved ${read.input.legalName}.` }
}

export async function updateOrganisation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id")
  if (!id) return { error: "Choose an organisation to edit." }
  const read = readOrganisation(formData)
  if ("error" in read) return read

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("organisations")
    .update({
      legal_name: read.input.legalName,
      company_id: read.input.companyId,
      country: read.input.country,
      description: read.input.description,
    })
    .eq("id", id)
  if (error) return { error: error.message }

  const extraError = await saveOrganisationExtras(supabase, id, read.input)
  if (extraError) return { error: extraError }

  revalidatePath("/sandbox")
  return { message: `Saved ${read.input.legalName}.` }
}

function readUser(formData: FormData) {
  const username = text(formData, "username")
  const login = text(formData, "login")
  const role = text(formData, "role")
  const organisationId = text(formData, "organisation_id")

  if (!username || !login || !organisationId) {
    return { error: "Username, login, and organisation are required." }
  }
  if (role !== "seller" && role !== "investor") {
    return { error: "Role must be seller or investor." }
  }
  return { input: { username, login, role, organisationId } }
}

async function ensureInvestorMultisig(supabase: ServiceClient, organisationId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("multisigs")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("type", "investor")
    .maybeSingle()
  if (existingError) return existingError.message
  if (existing) return null
  const { error: multisigError } = await supabase.from("multisigs").insert({
    organisation_id: organisationId,
    type: "investor",
    status: "not_created",
  })
  return multisigError ? multisigError.message : null
}

export async function createUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const read = readUser(formData)
  if ("error" in read) return read
  const { username, login, role, organisationId } = read.input

  const supabase = createServiceClient()
  const { data: identity, error: identityError } = await supabase
    .from("identities")
    .insert({ username, login })
    .select("id")
    .single()
  if (identityError) return { error: identityError.message }

  const { data: member, error: memberError } = await supabase
    .from("organisation_members")
    .insert({ identity_id: identity.id, organisation_id: organisationId })
    .select("id")
    .single()
  if (memberError) return { error: memberError.message }

  const { error: roleError } = await supabase
    .from("membership_roles")
    .insert({ member_id: member.id, role })
  if (roleError) return { error: roleError.message }

  if (role === "investor") {
    const multisigError = await ensureInvestorMultisig(supabase, organisationId)
    if (multisigError) return { error: multisigError }
  }

  revalidatePath("/sandbox")
  return { message: `Linked ${username} as ${role}.` }
}

export async function updateUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id")
  if (!id) return { error: "Choose a user to edit." }
  const read = readUser(formData)
  if ("error" in read) return read
  const { username, login, role, organisationId } = read.input

  const supabase = createServiceClient()
  const { error: identityError } = await supabase
    .from("identities")
    .update({ username, login })
    .eq("id", id)
  if (identityError) return { error: identityError.message }

  const { data: member, error: memberError } = await supabase
    .from("organisation_members")
    .select("id")
    .eq("identity_id", id)
    .maybeSingle()
  if (memberError) return { error: memberError.message }
  if (!member) return { error: "This user is not linked to an organisation." }

  const { error: organisationError } = await supabase
    .from("organisation_members")
    .update({ organisation_id: organisationId })
    .eq("id", member.id)
  if (organisationError) return { error: organisationError.message }

  const { error: deleteRolesError } = await supabase
    .from("membership_roles")
    .delete()
    .eq("member_id", member.id)
  if (deleteRolesError) return { error: deleteRolesError.message }

  const { error: roleError } = await supabase
    .from("membership_roles")
    .insert({ member_id: member.id, role })
  if (roleError) return { error: roleError.message }

  if (role === "investor") {
    const multisigError = await ensureInvestorMultisig(supabase, organisationId)
    if (multisigError) return { error: multisigError }
  }

  revalidatePath("/sandbox")
  return { message: `Saved ${username}.` }
}

export async function setFunds(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const organisationId = text(formData, "organisation_id")
  const available = Number(text(formData, "available_rlusd"))
  const portfolio = Number(text(formData, "portfolio_rlusd"))
  if (!organisationId) return { error: "This user is not linked to an organisation." }
  if (!Number.isFinite(available) || available < 0) {
    return { error: "Available RLUSD must be zero or greater." }
  }
  if (!Number.isFinite(portfolio) || portfolio < 0) {
    return { error: "Portfolio RLUSD must be zero or greater." }
  }

  const supabase = createServiceClient()
  const { data: latest, error: latestError } = await supabase
    .from("organisation_portfolio_snapshots")
    .select("reserved_rlusd, outstanding_rlusd")
    .eq("organisation_id", organisationId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) return { error: latestError.message }

  const { error } = await supabase.from("organisation_portfolio_snapshots").insert({
    organisation_id: organisationId,
    available_rlusd: available,
    reserved_rlusd: Number(latest?.reserved_rlusd ?? 0),
    outstanding_rlusd: Number(latest?.outstanding_rlusd ?? 0),
    portfolio_rlusd: portfolio,
  })
  if (error) return { error: error.message }

  revalidatePath("/sandbox")
  return { message: `Available is ${available} RLUSD and the portfolio is ${portfolio} RLUSD.` }
}

function readInvoice(formData: FormData) {
  const documentId = text(formData, "document_id")
  const sellerId = text(formData, "seller_organisation_id")
  const obligorId = text(formData, "obligor_organisation_id")
  const obligorName = text(formData, "obligor_name")
  const obligorCompanyId = text(formData, "obligor_company_id")
  const currency = text(formData, "currency") || "BRL"
  const originationDate = text(formData, "origination_date")
  const dueDate = text(formData, "due_date")
  const product = text(formData, "product")
  const unit = text(formData, "unit")
  const faceValue = Number(text(formData, "face_value"))
  const lineAmount = Number(text(formData, "line_amount"))

  if (!documentId || !sellerId || !originationDate || !dueDate || !product || !unit) {
    return { error: "Document, seller, dates, product, amount, and unit are required." }
  }
  if (!Number.isFinite(faceValue) || faceValue < 0) {
    return { error: "Face value must be zero or greater." }
  }
  if (!Number.isFinite(lineAmount) || lineAmount < 0) {
    return { error: "Line amount must be zero or greater." }
  }

  return {
    input: {
      documentId,
      sellerId,
      obligorId,
      obligorName,
      obligorCompanyId,
      currency,
      originationDate,
      dueDate,
      product,
      unit,
      faceValue,
      lineAmount,
      lineId: text(formData, "line_id"),
    },
  }
}

async function resolveObligor(
  supabase: ServiceClient,
  obligorId: string,
  obligorName: string,
  obligorCompanyId: string,
) {
  if (obligorId) return { id: obligorId }
  if (!obligorName || !obligorCompanyId) {
    return { error: "Pick an obligor, or enter a name and company id to add one." }
  }
  const { data: existing, error: existingError } = await supabase
    .from("organisations")
    .select("id")
    .eq("country", "BR")
    .eq("company_id", obligorCompanyId)
    .maybeSingle()
  if (existingError) return { error: existingError.message }
  if (existing) return { id: existing.id as string }

  const { data: created, error: createError } = await supabase
    .from("organisations")
    .insert({
      legal_name: obligorName,
      company_id: obligorCompanyId,
      country: "BR",
    })
    .select("id")
    .single()
  if (createError) return { error: createError.message }
  return { id: created.id as string }
}

async function invoiceRisk(supabase: ServiceClient, sellerId: string, obligorId: string) {
  const { data: parties, error: partyError } = await supabase
    .from("organisations")
    .select("id, risk_score")
    .in("id", [sellerId, obligorId])
  if (partyError) return { error: partyError.message }
  const scores = new Map((parties ?? []).map((row) => [row.id as string, row.risk_score as number]))
  const sellerScore = scores.get(sellerId)
  const obligorScore = scores.get(obligorId)
  if (sellerScore === undefined || obligorScore === undefined) {
    return { error: "Seller or obligor was not found." }
  }

  let risk = Math.max(sellerScore, obligorScore)
  const { data: parameters, error: parameterError } = await supabase
    .from("risk_parameters")
    .select("key, weight")
  if (!parameterError && parameters) {
    const weights = new Map(parameters.map((row) => [row.key as string, Number(row.weight)]))
    const mixed = invoiceScore(
      sellerScore,
      obligorScore,
      weights.get("seller_score") ?? 0,
      weights.get("obligor_score") ?? 0,
    )
    if (mixed !== null) risk = mixed
  }
  return { risk }
}

async function saveInvoiceLine(
  supabase: ServiceClient,
  invoiceId: string,
  lineId: string,
  product: string,
  lineAmount: number,
  unit: string,
) {
  if (lineId) {
    const { error } = await supabase
      .from("organisation_invoice_lines")
      .update({ product, amount: lineAmount, unit })
      .eq("id", lineId)
      .eq("invoice_id", invoiceId)
    return error ? error.message : null
  }
  const { error } = await supabase.from("organisation_invoice_lines").insert({
    invoice_id: invoiceId,
    product,
    amount: lineAmount,
    unit,
  })
  return error ? error.message : null
}

export async function createInvoice(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const read = readInvoice(formData)
  if ("error" in read) return read
  const input = read.input

  const supabase = createServiceClient()
  const obligor = await resolveObligor(
    supabase,
    input.obligorId,
    input.obligorName,
    input.obligorCompanyId,
  )
  if ("error" in obligor) return obligor
  const scored = await invoiceRisk(supabase, input.sellerId, obligor.id)
  if ("error" in scored) return scored

  const { data: invoice, error: invoiceError } = await supabase
    .from("organisation_invoices")
    .insert({
      document_id: input.documentId,
      seller_organisation_id: input.sellerId,
      obligor_organisation_id: obligor.id,
      face_value: input.faceValue,
      currency: input.currency,
      origination_date: input.originationDate,
      due_date: input.dueDate,
      risk_score: scored.risk,
    })
    .select("id")
    .single()
  if (invoiceError) return { error: invoiceError.message }

  const lineError = await saveInvoiceLine(
    supabase,
    invoice.id as string,
    "",
    input.product,
    input.lineAmount,
    input.unit,
  )
  if (lineError) return { error: lineError }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Saved invoice ${input.documentId}.` }
}

export async function updateInvoice(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id")
  if (!id) return { error: "Choose an invoice to edit." }
  const read = readInvoice(formData)
  if ("error" in read) return read
  const input = read.input

  const supabase = createServiceClient()
  const obligor = await resolveObligor(
    supabase,
    input.obligorId,
    input.obligorName,
    input.obligorCompanyId,
  )
  if ("error" in obligor) return obligor
  const scored = await invoiceRisk(supabase, input.sellerId, obligor.id)
  if ("error" in scored) return scored

  const { error: invoiceError } = await supabase
    .from("organisation_invoices")
    .update({
      document_id: input.documentId,
      seller_organisation_id: input.sellerId,
      obligor_organisation_id: obligor.id,
      face_value: input.faceValue,
      currency: input.currency,
      origination_date: input.originationDate,
      due_date: input.dueDate,
      risk_score: scored.risk,
    })
    .eq("id", id)
  if (invoiceError) return { error: invoiceError.message }

  const lineError = await saveInvoiceLine(
    supabase,
    id,
    input.lineId,
    input.product,
    input.lineAmount,
    input.unit,
  )
  if (lineError) return { error: lineError }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Saved invoice ${input.documentId}.` }
}

function list(formData: FormData, name: string) {
  return text(formData, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function requiredNumber(formData: FormData, name: string) {
  const value = Number(text(formData, name))
  return Number.isFinite(value) ? value : Number.NaN
}

function optionalWhole(formData: FormData, name: string) {
  const raw = text(formData, name)
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) ? value : Number.NaN
}

function readBucket(formData: FormData) {
  const organisationId = text(formData, "organisation_id")
  const name = text(formData, "name")
  const status = text(formData, "status") || "active"
  const exposureKind = text(formData, "exposure_kind")
  const riskLow = requiredNumber(formData, "risk_low")
  const riskHigh = requiredNumber(formData, "risk_high")
  const faceMin = requiredNumber(formData, "face_min")
  const faceMax = requiredNumber(formData, "face_max")
  const tenorMin = optionalWhole(formData, "tenor_min")
  const tenorMax = optionalWhole(formData, "tenor_max")
  const apr = requiredNumber(formData, "apr")
  const exposureLimitUsd = text(formData, "exposure_limit_usd")
    ? requiredNumber(formData, "exposure_limit_usd")
    : null
  const exposureLimitPercent = text(formData, "exposure_limit_percent")
    ? requiredNumber(formData, "exposure_limit_percent")
    : null
  const featureChoices = readFeatureChoices(formData)

  if (!organisationId || !name) return { error: "Choose an investor and name the bucket." }
  if (status !== "active" && status !== "paused") return { error: "Status must be active or paused." }
  if (!Number.isInteger(riskLow) || !Number.isInteger(riskHigh) || riskLow < 0 || riskHigh > 10000) {
    return { error: "Risk bounds are whole numbers from 0 to 10000." }
  }
  if (riskLow > riskHigh) return { error: "Risk low cannot be above risk high." }
  if (!Number.isFinite(faceMin) || !Number.isFinite(faceMax) || faceMin < 0 || faceMin > faceMax) {
    return { error: "Face minimum must be zero or greater and no higher than the maximum." }
  }
  if (tenorMin !== null && (Number.isNaN(tenorMin) || tenorMin < 0)) {
    return { error: "Tenor minimum is a whole number of days, or blank." }
  }
  if (tenorMax !== null && (Number.isNaN(tenorMax) || tenorMax < 0)) {
    return { error: "Tenor maximum is a whole number of days, or blank." }
  }
  if (tenorMin !== null && tenorMax !== null && tenorMin > tenorMax) {
    return { error: "Tenor minimum cannot be above tenor maximum." }
  }
  if (!Number.isFinite(apr) || apr < 0) return { error: "APR is a fraction, such as 0.12 for 12%." }
  if (exposureKind !== "flat_usd" && exposureKind !== "portfolio_percent") {
    return { error: "Choose a flat USD limit or a percent of portfolio." }
  }
  if (exposureKind === "flat_usd" && (exposureLimitUsd === null || exposureLimitUsd < 0)) {
    return { error: "A flat limit needs a USD amount of zero or greater." }
  }
  if (exposureKind === "portfolio_percent" && (exposureLimitPercent === null || exposureLimitPercent < 0)) {
    return { error: "A percent limit needs a percent of zero or greater." }
  }

  return {
    input: {
      organisationId,
      name,
      status,
      exposureKind,
      riskLow,
      riskHigh,
      faceMin,
      faceMax,
      tenorMin,
      tenorMax,
      apr,
      exposureLimitUsd,
      exposureLimitPercent,
      industries: list(formData, "industries"),
      countries: list(formData, "countries"),
      currencies: list(formData, "currencies"),
      featureChoices,
    },
  }
}

function bucketRow(input: Exclude<ReturnType<typeof readBucket>, { error: string }>["input"]) {
  return {
    organisation_id: input.organisationId,
    name: input.name,
    status: input.status,
    risk_low: input.riskLow,
    risk_high: input.riskHigh,
    face_min: input.faceMin,
    face_max: input.faceMax,
    tenor_min: input.tenorMin,
    tenor_max: input.tenorMax,
    industries: input.industries,
    countries: input.countries,
    currencies: input.currencies,
    apr: input.apr,
    exposure_kind: input.exposureKind,
    exposure_limit_usd: input.exposureKind === "flat_usd" ? input.exposureLimitUsd : null,
    exposure_limit_percent: input.exposureKind === "portfolio_percent" ? input.exposureLimitPercent : null,
  }
}

async function requireInvestor(supabase: ServiceClient, organisationId: string) {
  const { data: members, error: memberError } = await supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", organisationId)
  if (memberError) return memberError.message
  const memberIds = (members ?? []).map((member) => member.id as string)
  const { data: roles, error: roleError } =
    memberIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("membership_roles").select("role").in("member_id", memberIds).eq("role", "investor")
  if (roleError) return roleError.message
  if ((roles ?? []).length === 0) return "That organisation is not an investor."
  return null
}

function readFeatureChoices(formData: FormData) {
  const choices: { id: string; mode: "yes" | "no" }[] = []
  let sawMode = false
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("feature_mode_") || typeof value !== "string") continue
    sawMode = true
    if (value !== "yes" && value !== "no") continue
    choices.push({ id: key.slice("feature_mode_".length), mode: value })
  }
  if (sawMode) return choices
  return formData
    .getAll("feature_id")
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((id) => ({ id, mode: "yes" as const }))
}

async function saveBucketFeatures(
  supabase: ServiceClient,
  bucketId: string,
  choices: { id: string; mode: "yes" | "no" }[],
) {
  const probe = await supabase.from("organisation_bucket_features").select("mode").limit(1)
  const modeColumn = !probe.error
  if (!modeColumn && !probe.error?.message.toLowerCase().includes("mode")) return probe.error?.message ?? "Could not read toggles."
  if (!modeColumn && choices.some((choice) => choice.mode === "no")) {
    return "Has not could not be saved. Apply the bucket feature mode migration."
  }
  const { error: deleteError } = await supabase
    .from("organisation_bucket_features")
    .delete()
    .eq("bucket_id", bucketId)
  if (deleteError) return deleteError.message
  if (choices.length === 0) return null
  const rows = modeColumn
    ? choices.map((choice) => ({ bucket_id: bucketId, feature_id: choice.id, mode: choice.mode }))
    : choices.filter((choice) => choice.mode === "yes").map((choice) => ({ bucket_id: bucketId, feature_id: choice.id }))
  if (rows.length === 0) return null
  const { error } = await supabase.from("organisation_bucket_features").insert(rows)
  return error ? error.message : null
}

export async function createBucket(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const read = readBucket(formData)
  if ("error" in read) return read

  const supabase = createServiceClient()
  const investorError = await requireInvestor(supabase, read.input.organisationId)
  if (investorError) return { error: investorError }

  const { data: bucket, error } = await supabase
    .from("organisation_buckets")
    .insert(bucketRow(read.input))
    .select("id")
    .single()
  if (error) return { error: error.message }

  const featureError = await saveBucketFeatures(supabase, bucket.id as string, read.input.featureChoices)
  if (featureError) return { error: featureError }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Saved bucket ${read.input.name}.` }
}

export async function updateBucket(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id")
  if (!id) return { error: "Choose a bucket to edit." }
  const read = readBucket(formData)
  if ("error" in read) return read

  const supabase = createServiceClient()
  const investorError = await requireInvestor(supabase, read.input.organisationId)
  if (investorError) return { error: investorError }

  const { error } = await supabase.from("organisation_buckets").update(bucketRow(read.input)).eq("id", id)
  if (error) return { error: error.message }

  const featureError = await saveBucketFeatures(supabase, id, read.input.featureChoices)
  if (featureError) return { error: featureError }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Saved bucket ${read.input.name}.` }
}

type FundsSnapshot = {
  available_rlusd: number
  reserved_rlusd: number
  outstanding_rlusd: number
  portfolio_rlusd: number
}

function snapshotFrom(row: {
  available_rlusd: unknown
  reserved_rlusd: unknown
  outstanding_rlusd: unknown
  portfolio_rlusd: unknown
}): FundsSnapshot {
  return {
    available_rlusd: Number(row.available_rlusd),
    reserved_rlusd: Number(row.reserved_rlusd),
    outstanding_rlusd: Number(row.outstanding_rlusd),
    portfolio_rlusd: Number(row.portfolio_rlusd),
  }
}

function emptyFunds(): FundsSnapshot {
  return { available_rlusd: 0, reserved_rlusd: 0, outstanding_rlusd: 0, portfolio_rlusd: 0 }
}

async function latestFunds(supabase: ServiceClient, organisationId: string) {
  const { data, error } = await supabase
    .from("organisation_portfolio_snapshots")
    .select("available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd")
    .eq("organisation_id", organisationId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { error: error.message }
  return { snapshot: data ? snapshotFrom(data) : null }
}

async function insertFunds(supabase: ServiceClient, organisationId: string, funds: FundsSnapshot) {
  const { error } = await supabase.from("organisation_portfolio_snapshots").insert({
    organisation_id: organisationId,
    available_rlusd: roundMoney(funds.available_rlusd),
    reserved_rlusd: roundMoney(funds.reserved_rlusd),
    outstanding_rlusd: roundMoney(funds.outstanding_rlusd),
    portfolio_rlusd: roundMoney(Math.max(0, funds.portfolio_rlusd)),
  })
  return error ? error.message : null
}

export async function updateMatching(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const rate = await frankfurterRate()
    const catalogue = await loadCatalogue()
    const today = new Date().toISOString().slice(0, 10)
    const outcomes = runMatch({
      today,
      rate,
      invoices: catalogue.invoices,
      buckets: catalogue.buckets,
      random: () => 0,
    })
    const priced = outcomes.filter((item) => item.offer !== null).length
    revalidatePath("/sandbox")
    revalidatePath("/match")
    return { message: `Priced ${priced} offers.` }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Matching did not run." }
  }
}

async function stableOffer(invoiceId: string) {
  const rate = await frankfurterRate()
  const catalogue = await loadCatalogue()
  const today = new Date().toISOString().slice(0, 10)
  const outcome = runMatch({
    today,
    rate,
    invoices: catalogue.invoices,
    buckets: catalogue.buckets,
    random: () => 0,
  }).find((item) => item.invoiceId === invoiceId)
  return { rate, today, outcome }
}

export async function acceptInvoice(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = text(formData, "invoice_id")
  if (!invoiceId) return { error: "Choose an invoice." }

  let priced: Awaited<ReturnType<typeof stableOffer>>
  try {
    priced = await stableOffer(invoiceId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The offer could not be priced." }
  }
  const outcome = priced.outcome
  if (!outcome) return { error: "That invoice is not in the catalogue." }
  if (outcome.skipped) return { error: outcome.skipped }
  if (outcome.offer === null || !outcome.winnerOrganisationId || !outcome.winnerBucketId) {
    return { error: "No bucket matched this invoice." }
  }

  const supabase = createServiceClient()
  const { data: invoice, error: invoiceError } = await supabase
    .from("organisation_invoices")
    .select("id, seller_organisation_id, buyer_organisation_id, face_value, currency, repaid")
    .eq("id", invoiceId)
    .maybeSingle()
  if (invoiceError) return { error: invoiceError.message }
  if (!invoice) return { error: "That invoice is not in the catalogue." }
  if (invoice.buyer_organisation_id) return { error: "This invoice is already sold." }
  if (invoice.repaid) return { error: "This invoice is already repaid." }

  const offerRlusd = toRlusd(outcome.offer, invoice.currency as string, priced.rate)
  const faceRlusd = toRlusd(Number(invoice.face_value), invoice.currency as string, priced.rate)
  if (offerRlusd === null || faceRlusd === null) {
    return { error: `${invoice.currency} is not converted. Only BRL, USD, and RLUSD are.` }
  }

  const investorId = outcome.winnerOrganisationId
  const sellerId = invoice.seller_organisation_id as string
  const investorFunds = await latestFunds(supabase, investorId)
  if ("error" in investorFunds) return investorFunds
  const investor = investorFunds.snapshot
  if (!investor || roundMoney(investor.available_rlusd - offerRlusd) < 0) {
    return { error: "The investor does not have enough available RLUSD." }
  }
  const sellerFunds = await latestFunds(supabase, sellerId)
  if ("error" in sellerFunds) return sellerFunds
  const seller = sellerFunds.snapshot ?? emptyFunds()

  const investorWrite = await insertFunds(supabase, investorId, {
    ...investor,
    available_rlusd: investor.available_rlusd - offerRlusd,
  })
  if (investorWrite) return { error: investorWrite }
  const sellerWrite = await insertFunds(supabase, sellerId, {
    ...seller,
    available_rlusd: seller.available_rlusd + offerRlusd,
    portfolio_rlusd: seller.portfolio_rlusd + offerRlusd,
  })
  if (sellerWrite) return { error: sellerWrite }

  const { error: saleError } = await supabase
    .from("organisation_invoices")
    .update({
      buyer_organisation_id: investorId,
      buyer_bucket_id: outcome.winnerBucketId,
      sold_price: roundMoney(outcome.offer),
      sold_date: priced.today,
    })
    .eq("id", invoiceId)
  if (saleError) return { error: saleError.message }

  const { data: bucket, error: bucketError } = await supabase
    .from("organisation_buckets")
    .select("exposure_used_usd")
    .eq("id", outcome.winnerBucketId)
    .maybeSingle()
  if (bucketError) return { error: bucketError.message }
  if (bucket) {
    const { error: exposureError } = await supabase
      .from("organisation_buckets")
      .update({ exposure_used_usd: roundMoney(Number(bucket.exposure_used_usd) + faceRlusd) })
      .eq("id", outcome.winnerBucketId)
    if (exposureError) return { error: exposureError.message }
  }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  return { message: `Sold for ${roundMoney(outcome.offer)} ${invoice.currency}.` }
}

export async function repayInvoice(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = text(formData, "invoice_id")
  if (!invoiceId) return { error: "Choose an invoice." }

  let rate: number
  try {
    rate = await frankfurterRate()
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Frankfurter did not return a rate." }
  }

  const supabase = createServiceClient()
  const { data: invoice, error: invoiceError } = await supabase
    .from("organisation_invoices")
    .select(
      "id, obligor_organisation_id, buyer_organisation_id, buyer_bucket_id, face_value, currency, sold_price, repayment_amount, repaid",
    )
    .eq("id", invoiceId)
    .maybeSingle()
  if (invoiceError) return { error: invoiceError.message }
  if (!invoice) return { error: "That invoice is not in the catalogue." }
  if (!invoice.buyer_organisation_id) return { error: "This invoice has not been sold." }
  if (invoice.repaid) return { error: "This invoice is already repaid." }

  const obligorId = invoice.obligor_organisation_id as string
  const investorId = invoice.buyer_organisation_id as string
  const obligorFunds = await latestFunds(supabase, obligorId)
  if ("error" in obligorFunds) return obligorFunds
  const obligor = obligorFunds.snapshot
  if (!obligor || obligor.available_rlusd <= 0) {
    return { error: "The obligor has no available RLUSD." }
  }
  const investorFunds = await latestFunds(supabase, investorId)
  if ("error" in investorFunds) return investorFunds
  const investor = investorFunds.snapshot ?? emptyFunds()

  const payment = repaymentOf({
    face: Number(invoice.face_value),
    repaidSoFar: Number(invoice.repayment_amount),
    soldPrice: Number(invoice.sold_price ?? 0),
    availableRlusd: obligor.available_rlusd,
    currency: invoice.currency as string,
    rate,
  })
  if ("error" in payment) return payment

  const obligorWrite = await insertFunds(supabase, obligorId, {
    ...obligor,
    available_rlusd: obligor.available_rlusd - payment.paymentRlusd,
    portfolio_rlusd: obligor.portfolio_rlusd - payment.paymentRlusd,
  })
  if (obligorWrite) return { error: obligorWrite }
  const investorWrite = await insertFunds(supabase, investorId, {
    ...investor,
    available_rlusd: investor.available_rlusd + payment.paymentRlusd,
    portfolio_rlusd: investor.portfolio_rlusd + payment.profitRlusd,
  })
  if (investorWrite) return { error: investorWrite }

  const today = new Date().toISOString().slice(0, 10)
  const { error: repayError } = await supabase
    .from("organisation_invoices")
    .update({
      repayment_amount: payment.nextRepayment,
      repaid: payment.fullyRepaid,
      repaid_date: payment.fullyRepaid ? today : null,
    })
    .eq("id", invoiceId)
  if (repayError) return { error: repayError.message }

  if (payment.fullyRepaid && invoice.buyer_bucket_id) {
    const faceRlusd = toRlusd(Number(invoice.face_value), invoice.currency as string, rate)
    const { data: bucket, error: bucketError } = await supabase
      .from("organisation_buckets")
      .select("exposure_used_usd")
      .eq("id", invoice.buyer_bucket_id)
      .maybeSingle()
    if (bucketError) return { error: bucketError.message }
    if (bucket && faceRlusd !== null) {
      const { error: exposureError } = await supabase
        .from("organisation_buckets")
        .update({
          exposure_used_usd: roundMoney(Math.max(0, Number(bucket.exposure_used_usd) - faceRlusd)),
        })
        .eq("id", invoice.buyer_bucket_id)
      if (exposureError) return { error: exposureError.message }
    }
  }

  revalidatePath("/sandbox")
  revalidatePath("/match")
  const paid = `${payment.paymentRlusd} RLUSD`
  return {
    message: payment.fullyRepaid ? `Repaid the invoice with ${paid}.` : `Repaid ${paid} toward the invoice.`,
  }
}
