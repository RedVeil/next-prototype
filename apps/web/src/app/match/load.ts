import { createServiceClient } from "@/lib/supabase/service"
import type { MatchBucket, MatchInvoice } from "./match"

export type ListedBucket = MatchBucket & {
  features: string[]
}

function asNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function loadCatalogue() {
  const supabase = createServiceClient()
  const [organisations, links, industries, invoices, buckets, features, linksFeatures, snapshots] =
    await Promise.all([
      supabase.from("organisations").select("id, legal_name, country"),
      supabase.from("organisation_industries").select("organisation_id, industry_id"),
      supabase.from("industries").select("id, name"),
      supabase
        .from("organisation_invoices")
        .select(
          "id, document_id, seller_organisation_id, obligor_organisation_id, buyer_organisation_id, face_value, currency, risk_score, due_date, repaid, created_at",
        )
        .order("created_at", { ascending: true }),
      supabase.from("organisation_buckets").select("*").order("created_at", { ascending: true }),
      supabase.from("bucket_features").select("id, name"),
      supabase.from("organisation_bucket_features").select("bucket_id, feature_id"),
      supabase
        .from("organisation_portfolio_snapshots")
        .select("organisation_id, portfolio_rlusd, captured_at")
        .order("captured_at", { ascending: false }),
    ])

  const failed = [organisations, links, industries, invoices, buckets, features, linksFeatures, snapshots].find(
    (result) => result.error,
  )
  if (failed?.error) throw new Error(failed.error.message)

  const industryName = new Map((industries.data ?? []).map((row) => [row.id as string, row.name as string]))
  const industriesByOrg = new Map<string, string[]>()
  for (const link of links.data ?? []) {
    const name = industryName.get(link.industry_id as string)
    if (!name) continue
    const list = industriesByOrg.get(link.organisation_id as string) ?? []
    list.push(name)
    industriesByOrg.set(link.organisation_id as string, list)
  }

  const organisationName = new Map(
    (organisations.data ?? []).map((row) => [row.id as string, row.legal_name as string]),
  )
  const organisationCountry = new Map(
    (organisations.data ?? []).map((row) => [row.id as string, row.country as string]),
  )

  const featureName = new Map((features.data ?? []).map((row) => [row.id as string, row.name as string]))
  const featuresByBucket = new Map<string, string[]>()
  for (const link of linksFeatures.data ?? []) {
    const name = featureName.get(link.feature_id as string)
    if (!name) continue
    const list = featuresByBucket.get(link.bucket_id as string) ?? []
    list.push(name)
    featuresByBucket.set(link.bucket_id as string, list)
  }

  const portfolioByOrg = new Map<string, number>()
  for (const snapshot of snapshots.data ?? []) {
    const id = snapshot.organisation_id as string
    if (!portfolioByOrg.has(id)) portfolioByOrg.set(id, asNumber(snapshot.portfolio_rlusd))
  }

  const listedInvoices: MatchInvoice[] = (invoices.data ?? []).map((row) => {
    const sellerId = row.seller_organisation_id as string
    return {
      id: row.id as string,
      documentId: row.document_id as string,
      seller: organisationName.get(sellerId) ?? "Seller",
      obligor: organisationName.get(row.obligor_organisation_id as string) ?? "Obligor",
      buyerOrganisationId: (row.buyer_organisation_id as string | null) ?? null,
      repaid: Boolean(row.repaid),
      dueDate: row.due_date as string,
      createdAt: row.created_at as string,
      faceValue: asNumber(row.face_value),
      currency: row.currency as string,
      riskScore: asNumber(row.risk_score),
      sellerIndustries: industriesByOrg.get(sellerId) ?? [],
      sellerCountry: organisationCountry.get(sellerId) ?? "",
    }
  })

  const listedBuckets: ListedBucket[] = (buckets.data ?? []).map((row) => {
    const organisationId = row.organisation_id as string
    const status = row.status === "paused" ? "paused" : "active"
    const exposureKind = row.exposure_kind === "portfolio_percent" ? "portfolio_percent" : "flat_usd"
    return {
      id: row.id as string,
      name: row.name as string,
      investor: organisationName.get(organisationId) ?? "Investor",
      status,
      riskLow: asNumber(row.risk_low),
      riskHigh: asNumber(row.risk_high),
      faceMin: asNumber(row.face_min),
      faceMax: asNumber(row.face_max),
      tenorMin: asOptionalNumber(row.tenor_min),
      tenorMax: asOptionalNumber(row.tenor_max),
      industries: asList(row.industries),
      countries: asList(row.countries),
      currencies: asList(row.currencies),
      apr: asNumber(row.apr),
      exposureKind,
      exposureLimitUsd: asOptionalNumber(row.exposure_limit_usd),
      exposureLimitPercent: asOptionalNumber(row.exposure_limit_percent),
      exposureUsedUsd: asNumber(row.exposure_used_usd),
      portfolioRlusd: portfolioByOrg.get(organisationId) ?? null,
      organisationId,
      features: featuresByBucket.get(row.id as string) ?? [],
    }
  })

  return { invoices: listedInvoices, buckets: listedBuckets }
}
