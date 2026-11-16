export type MatchCheck = {
  name: string
  pass: boolean
  detail: string
}

export type MatchBucket = {
  id: string
  name: string
  investor: string
  status: "active" | "paused"
  riskLow: number
  riskHigh: number
  faceMin: number
  faceMax: number
  tenorMin: number | null
  tenorMax: number | null
  industries: string[]
  countries: string[]
  currencies: string[]
  apr: number
  exposureKind: "flat_usd" | "portfolio_percent"
  exposureLimitUsd: number | null
  exposureLimitPercent: number | null
  exposureUsedUsd: number
  portfolioRlusd: number | null
  organisationId: string
}

export type MatchInvoice = {
  id: string
  documentId: string
  seller: string
  obligor: string
  buyerOrganisationId: string | null
  blockedBuyerIds?: string[]
  repaid: boolean
  dueDate: string
  createdAt: string
  faceValue: number
  currency: string
  riskScore: number
  sellerIndustries: string[]
  sellerCountry: string
}

export type BucketOutcome = {
  bucketId: string
  label: string
  checks: MatchCheck[]
  apr: number
  price: number | null
  offer: number | null
  discountPercent: number | null
  priceDetail: string | null
  eligible: boolean
  winner: boolean
  tied: boolean
}

export type InvoiceOutcome = {
  invoiceId: string
  documentId: string
  seller: string
  obligor: string
  faceValue: number
  currency: string
  riskScore: number
  dueDate: string
  skipped: string | null
  days: number | null
  usdAmount: number | null
  winnerLabel: string | null
  price: number | null
  offer: number | null
  discountPercent: number | null
  priceDetail: string | null
  winnerOrganisationId: string | null
  winnerBucketId: string | null
  tiedLabels: string[]
  eligible: EligibleBucket[]
  buckets: BucketOutcome[]
}

export type EligibleBucket = {
  bucketId: string
  organisationId: string
  label: string
  apr: number
  price: number
  offer: number
  discountPercent: number
  priceDetail: string
}

