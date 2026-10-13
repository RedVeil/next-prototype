import { loadCatalogue } from "@/app/match/load"
import { runMatch } from "@/app/match/match"
import { frankfurterRate } from "@/app/match/rate"
import { loadBucketFeatureLinks } from "@/lib/bucket-features"
import { createServiceClient } from "@/lib/supabase/service"
import { DemoBrowser, RiskToolbar } from "./browser"
import { toRlusd } from "./settle"
import type {
  BucketRecord,
  DemoData,
  InvoiceRecord,
  OrganisationRecord,
  UserRecord,
} from "./types"

export const dynamic = "force-dynamic"

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function dateOnly(value: unknown) {
  return String(value ?? "").slice(0, 10)
}

async function loadInvoiceOffers(names: Map<string, string>) {
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
    const byId = new Map<
      string,
      { offer: number | null; offer_rlusd: number | null; offer_investor: string; offer_detail: string | null }
    >()
    for (const outcome of outcomes) {
      const offer = outcome.offer
      const offerRlusd = offer === null ? null : toRlusd(offer, outcome.currency, rate)
      const investor = outcome.winnerOrganisationId
        ? (names.get(outcome.winnerOrganisationId) ?? "")
        : ""
      byId.set(outcome.invoiceId, {
        offer,
        offer_rlusd: offerRlusd,
        offer_investor: investor,
        offer_detail: outcome.skipped ?? (offer === null ? "No bucket matched." : null),
      })
    }
    return { detail: null as string | null, byId }
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : "The offer could not be priced.",
      byId: new Map<
        string,
        { offer: number | null; offer_rlusd: number | null; offer_investor: string; offer_detail: string | null }
      >(),
    }
  }
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function emptyActivity() {
  return { count: 0, face_value: 0 }
}

function addActivity(map: Map<string, { count: number; face_value: number }>, id: string, face: number, sign = 1) {
  const current = map.get(id) ?? emptyActivity()
  map.set(id, {
    count: current.count + sign,
    face_value: current.face_value + face * sign,
  })
}

