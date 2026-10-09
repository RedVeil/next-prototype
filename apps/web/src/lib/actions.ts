"use server"

import { COUNTRIES, CURRENCIES, GOODS_AND_SERVICES, isRiskBound } from "@antecipa/domain"
import {
  assertClassicAddress,
  changeAuthorizedSender,
  enqueueInvestorProvision,
  finishWithdrawal,
  executeWithdrawal,
  prepareWithdrawal as prepareInvestorWithdrawal,
  readRlusdBalance,
  replaceInvestorAccount,
  requeueProvisionJob,
  capturePortfolioSnapshot,
  fromMicro,
  scanDepositsForInvestor,
  startWithdrawal,
  submitPastedWithdrawal,
  sumOpenExpectedRepaymentRlusd,
  toMicro,
} from "@antecipa/ledger-bot/chain"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { destinationPath } from "./auth-destination"
import {
  assembleInvestorActivity,
  type DashboardCashMovement,
  type DashboardOffer,
  type DashboardPurchase,
  type DashboardRepayment,
  type DashboardReservation,
  type InvestorDashboard,
  type PortfolioPoint,
} from "./investor-dashboard"
import type { BucketInput, BucketRow, CompanyInput, CompanyRow, InvoiceInput, InvestorRow, SessionSnapshot } from "./records"
import { createClient } from "./supabase/server"
import { createServiceClient } from "./supabase/service"

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" }
}

function isNextRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  )
}

async function userClient() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error("Not signed in")
  return { supabase, user: data.user }
}

async function requireAdmin() {
  const { supabase, user } = await userClient()
  const profile = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile.error || profile.data.role !== "admin") throw new Error("Not an admin")
  return supabase
}

export async function getSession(): Promise<SessionSnapshot> {
  const empty: SessionSnapshot = {
    email: null,
    userId: null,
    role: null,
    company: null,
    investor: null,
    settings: { companyApplicationsAllowed: true, investorApplicationsAllowed: true },
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return empty
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return empty
  const profile = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle()
  const role = (profile.data?.role ?? null) as SessionSnapshot["role"]
  const settings = await supabase
    .from("platform_settings")
    .select("company_applications_allowed, investor_applications_allowed")
    .eq("id", true)
    .maybeSingle()
  const company =
    role === "company"
      ? await supabase.from("companies").select("*").eq("profile_id", data.user.id).maybeSingle()
      : { data: null }
  const investor =
    role === "investor"
      ? await supabase.from("investors").select("*").eq("profile_id", data.user.id).maybeSingle()
      : { data: null }
  return {
    email: data.user.email ?? null,
    userId: data.user.id,
    role,
    company: (company.data as CompanyRow | null) ?? null,
    investor: (investor.data as InvestorRow | null) ?? null,
    settings: {
      companyApplicationsAllowed: settings.data?.company_applications_allowed ?? true,
      investorApplicationsAllowed: settings.data?.investor_applications_allowed ?? true,
    },
  }
}

async function destinationFor(userId: string) {
  const supabase = await createClient()
  redirect(await destinationPath(supabase, userId))
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")
    if (!email || !password) return { ok: false, error: "Email and password are required." }
    const supabase = await createClient()
    const signed = await supabase.auth.signInWithPassword({ email, password })
    if (signed.error || !signed.data.user) return { ok: false, error: signed.error?.message ?? "Sign in failed" }
    await destinationFor(signed.data.user.id)
    return { ok: true }
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return failure(error)
  }
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")
    const role = formData.get("role") === "investor" ? "investor" : "company"
    if (!email || password.length < 8) return { ok: false, error: "Use an email and a password of at least 8 characters." }
    const supabase = await createClient()
    const origin = (await headers()).get("origin")
    const created = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role },
        emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
      },
    })
    if (created.error) return { ok: false, error: created.error.message }
    if (!created.data.session || !created.data.user) {
      return { ok: true, message: "Check your email to confirm the account, then log in." }
    }
    await destinationFor(created.data.user.id)
    return { ok: true }
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return failure(error)
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}

