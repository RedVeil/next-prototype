import Link from "next/link"
import type { MarketData } from "./market-data"
import { CreateMarketBucket, type MarketBucketDraft } from "./market-bucket"
import { FilterDropdown } from "./market-filters"
import { RISK_HIGH_DEFAULT, RISK_LOW_DEFAULT, marketFiltersActive, type MarketQuery } from "./market-query"
import { formatUsd, InvoiceStatsGrid, joinList, weightedRateText } from "./market-present"

const fieldClass = "h-10 rounded-md border border-border bg-white px-3 text-sm"

function textOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }))
}

function narrowedList(checked: string[], options: string[]) {
  if (options.length === 0 || checked.length === 0 || checked.length === options.length) return ""
  return checked.join(", ")
}

function bucketDraft(query: MarketQuery, data: MarketData): MarketBucketDraft {
  const countries = narrowedList(data.checkedRegions, data.regions)
  const currencies = narrowedList(data.checkedCurrencies, data.currencies)
  const industries = narrowedList(data.checkedIndustries, data.industries)
  const riskLow = query.riskLow ?? RISK_LOW_DEFAULT
  const riskHigh = query.riskHigh ?? RISK_HIGH_DEFAULT
  const riskChanged = riskLow !== RISK_LOW_DEFAULT || riskHigh !== RISK_HIGH_DEFAULT
  const modes = new Map(data.featureChoices.map((choice) => [choice.id, choice.mode]))
  const featureNames = data.features
    .flatMap((feature) => {
      const mode = modes.get(feature.id) ?? "any"
      if (mode === "yes") return [feature.name]
      if (mode === "no") return [`no ${feature.name}`]
      return []
    })
    .join(", ")
  const name = [countries, currencies, industries, riskChanged ? `risk ${riskLow}–${riskHigh}` : "", featureNames]
    .filter(Boolean)
    .join(" · ")
  return {
    name,
    riskLow,
    riskHigh,
    countries,
    currencies,
    industries,
    featureChoices: data.featureChoices,
  }
}

export function MarketExplorer({ query, data }: { query: MarketQuery; data: MarketData }) {
  const active = marketFiltersActive(query)
  const draft = bucketDraft(query, data)
  const weightedRates = data.buckets.flatMap((bucket) =>
    bucket.remainingUsd !== null && bucket.remainingUsd > 0 ? [{ apr: bucket.apr, amount: bucket.remainingUsd }] : [],
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Market</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every option starts on. Turning one off keeps it off. A company or invoice must match every group, and any choice
        still on inside a group is enough.
      </p>

      <form method="get" action="/investor/market" className="mt-6 rounded-lg border border-border bg-white p-5">
        <input type="hidden" name="applied" value="1" />
        <div className="flex flex-wrap items-start gap-3">
          <FilterDropdown name="region" label="Region" options={textOptions(data.regions)} selected={data.checkedRegions} />
          <FilterDropdown
            name="currency"
            label="Currency"
            options={textOptions(data.currencies)}
            selected={data.checkedCurrencies}
          />
          <FilterDropdown
            name="industry"
            label="Industry"
            options={textOptions(data.industries)}
            selected={data.checkedIndustries}
          />
          <FilterDropdown
            key={data.checkedCompanies.join("\n")}
            name="company"
            label="Company"
            searchable
            scopeName="companyScope"
            options={data.companyOptions.map((company) => ({
              value: company.id,
              label: company.legalName,
              detail: company.companyId,
            }))}
            selected={data.checkedCompanies}
          />
        </div>
        <fieldset className="mt-5">
          <legend className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Toggles</legend>
          <p className="mt-2 text-sm text-neutral-500">
            Each toggle starts on Any. Has and Has not apply together, on the market and on a new bucket.
          </p>
          {data.features.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">None yet.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {data.features.map((feature) => {
                const mode = data.featureChoices.find((choice) => choice.id === feature.id)?.mode ?? "any"
                return (
                  <label key={feature.id} className="text-sm text-neutral-600">
                    {feature.name}
                    <select
                      name="feature"
                      key={`${feature.id}:${mode}`}
                      defaultValue={`${feature.id}:${mode}`}
                      className={`${fieldClass} mt-1 block`}
                    >
                      <option value={`${feature.id}:any`}>Any</option>
                      <option value={`${feature.id}:yes`}>Has</option>
                      <option value={`${feature.id}:no`}>Has not</option>
                    </select>
                  </label>
                )
              })}
            </div>
          )}
        </fieldset>
        <div className="mt-5 max-w-xs">
          <fieldset>
            <legend className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Risk score</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-sm text-neutral-600">
                Low
                <input
                  name="riskLow"
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  defaultValue={query.riskLow ?? 0}
                  className={`${fieldClass} mt-1 w-full`}
                />
              </label>
              <label className="text-sm text-neutral-600">
                High
                <input
                  name="riskHigh"
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  defaultValue={query.riskHigh ?? 10000}
                  className={`${fieldClass} mt-1 w-full`}
                />
              </label>
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="submit" className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
            Apply
          </button>
          <CreateMarketBucket draft={draft} features={data.features} />
          {active ? (
            <Link href="/investor/market" className="text-sm font-medium text-neutral-900 underline">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Invoices</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Invoices match every group. Region and industry use the seller. Currency and risk use the invoice. A selected
          company matches as seller or obligor.
        </p>
        <InvoiceStatsGrid stats={data.invoices} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Buckets</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Average and median APR are weighted by remaining capacity. A toggle set to Has or Has not must pass, and Any is ignored.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <article className="rounded-lg border border-border bg-white p-5">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Average APR</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{weightedRateText(weightedRates, "average")}</p>
          </article>
          <article className="rounded-lg border border-border bg-white p-5">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Median APR</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{weightedRateText(weightedRates, "median")}</p>
          </article>
          <article className="rounded-lg border border-border bg-white p-5">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Remaining capacity</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatUsd(data.capacityUsd)}</p>
          </article>
        </div>
        {data.unpricedBuckets > 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            Buckets with no computable limit are left out of the average, median, and capacity total.
          </p>
        ) : null}
        {data.buckets.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No active buckets overlap these filters.</p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Companies</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Selected companies that also match region, industry, currency, and risk. A company that only invests is left out.
          A company that invests and sells stays in.
        </p>
        {data.companies.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No companies match these filters.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs tracking-wide text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Company id</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Industries</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Currencies</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((company) => (
                  <tr key={company.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/investor/companies/${company.id}`} className="font-medium text-neutral-900 underline">
                        {company.legalName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{company.companyId}</td>
                    <td className="px-4 py-3">{company.country}</td>
                    <td className="px-4 py-3">{joinList(company.industries)}</td>
                    <td className="px-4 py-3 tabular-nums">{company.riskScore}</td>
                    <td className="px-4 py-3">{joinList(company.invoiceCurrencies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
