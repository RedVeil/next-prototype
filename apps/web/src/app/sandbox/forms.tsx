"use client"

import { useActionState, type FormEvent } from "react"
import { setManualScore, updateRiskScores } from "@/app/risk/actions"
import {
  createBucket,
  createInvoice,
  createOrganisation,
  createUser,
  setFunds,
  updateBucket,
  updateInvoice,
  updateOrganisation,
  updateUser,
  type ActionState,
} from "./actions"
import { checkDraft, textDraft, useFormDraft } from "./drafts"
import type { BucketRecord, InvoiceRecord, NamedOrganisation, OrganisationRecord, UserRecord } from "./types"

const field =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
const label = "block text-sm"
const button =
  "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"

function Feedback({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null
  return (
    <p className={`text-sm ${state.error ? "text-red-700" : "text-muted"}`}>
      {state.error ?? state.message}
    </p>
  )
}

function draftForm(remember: (event: FormEvent<HTMLFormElement>) => void) {
  return { onInput: remember, onChange: remember }
}

export function OrganisationForm({
  industries,
  initial,
  onSaved,
}: {
  industries: string[]
  initial?: OrganisationRecord | null
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(
    initial ? updateOrganisation : createOrganisation,
    null,
  )
  const { draft, remember } = useFormDraft(
    initial ? `organisation:${initial.id}` : "organisation:new",
    state,
    onSaved,
  )
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial?.payment_method_id ? (
        <input type="hidden" name="payment_method_id" value={initial.payment_method_id} />
      ) : null}
      <label className={label}>
        Legal name
        <input name="legal_name" required defaultValue={textDraft(draft, "legal_name", initial?.legal_name)} className={field} />
      </label>
      <label className={label}>
        Company id
        <input name="company_id" required defaultValue={textDraft(draft, "company_id", initial?.company_id)} className={field} />
      </label>
      <label className={label}>
        Country
        <input name="country" defaultValue={textDraft(draft, "country", initial?.country ?? "BR")} className={field} />
      </label>
      <label className={label}>
        Description
        <input name="description" defaultValue={textDraft(draft, "description", initial?.description)} className={field} />
      </label>
      {["industry_1", "industry_2", "industry_3"].map((name, index) => (
        <label key={name} className={label}>
          Industry {index + 1}
          <input
            name={name}
            list="industry-names"
            defaultValue={textDraft(draft, name, initial?.industries[index] ?? "")}
            className={field}
          />
        </label>
      ))}
      <datalist id="industry-names">
        {industries.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <label className="flex items-center gap-2 text-sm">
        <input name="use_brl" type="checkbox" defaultChecked={checkDraft(draft, "use_brl", initial?.use_brl)} />
        BRL for invoices
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="use_rlusd" type="checkbox" defaultChecked={checkDraft(draft, "use_rlusd", initial?.use_rlusd)} />
        RLUSD for funding
      </label>
      <label className={label}>
        Payment method
        <select name="method" className={field} defaultValue={textDraft(draft, "method", initial?.method ?? "")}>
          <option value="">None</option>
          <option value="pix">PIX</option>
          <option value="iban">IBAN</option>
          <option value="xrpl">XRPL</option>
          <option value="paypal">PayPal</option>
        </select>
      </label>
      <label className={label}>
        Payment identifier
        <input name="identifier" defaultValue={textDraft(draft, "identifier", initial?.identifier)} className={field} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Save organisation"}
      </button>
    </form>
  )
}

export function UserForm({
  organisations,
  initial,
  onSaved,
}: {
  organisations: NamedOrganisation[]
  initial?: UserRecord | null
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(initial ? updateUser : createUser, null)
  const { draft, remember } = useFormDraft(initial ? `user:${initial.id}` : "user:new", state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label className={label}>
        Username
        <input name="username" required defaultValue={textDraft(draft, "username", initial?.username)} className={field} />
      </label>
      <label className={label}>
        Login label
        <input name="login" required defaultValue={textDraft(draft, "login", initial?.login)} className={field} />
      </label>
      <label className={label}>
        Role
        <select name="role" className={field} defaultValue={textDraft(draft, "role", initial?.role || "seller")}>
          <option value="seller">Seller</option>
          <option value="investor">Investor</option>
        </select>
      </label>
      <label className={label}>
        Organisation
        <select
          name="organisation_id"
          required
          className={field}
          defaultValue={textDraft(draft, "organisation_id", initial?.organisation_id ?? "")}
        >
          <option value="" disabled>
            Choose
          </option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.legal_name}
            </option>
          ))}
        </select>
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : initial ? "Save user" : "Link user"}
      </button>
    </form>
  )
}