async function loadSandbox(): Promise<DemoData> {
  const supabase = createServiceClient()
  const [
    organisations,
    links,
    industries,
    currencies,
    payments,
    identities,
    members,
    roles,
    snapshots,
    invoices,
    lines,
    buckets,
    bucketFeatures,
    features,
    parameters,
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, legal_name, company_id, country, description, risk_score, risk_score_base, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("organisation_industries").select("organisation_id, industry_id"),
    supabase.from("industries").select("id, name").order("name"),
    supabase.from("organisation_currencies").select("organisation_id, currency, use"),
    supabase.from("payment_methods").select("id, organisation_id, method, identifier").order("id"),
    supabase.from("identities").select("id, username, login, created_at").order("created_at", { ascending: false }),
    supabase.from("organisation_members").select("id, identity_id, organisation_id"),
    supabase.from("membership_roles").select("member_id, role"),
    supabase
      .from("organisation_portfolio_snapshots")
      .select("organisation_id, available_rlusd, portfolio_rlusd, captured_at")
      .order("captured_at", { ascending: false }),
    supabase
      .from("organisation_invoices")
      .select(
        "id, document_id, seller_organisation_id, obligor_organisation_id, buyer_organisation_id, face_value, currency, risk_score, sold_price, repayment_amount, repaid, origination_date, due_date, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("organisation_invoice_lines").select("id, invoice_id, product, amount, unit").order("id"),
    supabase
      .from("organisation_buckets")
      .select(
        "id, organisation_id, name, status, risk_low, risk_high, face_min, face_max, tenor_min, tenor_max, industries, countries, currencies, apr, exposure_kind, exposure_limit_usd, exposure_limit_percent, created_at",
      )
      .order("created_at", { ascending: false }),
    loadBucketFeatureLinks(supabase),
    supabase.from("bucket_features").select("id, name").order("name"),
    supabase.from("risk_parameters").select("key, label, weight, sort").order("sort"),
  ])

  const failed = [
    organisations,
    links,
    industries,
    currencies,
    payments,
    identities,
    members,
    roles,
    snapshots,
    invoices,
    lines,
    buckets,
    features,
    parameters,
  ].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const industryName = new Map((industries.data ?? []).map((row) => [row.id as string, row.name as string]))
  const industriesByOrg = new Map<string, string[]>()
  for (const link of links.data ?? []) {
    const name = industryName.get(link.industry_id as string)
    if (!name) continue
    push(industriesByOrg, link.organisation_id as string, name)
  }

  const currencyKeys = new Set(
    (currencies.data ?? []).map((row) => `${row.organisation_id}:${row.currency}:${row.use}`),
  )
  const paymentByOrg = new Map<string, { id: string; method: string; identifier: string }>()
  for (const row of payments.data ?? []) {
    const organisationId = row.organisation_id as string
    if (paymentByOrg.has(organisationId)) continue
    paymentByOrg.set(organisationId, {
      id: row.id as string,
      method: row.method as string,
      identifier: row.identifier as string,
    })
  }

  const fundsByOrg = new Map<string, { available_rlusd: number; portfolio_rlusd: number }>()
  for (const row of snapshots.data ?? []) {
    const organisationId = row.organisation_id as string
    if (fundsByOrg.has(organisationId)) continue
    fundsByOrg.set(organisationId, {
      available_rlusd: num(row.available_rlusd),
      portfolio_rlusd: num(row.portfolio_rlusd),
    })
  }

  const organisationRows: OrganisationRecord[] = (organisations.data ?? []).map((row) => {
    const id = row.id as string
    const payment = paymentByOrg.get(id)
    const funds = fundsByOrg.get(id)
    return {
      id,
      legal_name: row.legal_name as string,
      company_id: row.company_id as string,
      country: row.country as string,
      description: (row.description as string) ?? "",
      risk_score: num(row.risk_score),
      risk_score_base: num(row.risk_score_base),
      industries: industriesByOrg.get(id) ?? [],
      use_brl: currencyKeys.has(`${id}:BRL:invoices`),
      use_rlusd: currencyKeys.has(`${id}:RLUSD:funding`),
      payment_method_id: payment?.id ?? "",
      method: payment?.method ?? "",
      identifier: payment?.identifier ?? "",
      available_rlusd: funds?.available_rlusd ?? 0,
      portfolio_rlusd: funds?.portfolio_rlusd ?? 0,
      invoices_created: emptyActivity(),
      invoices_traded: emptyActivity(),
      invoices_repaid: emptyActivity(),
    }
  })
  const organisationName = new Map(organisationRows.map((row) => [row.id, row.legal_name]))

  const lineByInvoice = new Map<string, { id: string; product: string; amount: number; unit: string }>()
  for (const row of lines.data ?? []) {
    const invoiceId = row.invoice_id as string
    if (lineByInvoice.has(invoiceId)) continue
    lineByInvoice.set(invoiceId, {
      id: row.id as string,
      product: row.product as string,
      amount: num(row.amount),
      unit: row.unit as string,
    })
  }

  const featuresByBucket = new Map<string, { id: string; mode: "yes" | "no" }[]>()
  for (const row of bucketFeatures) {
    const list = featuresByBucket.get(row.bucketId) ?? []
    list.push({ id: row.featureId, mode: row.mode })
    featuresByBucket.set(row.bucketId, list)
  }

  const offers = await loadInvoiceOffers(organisationName)
  const createdByOrg = new Map<string, string[]>()
  const boughtByOrg = new Map<string, string[]>()
  const createdActivity = new Map<string, { count: number; face_value: number }>()
  const tradedActivity = new Map<string, { count: number; face_value: number }>()
  const repaidActivity = new Map<string, { count: number; face_value: number }>()
  const invoiceRows: InvoiceRecord[] = (invoices.data ?? []).map((row) => {
    const id = row.id as string
    const sellerId = row.seller_organisation_id as string
    const obligorId = row.obligor_organisation_id as string
    const buyerId = (row.buyer_organisation_id as string | null) ?? ""
    const faceValue = num(row.face_value)
    const priced = offers.byId.get(id)
    const line = lineByInvoice.get(id)
    push(createdByOrg, sellerId, row.document_id as string)
    addActivity(createdActivity, sellerId, faceValue)
    if (buyerId) {
      push(boughtByOrg, buyerId, row.document_id as string)
      addActivity(tradedActivity, buyerId, faceValue, 1)
      addActivity(tradedActivity, sellerId, faceValue, -1)
    }
    if (row.repaid) addActivity(repaidActivity, obligorId, faceValue)
    return {
      id,
      document_id: row.document_id as string,
      seller_organisation_id: sellerId,
      seller: organisationName.get(sellerId) ?? "",
      obligor_organisation_id: obligorId,
      obligor: organisationName.get(obligorId) ?? "",
      buyer: buyerId ? (organisationName.get(buyerId) ?? "") : "",
      face_value: faceValue,
      currency: row.currency as string,
      risk_score: num(row.risk_score),
      sold_price: optionalNum(row.sold_price),
      repayment_amount: num(row.repayment_amount),
      repaid: Boolean(row.repaid),
      offer: priced?.offer ?? null,
      offer_rlusd: priced?.offer_rlusd ?? null,
      offer_investor: priced?.offer_investor ?? "",
      offer_detail: priced?.offer_detail ?? offers.detail,
      origination_date: dateOnly(row.origination_date),
      due_date: dateOnly(row.due_date),
      product: line?.product ?? "",
      line_id: line?.id ?? "",
      line_amount: line?.amount ?? 0,
      unit: line?.unit ?? "",
    }
  })

  const bucketsByOrg = new Map<string, string[]>()
  const bucketRows: BucketRecord[] = (buckets.data ?? []).map((row) => {
    const organisationId = row.organisation_id as string
    push(bucketsByOrg, organisationId, row.name as string)
    return {
      id: row.id as string,
      organisation_id: organisationId,
      investor: organisationName.get(organisationId) ?? "",
      name: row.name as string,
      status: row.status as string,
      risk_low: num(row.risk_low),
      risk_high: num(row.risk_high),
      face_min: num(row.face_min),
      face_max: num(row.face_max),
      tenor_min: optionalNum(row.tenor_min),
      tenor_max: optionalNum(row.tenor_max),
      industries: textList(row.industries),
      countries: textList(row.countries),
      currencies: textList(row.currencies),
      apr: num(row.apr),
      exposure_kind: row.exposure_kind as string,
      exposure_limit_usd: optionalNum(row.exposure_limit_usd),
      exposure_limit_percent: optionalNum(row.exposure_limit_percent),
      feature_modes: featuresByBucket.get(row.id as string) ?? [],
    }
  })

  const memberByIdentity = new Map((members.data ?? []).map((row) => [row.identity_id as string, row]))
  const roleByMember = new Map((roles.data ?? []).map((row) => [row.member_id as string, row.role as string]))
  const investorIds = new Set(
    (members.data ?? [])
      .filter((member) => roleByMember.get(member.id as string) === "investor")
      .map((member) => member.organisation_id as string),
  )
  const userRows: UserRecord[] = (identities.data ?? []).map((row) => {
    const member = memberByIdentity.get(row.id as string)
    const organisationId = member ? (member.organisation_id as string) : ""
    const role = member ? (roleByMember.get(member.id as string) ?? "") : ""
    return {
      id: row.id as string,
      username: row.username as string,
      login: row.login as string,
      role,
      organisation_id: organisationId,
      organisation: organisationName.get(organisationId) ?? "",
      created_invoices: createdByOrg.get(organisationId) ?? [],
      bought_invoices: boughtByOrg.get(organisationId) ?? [],
      buckets: bucketsByOrg.get(organisationId) ?? [],
    }
  })

  const organisationsWithActivity = organisationRows.map((organisation) => ({
    ...organisation,
    invoices_created: createdActivity.get(organisation.id) ?? organisation.invoices_created,
    invoices_traded: tradedActivity.get(organisation.id) ?? organisation.invoices_traded,
    invoices_repaid: repaidActivity.get(organisation.id) ?? organisation.invoices_repaid,
  }))

  return {
    organisations: organisationsWithActivity,
    industryNames: [...industryName.values()],
    users: userRows,
    investors: organisationsWithActivity.filter((row) => investorIds.has(row.id)),
    invoices: invoiceRows,
    buckets: bucketRows,
    features: (features.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string })),
    parameters: (parameters.data ?? []).map((row) => ({
      key: row.key as string,
      label: row.label as string,
      weight: Number(row.weight),
    })),
  }
}

export default async function SandboxPage() {
  let data: DemoData | null = null
  let detail = ""
  try {
    data = await loadSandbox()
  } catch (error) {
    detail = error instanceof Error ? error.message : "The sandbox tables did not respond."
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm text-muted">Sandbox</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Demo data</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          These forms write the organisation tables. They do not create auth users, send email, or
          submit anything to XRPL.
        </p>
        {data ? <RiskToolbar parameters={data.parameters} /> : null}
      </div>
      {detail ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-red-700">{detail}</p>
      ) : null}
      {data ? <DemoBrowser data={data} /> : null}
    </main>
  )
}