export function daysUntilDue(today: string, due: string) {
  const start = Date.parse(`${today}T00:00:00Z`)
  const end = Date.parse(`${due}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.round((end - start) / 86_400_000)
}

function money(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function apyLabel(apr: number) {
  return `${(apr * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`
}

function priceAmount(face: number, apr: number, days: number) {
  return (face * apr * days) / 365
}

function discountPercent(face: number, discount: number) {
  if (face === 0) return 0
  return (discount / face) * 100
}

function shareLabel(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`
}

function priceDetail(face: number, currency: string, apr: number, days: number, due: string) {
  const discount = priceAmount(face, apr, days)
  const offer = face - discount
  return `${money(face)} ${currency} face × ${apyLabel(apr)} target APY × ${days} days until ${due} ÷ 365. Offer ${money(offer)} ${currency}. Discount ${money(discount)} ${currency} (${shareLabel(discountPercent(face, discount))}).`
}

export function earlierSaleCooldownMinutes() {
  const raw = process.env.FAILED_SALE_COOLDOWN_MINUTES?.trim()
  if (!raw) return 5
  const minutes = Number(raw)
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("FAILED_SALE_COOLDOWN_MINUTES must be zero or greater.")
  }
  return minutes
}

function cooldownPhrase(minutes: number) {
  const amount = minutes.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return `${amount} ${minutes === 1 ? "minute" : "minutes"}`
}

function listed(values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(", ") : "none"
}

function shares(seller: string[], selected: string[]) {
  const wanted = new Set(selected.map((value) => value.trim().toLowerCase()).filter(Boolean))
  if (wanted.size === 0) return null
  return seller.map((value) => value.trim()).find((value) => wanted.has(value.toLowerCase())) ?? null
}

function selected(values: string[], value: string) {
  const wanted = values.map((item) => item.trim().toLowerCase()).filter(Boolean)
  if (wanted.length === 0) return null
  return wanted.includes(value.trim().toLowerCase())
}

function invoiceUsd(face: number, currency: string, rate: number) {
  const code = currency.trim().toUpperCase()
  if (code === "USD") return { amount: face, detail: `${money(face)} USD` }
  if (code === "BRL") return { amount: face * rate, detail: `${money(face)} BRL at ${rate} is ${money(face * rate)} USD` }
  return null
}

function exposureLimit(bucket: MatchBucket) {
  if (bucket.exposureKind === "flat_usd") {
    if (bucket.exposureLimitUsd === null) return { error: "The flat USD limit is missing." }
    return { limit: bucket.exposureLimitUsd, detail: `a flat limit of ${money(bucket.exposureLimitUsd)} USD` }
  }
  if (bucket.portfolioRlusd === null) return { error: "This investor has no portfolio snapshot." }
  if (bucket.exposureLimitPercent === null) return { error: "The percent limit is missing." }
  const limit = (bucket.portfolioRlusd * bucket.exposureLimitPercent) / 100
  return {
    limit,
    detail: `a portfolio of ${money(bucket.portfolioRlusd)} RLUSD at ${bucket.exposureLimitPercent}% is a limit of ${money(limit)} USD`,
  }
}

function checksFor(
  bucket: MatchBucket,
  invoice: MatchInvoice,
  days: number,
  used: number,
  rate: number,
) {
  const checks: MatchCheck[] = []
  checks.push(
    bucket.status === "active"
      ? { name: "Status", pass: true, detail: "Active." }
      : { name: "Status", pass: false, detail: "Paused." },
  )

  const riskPass = invoice.riskScore >= bucket.riskLow && invoice.riskScore <= bucket.riskHigh
  checks.push({
    name: "Risk",
    pass: riskPass,
    detail: riskPass
      ? `Score ${invoice.riskScore} is inside ${bucket.riskLow}–${bucket.riskHigh}.`
      : `Score ${invoice.riskScore} is outside ${bucket.riskLow}–${bucket.riskHigh}.`,
  })

  const facePass = invoice.faceValue >= bucket.faceMin && invoice.faceValue <= bucket.faceMax
  checks.push({
    name: "Face",
    pass: facePass,
    detail: facePass
      ? `Face ${money(invoice.faceValue)} ${invoice.currency} is inside ${money(bucket.faceMin)}–${money(bucket.faceMax)}.`
      : `Face ${money(invoice.faceValue)} ${invoice.currency} is outside ${money(bucket.faceMin)}–${money(bucket.faceMax)}.`,
  })

  if (bucket.tenorMin === null && bucket.tenorMax === null) {
    checks.push({ name: "Tenor", pass: true, detail: "Any." })
  } else {
    const below = bucket.tenorMin !== null && days < bucket.tenorMin
    const above = bucket.tenorMax !== null && days > bucket.tenorMax
    const band =
      bucket.tenorMin !== null && bucket.tenorMax !== null
        ? `${bucket.tenorMin}–${bucket.tenorMax}`
        : bucket.tenorMin !== null
          ? `at least ${bucket.tenorMin}`
          : `at most ${bucket.tenorMax}`
    checks.push({
      name: "Tenor",
      pass: !below && !above,
      detail: below
        ? `${days} days is below ${bucket.tenorMin}.`
        : above
          ? `${days} days is above ${bucket.tenorMax}.`
          : `${days} days is inside ${band}.`,
    })
  }

  if (!bucket.industries.some((value) => value.trim())) {
    checks.push({ name: "Industry", pass: true, detail: "Any." })
  } else {
    const shared = shares(invoice.sellerIndustries, bucket.industries)
    checks.push({
      name: "Industry",
      pass: Boolean(shared),
      detail: shared
        ? `Seller shares ${shared}.`
        : `Seller industries are ${listed(invoice.sellerIndustries)}. Bucket wants ${listed(bucket.industries)}.`,
    })
  }

  const country = selected(bucket.countries, invoice.sellerCountry)
  checks.push({
    name: "Country",
    pass: country !== false,
    detail:
      country === null
        ? "Any."
        : country
          ? `Seller country ${invoice.sellerCountry} is selected.`
          : `Seller country is ${invoice.sellerCountry || "blank"}. Bucket wants ${listed(bucket.countries)}.`,
  })

  const currency = selected(bucket.currencies, invoice.currency)
  checks.push({
    name: "Currency",
    pass: currency !== false,
    detail:
      currency === null
        ? "Any."
        : currency
          ? `Currency ${invoice.currency} is selected.`
          : `Currency is ${invoice.currency}. Bucket wants ${listed(bucket.currencies)}.`,
  })

  const converted = invoiceUsd(invoice.faceValue, invoice.currency, rate)
  if (!converted) {
    checks.push({
      name: "Exposure",
      pass: false,
      detail: `${invoice.currency} is not converted in this run. Only BRL and USD are.`,
    })
  } else {
    const limit = exposureLimit(bucket)
    if ("error" in limit) {
      checks.push({ name: "Exposure", pass: false, detail: `${converted.detail}. ${limit.error}` })
    } else {
      const next = used + converted.amount
      const pass = next <= limit.limit + 1e-6
      checks.push({
        name: "Exposure",
        pass,
        detail: pass
          ? `${converted.detail}. Used ${money(used)} + ${money(converted.amount)} = ${money(next)} USD against ${limit.detail}.`
          : `${converted.detail}. Used ${money(used)} + ${money(converted.amount)} = ${money(next)} USD, above ${limit.detail}.`,
      })
    }
  }

  return checks
}

function skipReason(invoice: MatchInvoice, today: string) {
  const reasons: string[] = []
  if (invoice.buyerOrganisationId) reasons.push("Already sold.")
  if (invoice.repaid) reasons.push("Already repaid.")
  const days = daysUntilDue(today, invoice.dueDate)
  if (days === null) reasons.push("Due date is missing.")
  else if (days < 0) reasons.push(`Due date ${invoice.dueDate} is before ${today}.`)
  return reasons.length > 0 ? reasons.join(" ") : null
}

export function listEligibleBuckets(input: {
  today: string
  rate: number
  invoice: MatchInvoice
  buckets: MatchBucket[]
}): EligibleBucket[] {
  if (skipReason(input.invoice, input.today)) return []
  const days = daysUntilDue(input.today, input.invoice.dueDate) ?? 0
  const blocked = new Set(input.invoice.blockedBuyerIds ?? [])
  const eligible: EligibleBucket[] = []
  for (const bucket of input.buckets) {
    const checks = checksFor(bucket, input.invoice, days, bucket.exposureUsedUsd, input.rate)
    if (blocked.has(bucket.organisationId)) {
      checks.push({
        name: "Earlier sale",
        pass: false,
        detail: `This investor's earlier sale of this invoice failed or expired in the last ${cooldownPhrase(earlierSaleCooldownMinutes())}.`,
      })
    }
    if (!checks.every((check) => check.pass)) continue
    const price = priceAmount(input.invoice.faceValue, bucket.apr, days)
    eligible.push({
      bucketId: bucket.id,
      organisationId: bucket.organisationId,
      label: `${bucket.name} · ${bucket.investor}`,
      apr: bucket.apr,
      price,
      offer: input.invoice.faceValue - price,
      discountPercent: discountPercent(input.invoice.faceValue, price),
      priceDetail: priceDetail(input.invoice.faceValue, input.invoice.currency, bucket.apr, days, input.invoice.dueDate),
    })
  }
  return eligible
}

export function runMatch(input: {
  today: string
  rate: number
  invoices: MatchInvoice[]
  buckets: MatchBucket[]
}): InvoiceOutcome[] {
  const cooldownMinutes = earlierSaleCooldownMinutes()
  const ordered = [...input.invoices].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })

  return ordered.map((invoice) => {
    const skipped = skipReason(invoice, input.today)
    const days = daysUntilDue(input.today, invoice.dueDate)
    const converted = invoiceUsd(invoice.faceValue, invoice.currency, input.rate)
    const shared = {
      invoiceId: invoice.id,
      documentId: invoice.documentId,
      seller: invoice.seller,
      obligor: invoice.obligor,
      faceValue: invoice.faceValue,
      currency: invoice.currency,
      riskScore: invoice.riskScore,
      dueDate: invoice.dueDate,
      days,
      usdAmount: converted?.amount ?? null,
    }
    if (skipped) {
      return {
        ...shared,
        skipped,
        winnerLabel: null,
        price: null,
        offer: null,
        discountPercent: null,
        priceDetail: null,
        winnerOrganisationId: null,
        winnerBucketId: null,
        tiedLabels: [],
        eligible: [],
        buckets: [],
      }
    }

    const blockedBuyers = new Set(invoice.blockedBuyerIds ?? [])
    const attempts = input.buckets.map((bucket) => {
      const checks = checksFor(bucket, invoice, days ?? 0, bucket.exposureUsedUsd, input.rate)
      if (blockedBuyers.has(bucket.organisationId)) {
        checks.push({
          name: "Earlier sale",
          pass: false,
          detail: `This investor's earlier sale of this invoice failed or expired in the last ${cooldownPhrase(cooldownMinutes)}.`,
        })
      }
      const eligible = checks.every((check) => check.pass)
      const tenor = days ?? 0
      const price = eligible ? priceAmount(invoice.faceValue, bucket.apr, tenor) : null
      return {
        bucketId: bucket.id,
        label: `${bucket.name} · ${bucket.investor}`,
        checks,
        apr: bucket.apr,
        price,
        offer: price === null ? null : invoice.faceValue - price,
        discountPercent: price === null ? null : discountPercent(invoice.faceValue, price),
        priceDetail:
          price === null ? null : priceDetail(invoice.faceValue, invoice.currency, bucket.apr, tenor, invoice.dueDate),
        eligible,
        winner: false,
        tied: false,
      }
    })

    const eligible = listEligibleBuckets({ today: input.today, rate: input.rate, invoice, buckets: input.buckets })

    return {
      ...shared,
      skipped: null,
      winnerLabel: null,
      price: null,
      offer: null,
      winnerOrganisationId: null,
      winnerBucketId: null,
      discountPercent: null,
      priceDetail: null,
      tiedLabels: [],
      eligible,
      buckets: attempts,
    }
  })
}