export function FundsForm({
  initial,
  onSaved,
}: {
  initial: Pick<OrganisationRecord, "id" | "legal_name" | "available_rlusd" | "portfolio_rlusd">
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(setFunds, null)
  const { draft, remember } = useFormDraft(`funds:${initial.id}`, state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      <input type="hidden" name="organisation_id" value={initial.id} />
      <p className="text-sm">
        <span className="text-muted">Organisation</span>
        <span className="mt-1 block">{initial.legal_name}</span>
      </p>
      <label className={label}>
        Available RLUSD
        <input
          name="available_rlusd"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "available_rlusd", initial.available_rlusd)}
          className={field}
        />
      </label>
      <label className={label}>
        Portfolio RLUSD
        <input
          name="portfolio_rlusd"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "portfolio_rlusd", initial.portfolio_rlusd)}
          className={field}
        />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Save funds"}
      </button>
    </form>
  )
}

export function InvoiceForm({
  organisations,
  initial,
  onSaved,
}: {
  organisations: NamedOrganisation[]
  initial?: InvoiceRecord | null
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(initial ? updateInvoice : createInvoice, null)
  const { draft, remember } = useFormDraft(initial ? `invoice:${initial.id}` : "invoice:new", state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial?.line_id ? <input type="hidden" name="line_id" value={initial.line_id} /> : null}
      <label className={label}>
        Document id
        <input name="document_id" required defaultValue={textDraft(draft, "document_id", initial?.document_id)} className={field} />
      </label>
      <label className={label}>
        Seller
        <select
          name="seller_organisation_id"
          required
          className={field}
          defaultValue={textDraft(draft, "seller_organisation_id", initial?.seller_organisation_id ?? "")}
        >
          <option value="" disabled>
            Choose
          </option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.legal_name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Obligor
        <select
          name="obligor_organisation_id"
          className={field}
          defaultValue={textDraft(draft, "obligor_organisation_id", initial?.obligor_organisation_id ?? "")}
        >
          <option value="">Add a new obligor</option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.legal_name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        New obligor name
        <input name="obligor_name" defaultValue={textDraft(draft, "obligor_name")} className={field} />
      </label>
      <label className={label}>
        New obligor company id
        <input name="obligor_company_id" defaultValue={textDraft(draft, "obligor_company_id")} className={field} />
      </label>
      <label className={label}>
        Face value
        <input
          name="face_value"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "face_value", initial ? initial.face_value : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Currency
        <input name="currency" defaultValue={textDraft(draft, "currency", initial?.currency ?? "BRL")} required className={field} />
      </label>
      <label className={label}>
        Origination date
        <input
          name="origination_date"
          type="date"
          required
          defaultValue={textDraft(draft, "origination_date", initial?.origination_date)}
          className={field}
        />
      </label>
      <label className={label}>
        Due date
        <input name="due_date" type="date" required defaultValue={textDraft(draft, "due_date", initial?.due_date)} className={field} />
      </label>
      <label className={label}>
        Product
        <input name="product" required defaultValue={textDraft(draft, "product", initial?.product)} className={field} />
      </label>
      <label className={label}>
        Amount
        <input
          name="line_amount"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "line_amount", initial ? initial.line_amount : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Unit
        <input
          name="unit"
          required
          placeholder="tons, units, hours"
          defaultValue={textDraft(draft, "unit", initial?.unit)}
          className={field}
        />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Save invoice"}
      </button>
    </form>
  )
}