export async function submitCompanyApplication(input: CompanyInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await userClient()
    const legalName = input.legalName.trim()
    const taxId = input.taxId.trim()
    if (!legalName || !taxId) return { ok: false, error: "Legal name and tax or registration number are required." }
    const row = {
      legal_name: legalName,
      tax_id: taxId,
      country: "BR",
      industries: input.industries,
      business_description: input.businessDescription.trim(),
      goods_and_services: input.goodsAndServices,
      risk_low: 0,
      risk_high: 10000,
    }
    const existing = await supabase.from("companies").select("id, application_status").eq("profile_id", user.id).maybeSingle()
    if (existing.data?.application_status === "accepted") return { ok: false, error: "This company is already accepted." }
    const write = existing.data
      ? await supabase.from("companies").update(row).eq("id", existing.data.id)
      : await supabase.from("companies").insert({ ...row, profile_id: user.id, source: "application", application_status: "pending" })
    if (write.error) return { ok: false, error: write.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

const COUNTRY_CODES = new Set<string>(COUNTRIES.map((country) => country.code))
const CURRENCY_CODES = new Set<string>(CURRENCIES)
const PRODUCT_NAMES = new Set<string>(GOODS_AND_SERVICES)

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function createInvoice(input: InvoiceInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await userClient()
    const documentId = input.documentId.trim()
    if (!documentId) return { ok: false, error: "Document id is required." }
    if (!COUNTRY_CODES.has(input.originCountry)) return { ok: false, error: "Choose an origin country." }
    if (!CURRENCY_CODES.has(input.currency)) return { ok: false, error: "Choose a currency." }
    if (!PRODUCT_NAMES.has(input.product)) return { ok: false, error: "Choose a product." }
    if (!Number.isFinite(input.amount) || input.amount < 0) return { ok: false, error: "Amount must be zero or greater." }
    if (input.dueDate !== null && !isCalendarDate(input.dueDate)) return { ok: false, error: "Due date is not a valid date." }
    if (input.buyerId !== null && !isUuid(input.buyerId)) return { ok: false, error: "Buyer id must be a uuid." }
    if (!Array.isArray(input.issuerIndustries) || input.issuerIndustries.some((item) => typeof item !== "string")) {
      return { ok: false, error: "Issuer industries must be a list." }
    }

    const company = await supabase
      .from("companies")
      .select("id, application_status, access_status")
      .eq("profile_id", user.id)
      .maybeSingle()
    if (company.error) return { ok: false, error: company.error.message }
    if (!company.data || company.data.application_status !== "accepted" || company.data.access_status !== "allowed") {
      return { ok: false, error: "This company cannot add invoices." }
    }

    const inserted = await supabase.from("invoices").insert({
      company_id: company.data.id,
      document_id: documentId,
      origin_country: input.originCountry,
      currency: input.currency,
      amount: input.amount,
      product: input.product,
      due_date: input.dueDate,
      buyer_id: input.buyerId,
      buyer_name: input.buyerName.trim(),
      buyer_tax_id: input.buyerTaxId.trim(),
      issuer_industries: input.issuerIndustries,
    })
    if (inserted.error?.code === "23505") return { ok: false, error: "An invoice with this document id already exists." }
    if (inserted.error) return { ok: false, error: inserted.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function submitInvestorApplication(input: { legalName: string; xrplAddress: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await userClient()
    const legalName = input.legalName.trim()
    const xrplAddress = input.xrplAddress.trim()
    if (!legalName) return { ok: false, error: "Legal name is required." }
    assertClassicAddress(xrplAddress)
    const row = { legal_name: legalName, own_xrpl_address: xrplAddress }
    const existing = await supabase
      .from("investors")
      .select("id, application_status, own_xrpl_address")
      .eq("profile_id", user.id)
      .maybeSingle()
    if (existing.data?.application_status === "accepted") return { ok: false, error: "This investor is already accepted." }
    const saved = existing.data?.own_xrpl_address ? String(existing.data.own_xrpl_address) : null
    if (saved && saved !== xrplAddress) {
      return { ok: false, error: "The XRPL account cannot be changed. An admin can replace it." }
    }
    const write = existing.data
      ? await supabase.from("investors").update(row).eq("id", existing.data.id)
      : await supabase.from("investors").insert({
          ...row,
          profile_id: user.id,
          source: "application",
          application_status: "pending",
          bot_paused: false,
        })
    if (write.error) return { ok: false, error: write.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

function bucketRow(investorId: string, input: BucketInput, status: "active" | "paused") {
  if (!input.name.trim()) throw new Error("Name is required.")
  if (!isRiskBound(input.riskLow) || !isRiskBound(input.riskHigh) || input.riskLow > input.riskHigh) {
    throw new Error("Risk bounds must be integers from 0 to 10000, with low less than or equal to high.")
  }
  if (input.countries.length === 0 || input.currencies.length === 0) {
    throw new Error("Choose at least one country and one currency.")
  }
  if (!Number.isFinite(input.apr) || input.apr < 0) throw new Error("APR must be zero or greater.")
  return {
    investor_id: investorId,
    name: input.name.trim(),
    status,
    risk_low: input.riskLow,
    risk_high: input.riskHigh,
    industries: input.industries,
    products: input.products,
    countries: input.countries,
    currencies: input.currencies,
    criteria_mode: input.criteriaMode,
    apr: input.apr,
    exposure_kind: input.exposureKind,
    exposure_limit_usd: input.exposureKind === "flat_usd" ? input.exposureLimitUsd : null,
    exposure_limit_percent: input.exposureKind === "portfolio_percent" ? input.exposureLimitPercent : null,
    tenor_min: input.tenorMin,
    tenor_max: input.tenorMax,
    invoice_min: input.invoiceMin,
    invoice_max: input.invoiceMax,
  }
}

export async function listMyBuckets(): Promise<BucketRow[]> {
  const { supabase } = await userClient()
  const rows = await supabase.from("buckets").select("*").order("name")
  if (rows.error) throw new Error(rows.error.message)
  return (rows.data ?? []) as BucketRow[]
}

export async function createBucket(input: BucketInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error || !investor.data) return { ok: false, error: "No investor profile" }
    const inserted = await supabase.from("buckets").insert(bucketRow(investor.data.id, input, "active"))
    if (inserted.error) return { ok: false, error: inserted.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function updateBucket(id: string, input: BucketInput): Promise<ActionResult> {
  try {
    const { supabase } = await userClient()
    const current = await supabase.from("buckets").select("status, investor_id").eq("id", id).single()
    if (current.error) return { ok: false, error: current.error.message }
    const updated = await supabase
      .from("buckets")
      .update(bucketRow(current.data.investor_id, input, current.data.status))
      .eq("id", id)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function setBucketStatus(id: string, status: "active" | "paused"): Promise<ActionResult> {
  try {
    const { supabase } = await userClient()
    const updated = await supabase.from("buckets").update({ status }).eq("id", id)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteBucket(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await userClient()
    const removed = await supabase.from("buckets").delete().eq("id", id)
    if (removed.error) return { ok: false, error: removed.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function setBotPaused(paused: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await userClient()
    const updated = await supabase.rpc("set_own_bot_paused", { next_paused: paused })
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function getRlusdView() {
  const { supabase, user } = await userClient()
  const investor = await supabase.from("investors").select("*").eq("profile_id", user.id).maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  if (!investor.data) throw new Error("No investor profile")
  const row = investor.data as InvestorRow
  const multisigs = await supabase
    .from("multisig_accounts")
    .select("id, role, classic_address")
    .eq("investor_id", row.id)
  if (multisigs.error) throw new Error(multisigs.error.message)
  const wallet = (multisigs.data ?? []).find((item) => item.role === "investor_wallet")
  const reservation = (multisigs.data ?? []).find((item) => item.role === "investor_reservation")
  const deposits = await supabase
    .from("deposits")
    .select("id, amount, status, xrpl_tx_hash")
    .eq("investor_id", row.id)
    .order("id", { ascending: false })
  const job = await supabase
    .from("ledger_jobs")
    .select("status, last_error")
    .eq("type", "provision_investor_multisigs")
    .contains("payload", { investorId: row.id })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  let balance = "0"
  let reserved = "0"
  let balanceError: string | null = null
  if (wallet?.classic_address) {
    try {
      balance = await readRlusdBalance(String(wallet.classic_address))
      if (reservation?.classic_address) reserved = await readRlusdBalance(String(reservation.classic_address))
    } catch (error) {
      balanceError = error instanceof Error ? error.message : "Could not read the ledger"
    }
  }
  return {
    investor: row,
    multisigAddress: wallet?.classic_address ? String(wallet.classic_address) : null,
    balance,
    reserved,
    balanceError,
    deposits: deposits.data ?? [],
    provisionStatus: job.data?.status ? String(job.data.status) : null,
    provisionError: job.data?.last_error ? String(job.data.last_error) : null,
  }
}

export async function getInvestorDashboard(): Promise<InvestorDashboard> {
  const { supabase, user } = await userClient()
  const investor = await supabase.from("investors").select("*").eq("profile_id", user.id).maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  if (!investor.data) throw new Error("No investor profile")
  return loadInvestorDashboard(supabase, investor.data as InvestorRow & { created_at?: string })
}

export async function getAdminInvestorPreview(id: string): Promise<{
  legalName: string
  applicationStatus: InvestorRow["application_status"]
  dashboard: InvestorDashboard | null
} | null> {
  const supabase = await requireAdmin()
  const investor = await supabase.from("investors").select("*").eq("id", id).maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  if (!investor.data) return null
  const row = investor.data as InvestorRow & { created_at?: string }
  if (row.application_status !== "accepted") {
    return { legalName: row.legal_name, applicationStatus: row.application_status, dashboard: null }
  }
  return {
    legalName: row.legal_name,
    applicationStatus: row.application_status,
    dashboard: await loadInvestorDashboard(supabase, row),
  }
}

export async function getAdminCompany(id: string): Promise<CompanyRow | null> {
  const supabase = await requireAdmin()
  const company = await supabase.from("companies").select("*").eq("id", id).maybeSingle()
  if (company.error) throw new Error(company.error.message)
  return (company.data as CompanyRow | null) ?? null
}

async function loadInvestorDashboard(
  supabase: Awaited<ReturnType<typeof userClient>>["supabase"],
  row: InvestorRow & { created_at?: string },
): Promise<InvestorDashboard> {
  const multisigs = await supabase.from("multisig_accounts").select("id, role, classic_address").eq("investor_id", row.id)
  if (multisigs.error) throw new Error(multisigs.error.message)
  const wallet = (multisigs.data ?? []).find((item) => item.role === "investor_wallet")
  const reservation = (multisigs.data ?? []).find((item) => item.role === "investor_reservation")

  let balance: string | null = wallet?.classic_address ? null : "0"
  let reserved = "0"
  let balanceError: string | null = null
  if (wallet?.classic_address) {
    try {
      balance = await readRlusdBalance(String(wallet.classic_address))
    } catch (error) {
      balanceError = error instanceof Error ? error.message : "Could not read the ledger"
    }
  }
  if (reservation?.classic_address) {
    try {
      reserved = await readRlusdBalance(String(reservation.classic_address))
    } catch (error) {
      if (!balanceError) balanceError = error instanceof Error ? error.message : "Could not read the ledger"
    }
  }

  let invoicesValue = "0"
  let portfolio: string | null = null
  if (balance !== null && wallet?.classic_address) {
    const snap = await capturePortfolioSnapshot(row.id, { cashRlusd: balance })
    invoicesValue = snap.invoicesRlusd
    portfolio = snap.portfolioRlusd
  } else if (balance !== null) {
    invoicesValue = await sumOpenExpectedRepaymentRlusd(row.id)
    portfolio = fromMicro(toMicro(balance) + toMicro(invoicesValue))
  } else {
    invoicesValue = await sumOpenExpectedRepaymentRlusd(row.id)
  }

  const multisigIds = (multisigs.data ?? []).map((account) => account.id)
  const [buckets, purchases, offers, deposits, withdrawals, reservations, repayments, series] = await Promise.all([
    supabase.from("buckets").select("*").eq("investor_id", row.id).order("name"),
    supabase
      .from("bucket_purchases")
      .select(
        "id, bucket_id, invoice_id, amount_usd, expected_repayment_rlusd, created_at, buckets!inner(name, investor_id), invoices(buyer_name, currency, amount, due_date, status, document_id)",
      )
      .eq("buckets.investor_id", row.id),
    supabase.from("offers").select("invoice_id, bucket_id, due_date, created_at").eq("investor_id", row.id),
    supabase.from("deposits").select("id, amount, status, xrpl_tx_hash, created_at").eq("investor_id", row.id),
    supabase.from("withdrawals").select("id, amount, status, xrpl_tx_hash, created_at").eq("investor_id", row.id),
    supabase.from("reservations").select("id, invoice_id, amount, created_at").eq("investor_id", row.id),
    multisigIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("payouts")
          .select("id, invoice_id, amount, status, xrpl_tx_hash, created_at, direction")
          .eq("direction", "repayment")
          .in("destination_multisig_id", multisigIds),
    supabase
      .from("portfolio_snapshots")
      .select("captured_at, cash_rlusd, invoices_rlusd, portfolio_rlusd")
      .eq("investor_id", row.id)
      .order("captured_at", { ascending: true }),
  ])
  for (const result of [buckets, purchases, offers, deposits, withdrawals, reservations, repayments, series]) {
    if (result.error) throw new Error(result.error.message)
  }

  const job = await supabase
    .from("ledger_jobs")
    .select("status, last_error")
    .eq("type", "provision_investor_multisigs")
    .contains("payload", { investorId: row.id })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const activity = assembleInvestorActivity({
    purchases: (purchases.data ?? []) as DashboardPurchase[],
    offers: (offers.data ?? []) as DashboardOffer[],
    deposits: (deposits.data ?? []) as DashboardCashMovement[],
    withdrawals: (withdrawals.data ?? []) as DashboardCashMovement[],
    reservations: (reservations.data ?? []) as DashboardReservation[],
    repayments: (repayments.data ?? []) as DashboardRepayment[],
    joined: row.created_at ?? null,
  })

  const points: PortfolioPoint[] = (series.data ?? []).map((point) => ({
    capturedAt: String(point.captured_at),
    cash: String(point.cash_rlusd),
    invoices: String(point.invoices_rlusd),
    portfolio: String(point.portfolio_rlusd),
  }))

  return {
    legalName: row.legal_name,
    accessStatus: row.access_status,
    botPaused: row.bot_paused,
    ownAddress: row.own_xrpl_address,
    multisigAddress: wallet?.classic_address ? String(wallet.classic_address) : null,
    balance,
    reserved,
    balanceError,
    provisionStatus: job.data?.status ? String(job.data.status) : null,
    provisionError: job.data?.last_error ? String(job.data.last_error) : null,
    invoicesValue,
    portfolio,
    series: points,
    buckets: (buckets.data ?? []) as BucketRow[],
    positions: activity.positions,
    history: activity.history,
    stats: activity.stats,
  }
}

export async function checkDeposits(): Promise<ActionResult> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const count = await scanDepositsForInvestor(investor.data.id)
    return { ok: true, message: count ? `Recorded ${count} deposit${count === 1 ? "" : "s"}.` : "No new deposits." }
  } catch (error) {
    return failure(error)
  }
}

export async function withdrawRlusd(amount: string): Promise<ActionResult & { hash?: string }> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const result = await executeWithdrawal(investor.data.id, amount.trim())
    return { ok: true, hash: result.hash }
  } catch (error) {
    return failure(error)
  }
}

export async function prepareWithdrawal(amount: string): Promise<ActionResult & { tx?: Record<string, unknown> }> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const tx = await prepareInvestorWithdrawal(investor.data.id, amount.trim())
    return { ok: true, tx: JSON.parse(JSON.stringify(tx)) as Record<string, unknown> }
  } catch (error) {
    return failure(error)
  }
}

export async function beginWithdrawal(amount: string): Promise<ActionResult & { nextUrl?: string; qr?: string | null; withdrawalId?: string }> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const started = await startWithdrawal(investor.data.id, amount.trim())
    return { ok: true, ...started }
  } catch (error) {
    return failure(error)
  }
}

export async function completeWithdrawal(withdrawalId: string): Promise<ActionResult & { status?: string; hash?: string }> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const owned = await supabase
      .from("withdrawals")
      .select("id")
      .eq("id", withdrawalId)
      .eq("investor_id", investor.data.id)
      .maybeSingle()
    if (!owned.data) return { ok: false, error: "Withdrawal not found" }
    const result = await finishWithdrawal(withdrawalId)
    return { ok: true, status: result.status, hash: "hash" in result ? result.hash : undefined }
  } catch (error) {
    return failure(error)
  }
}

export async function pasteWithdrawal(amount: string, blob: string): Promise<ActionResult & { hash?: string }> {
  try {
    const { supabase, user } = await userClient()
    const investor = await supabase.from("investors").select("id").eq("profile_id", user.id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    const result = await submitPastedWithdrawal(investor.data.id, amount.trim(), blob)
    return { ok: true, hash: result.hash }
  } catch (error) {
    return failure(error)
  }
}

export async function adminOverview() {
  const supabase = await requireAdmin()
  const [companies, investors, jobs, wallets, settings] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("investors").select("id", { count: "exact", head: true }),
    supabase.from("ledger_jobs").select("id", { count: "exact", head: true }),
    supabase.from("bot_wallets").select("id", { count: "exact", head: true }),
    supabase.from("platform_settings").select("*").eq("id", true).single(),
  ])
  return {
    companies: companies.count ?? 0,
    investors: investors.count ?? 0,
    jobs: jobs.count ?? 0,
    wallets: wallets.count ?? 0,
    companyApplicationsAllowed: Boolean(settings.data?.company_applications_allowed),
    investorApplicationsAllowed: Boolean(settings.data?.investor_applications_allowed),
  }
}

export async function setApplicationGates(input: {
  companyApplicationsAllowed?: boolean
  investorApplicationsAllowed?: boolean
}): Promise<ActionResult> {
  try {
    const supabase = await requireAdmin()
    const current = await supabase.from("platform_settings").select("*").eq("id", true).single()
    if (current.error) return { ok: false, error: current.error.message }
    const updated = await supabase
      .from("platform_settings")
      .update({
        company_applications_allowed: input.companyApplicationsAllowed ?? current.data.company_applications_allowed,
        investor_applications_allowed: input.investorApplicationsAllowed ?? current.data.investor_applications_allowed,
      })
      .eq("id", true)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = await requireAdmin()
  const rows = await supabase.from("companies").select("*").order("created_at", { ascending: false })
  if (rows.error) throw new Error(rows.error.message)
  return (rows.data ?? []) as CompanyRow[]
}

export async function acceptCompany(id: string): Promise<ActionResult> {
  try {
    const supabase = await requireAdmin()
    const updated = await supabase.from("companies").update({ application_status: "accepted" }).eq("id", id).eq("application_status", "pending")
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function setCompanyAccess(id: string, access: "allowed" | "stopped"): Promise<ActionResult> {
  try {
    const supabase = await requireAdmin()
    const updated = await supabase.from("companies").update({ access_status: access }).eq("id", id)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function setCompanyRisk(id: string, riskLow: number, riskHigh: number): Promise<ActionResult> {
  try {
    if (!isRiskBound(riskLow) || !isRiskBound(riskHigh) || riskLow > riskHigh) {
      return { ok: false, error: "Risk bounds must be integers from 0 to 10000, with low less than or equal to high." }
    }
    const supabase = await requireAdmin()
    const updated = await supabase.from("companies").update({ risk_low: riskLow, risk_high: riskHigh }).eq("id", id)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function listInvestors() {
  const supabase = await requireAdmin()
  const investors = await supabase.from("investors").select("*").order("created_at", { ascending: false })
  if (investors.error) throw new Error(investors.error.message)
  const jobs = await supabase
    .from("ledger_jobs")
    .select("payload, status, last_error")
    .eq("type", "provision_investor_multisigs")
    .order("created_at", { ascending: false })
  const latest = new Map<string, { status: string; last_error: string | null }>()
  for (const job of jobs.data ?? []) {
    const investorId = (job.payload as { investorId?: string } | null)?.investorId
    if (!investorId || latest.has(investorId)) continue
    latest.set(investorId, { status: String(job.status), last_error: job.last_error ? String(job.last_error) : null })
  }
  return ((investors.data ?? []) as InvestorRow[]).map((investor) => ({
    ...investor,
    provision: latest.get(investor.id) ?? null,
  }))
}

export async function replaceInvestorXrplAddress(investorId: string, xrplAddress: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    await replaceInvestorAccount(investorId, xrplAddress.trim())
    return { ok: true, message: "XRPL account replaced." }
  } catch (error) {
    return failure(error)
  }
}

export async function acceptInvestor(id: string): Promise<ActionResult> {
  try {
    const supabase = await requireAdmin()
    const investor = await supabase.from("investors").select("own_xrpl_address").eq("id", id).single()
    if (investor.error) return { ok: false, error: investor.error.message }
    if (!investor.data.own_xrpl_address) return { ok: false, error: "The investor has no XRPL address." }
    const updated = await supabase.from("investors").update({ application_status: "accepted" }).eq("id", id).eq("application_status", "pending")
    if (updated.error) return { ok: false, error: updated.error.message }
    await enqueueInvestorProvision(id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function setInvestorAccess(id: string, access: "allowed" | "stopped"): Promise<ActionResult> {
  try {
    const supabase = await requireAdmin()
    const updated = await supabase.from("investors").update({ access_status: access }).eq("id", id)
    if (updated.error) return { ok: false, error: updated.error.message }
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

function assertWrite(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
}

async function deleteLogin(adminId: string, profileId: string | null) {
  if (!profileId) return
  if (profileId === adminId) throw new Error("The signed-in admin cannot be removed")
  const service = createServiceClient()
  const profile = await service.from("profiles").select("role").eq("id", profileId).maybeSingle()
  assertWrite(profile)
  if (profile.data?.role === "admin") throw new Error("The signed-in admin cannot be removed")
  const removed = await service.auth.admin.deleteUser(profileId)
  if (removed.error) throw new Error(removed.error.message)
}

async function deleteIn(table: string, column: string, values: string[]) {
  if (values.length === 0) return
  const service = createServiceClient()
  assertWrite(await service.from(table).delete().in(column, values))
}

export async function removeCompany(id: string): Promise<ActionResult> {
  try {
    const { user } = await userClient()
    await requireAdmin()
    const service = createServiceClient()
    const company = await service.from("companies").select("id, profile_id").eq("id", id).maybeSingle()
    assertWrite(company)
    if (!company.data) return { ok: false, error: "Company not found" }

    const invoices = await service.from("invoices").select("id").eq("company_id", id)
    assertWrite(invoices)
    const invoiceIds = (invoices.data ?? []).map((row) => String(row.id))
    for (const table of [
      "offers",
      "bucket_purchases",
      "reservations",
      "invoice_nfts",
      "payouts",
      "risk_assessments",
      "sale_perfections",
    ]) {
      await deleteIn(table, "invoice_id", invoiceIds)
    }
    await deleteIn("invoices", "id", invoiceIds)
    assertWrite(await service.from("company_invoice_filters").delete().eq("company_id", id))
    assertWrite(await service.from("companies").delete().eq("id", id))
    await deleteLogin(user.id, company.data.profile_id ? String(company.data.profile_id) : null)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function removeInvestor(id: string): Promise<ActionResult> {
  try {
    const { user } = await userClient()
    await requireAdmin()
    const service = createServiceClient()
    const investor = await service.from("investors").select("id, profile_id").eq("id", id).maybeSingle()
    assertWrite(investor)
    if (!investor.data) return { ok: false, error: "Investor not found" }

    const multisigs = await service
      .from("multisig_accounts")
      .select("id")
      .eq("investor_id", id)
      .in("role", ["investor_wallet", "investor_reservation"])
    assertWrite(multisigs)
    const multisigIds = (multisigs.data ?? []).map((row) => String(row.id))

    const bots = multisigIds.length
      ? await service.from("bot_wallets").select("id").in("multisig_account_id", multisigIds)
      : { data: [], error: null }
    assertWrite(bots)
    const botIds = (bots.data ?? []).map((row) => String(row.id))

    const byInvestor = await service.from("ledger_jobs").select("id").filter("payload->>investorId", "eq", id)
    assertWrite(byInvestor)
    const byBot = botIds.length
      ? await service.from("ledger_jobs").select("id").in("bot_wallet_id", botIds)
      : { data: [], error: null }
    assertWrite(byBot)
    const jobIds = [...new Set([...(byInvestor.data ?? []), ...(byBot.data ?? [])].map((row) => String(row.id)))]
    await deleteIn("ledger_jobs", "id", jobIds)

    assertWrite(await service.from("provision_secrets").delete().like("id", `investor:${id}:%`))
    assertWrite(await service.from("deposits").delete().eq("investor_id", id))
    assertWrite(await service.from("withdrawals").delete().eq("investor_id", id))

    const buckets = await service.from("buckets").select("id").eq("investor_id", id)
    assertWrite(buckets)
    const bucketIds = (buckets.data ?? []).map((row) => String(row.id))
    await deleteIn("bucket_purchases", "bucket_id", bucketIds)
    await deleteIn("offers", "bucket_id", bucketIds)
    assertWrite(await service.from("offers").delete().eq("investor_id", id))
    assertWrite(await service.from("reservations").delete().eq("investor_id", id))
    await deleteIn("reservations", "source_multisig_id", multisigIds)
    await deleteIn("reservations", "destination_multisig_id", multisigIds)
    await deleteIn("invoice_nfts", "issuer_multisig_id", multisigIds)
    await deleteIn("invoice_nfts", "holder_multisig_id", multisigIds)
    await deleteIn("payouts", "source_multisig_id", multisigIds)
    await deleteIn("payouts", "destination_multisig_id", multisigIds)
    await deleteIn("bot_wallets", "id", botIds)
    await deleteIn("multisig_accounts", "id", multisigIds)
    await deleteIn("buckets", "id", bucketIds)
    assertWrite(await service.from("investors").delete().eq("id", id))
    await deleteLogin(user.id, investor.data.profile_id ? String(investor.data.profile_id) : null)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function listLedgerJobs() {
  const supabase = await requireAdmin()
  const rows = await supabase.from("ledger_jobs").select("id, type, status, attempts, last_error, bot_wallet_id, created_at").order("created_at", { ascending: false })
  if (rows.error) throw new Error(rows.error.message)
  return rows.data ?? []
}

export async function retryProvision(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    await requeueProvisionJob(id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function listBots() {
  const supabase = await requireAdmin()
  const [wallets, multisigs, senders, beats] = await Promise.all([
    supabase.from("bot_wallets").select("id, public_address, purpose, xrp_balance, xrp_fees_spent, multisig_account_id").order("purpose"),
    supabase.from("multisig_accounts").select("id, role, classic_address, investor_id, quorum").order("role"),
    supabase.from("multisig_authorized_senders").select("id, multisig_account_id, xrpl_address, label"),
    supabase.from("service_heartbeats").select("service_name, started_at, last_seen_at"),
  ])
  for (const result of [wallets, multisigs, senders, beats]) {
    if (result.error) throw new Error(result.error.message)
  }
  return {
    wallets: wallets.data ?? [],
    multisigs: multisigs.data ?? [],
    senders: senders.data ?? [],
    heartbeats: beats.data ?? [],
  }
}

export async function updateAllowList(input: {
  multisigId: string
  address: string
  label: string
  remove: boolean
}): Promise<ActionResult> {
  try {
    await requireAdmin()
    await changeAuthorizedSender(input)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