export function BucketForm({
  organisations,
  features,
  initial,
  onSaved,
}: {
  organisations: NamedOrganisation[]
  features: { id: string; name: string }[]
  initial?: BucketRecord | null
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(initial ? updateBucket : createBucket, null)
  const { draft, remember } = useFormDraft(initial ? `bucket:${initial.id}` : "bucket:new", state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label className={label}>
        Investor
        <select
          name="organisation_id"
          required
          className={field}
          defaultValue={textDraft(draft, "organisation_id", initial?.organisation_id ?? "")}
        >
          <option value="" disabled>
            Choose
          </option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.legal_name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Name
        <input name="name" required defaultValue={textDraft(draft, "name", initial?.name)} className={field} />
      </label>
      <label className={label}>
        Status
        <select name="status" className={field} defaultValue={textDraft(draft, "status", initial?.status || "active")}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </label>
      <label className={label}>
        Risk low
        <input
          name="risk_low"
          type="number"
          min="0"
          max="10000"
          step="1"
          required
          defaultValue={textDraft(draft, "risk_low", initial ? initial.risk_low : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Risk high
        <input
          name="risk_high"
          type="number"
          min="0"
          max="10000"
          step="1"
          required
          defaultValue={textDraft(draft, "risk_high", initial ? initial.risk_high : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Face minimum
        <input
          name="face_min"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "face_min", initial ? initial.face_min : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Face maximum
        <input
          name="face_max"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={textDraft(draft, "face_max", initial ? initial.face_max : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Tenor minimum days
        <input
          name="tenor_min"
          type="number"
          min="0"
          step="1"
          defaultValue={textDraft(draft, "tenor_min", initial?.tenor_min ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        Tenor maximum days
        <input
          name="tenor_max"
          type="number"
          min="0"
          step="1"
          defaultValue={textDraft(draft, "tenor_max", initial?.tenor_max ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        Industries
        <input
          name="industries"
          placeholder="Comma separated. Blank matches any."
          defaultValue={textDraft(draft, "industries", initial?.industries.join(", ") ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        Countries
        <input
          name="countries"
          placeholder="BR, US. Blank matches any."
          defaultValue={textDraft(draft, "countries", initial?.countries.join(", ") ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        Currencies
        <input
          name="currencies"
          placeholder="BRL, USD. Blank matches any."
          defaultValue={textDraft(draft, "currencies", initial?.currencies.join(", ") ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        APR as a fraction
        <input
          name="apr"
          type="number"
          min="0"
          step="0.0001"
          required
          placeholder="0.12 is 12%"
          defaultValue={textDraft(draft, "apr", initial ? initial.apr : undefined)}
          className={field}
        />
      </label>
      <label className={label}>
        Exposure
        <select name="exposure_kind" className={field} defaultValue={textDraft(draft, "exposure_kind", initial?.exposure_kind || "flat_usd")}>
          <option value="flat_usd">Flat USD</option>
          <option value="portfolio_percent">Percent of portfolio</option>
        </select>
      </label>
      <label className={label}>
        Flat USD limit
        <input
          name="exposure_limit_usd"
          type="number"
          min="0"
          step="0.01"
          defaultValue={textDraft(draft, "exposure_limit_usd", initial?.exposure_limit_usd ?? "")}
          className={field}
        />
      </label>
      <label className={label}>
        Portfolio percent
        <input
          name="exposure_limit_percent"
          type="number"
          min="0"
          step="0.01"
          defaultValue={textDraft(draft, "exposure_limit_percent", initial?.exposure_limit_percent ?? "")}
          className={field}
        />
      </label>
      {features.map((feature) => {
        const mode = initial?.feature_modes.find((choice) => choice.id === feature.id)?.mode ?? "any"
        return (
          <label key={feature.id} className={label}>
            {feature.name}
            <select
              name={`feature_mode_${feature.id}`}
              className={field}
              defaultValue={textDraft(draft, `feature_mode_${feature.id}`, mode)}
            >
              <option value="any">Any</option>
              <option value="yes">Has</option>
              <option value="no">Has not</option>
            </select>
          </label>
        )
      })}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Save bucket"}
      </button>
    </form>
  )
}

export function WeightsForm({
  parameters,
  onSaved,
}: {
  parameters: { key: string; label: string; weight: number }[]
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(updateRiskScores, null)
  const { draft, remember } = useFormDraft("weights", state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      {parameters.map((parameter) => (
        <label key={parameter.key} className={label}>
          {parameter.label}
          <input
            name={parameter.key}
            type="number"
            min="0"
            step="1"
            required
            defaultValue={textDraft(draft, parameter.key, parameter.weight)}
            className={field}
          />
        </label>
      ))}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Save scoring"}
      </button>
    </form>
  )
}

export function ManualScoreForm({
  organisationId,
  baseline,
  onSaved,
}: {
  organisationId: string
  baseline: number
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState(setManualScore, null)
  const { draft, remember } = useFormDraft(`score:${organisationId}`, state, onSaved)
  return (
    <form action={action} className="grid gap-3" {...draftForm(remember)}>
      <input type="hidden" name="organisation_id" value={organisationId} />
      <label className={label}>
        Baseline
        <input
          name="risk_score_base"
          type="number"
          min="0"
          max="10000"
          step="1"
          required
          defaultValue={textDraft(draft, "risk_score_base", baseline)}
          className={field}
        />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving" : "Set score"}
      </button>
    </form>
  )
}
