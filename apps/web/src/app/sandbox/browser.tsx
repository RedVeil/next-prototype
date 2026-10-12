"use client"

import { useActionState, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { scoreRisk } from "@/app/risk/actions"
import { acceptInvoice, repayInvoice, updateMatching } from "./actions"
import { BucketForm, FundsForm, InvoiceForm, ManualScoreForm, OrganisationForm, UserForm, WeightsForm } from "./forms"
import type { BucketRecord, DemoData, InvoiceRecord, OrganisationRecord, UserRecord } from "./types"

const addButton =
  "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
const th = "px-3 py-2 font-medium whitespace-nowrap"
const td = "px-3 py-2 align-top"
const row = "cursor-pointer border-t border-border hover:bg-background"

const tabs = [
  { id: "organisations", kind: "organisation", label: "Organisations", add: "Add organisation" },
  { id: "users", kind: "user", label: "Users", add: "Add user" },
  { id: "invoices", kind: "invoice", label: "Invoices", add: "Add invoice" },
  { id: "buckets", kind: "bucket", label: "Buckets", add: "Add bucket" },
] as const

type Tab = (typeof tabs)[number]["id"]

type Modal =
  | { kind: "organisation"; record: OrganisationRecord | null }
  | { kind: "user"; record: UserRecord | null }
  | { kind: "invoice"; record: InvoiceRecord | null }
  | { kind: "bucket"; record: BucketRecord | null }
  | { kind: "funds"; organisation: OrganisationRecord }
  | { kind: "score"; organisation: OrganisationRecord }

function modalKey(modal: Modal) {
  if (modal.kind === "funds" || modal.kind === "score") return `${modal.kind}-${modal.organisation.id}`
  return `${modal.kind}-${modal.record?.id ?? "new"}`
}

function modalTitle(modal: Modal) {
  if (modal.kind === "funds") return `Funds for ${modal.organisation.legal_name}`
  if (modal.kind === "score") return `Score for ${modal.organisation.legal_name}`
  if (modal.kind === "organisation") return modal.record ? "Edit organisation" : "New organisation"
  if (modal.kind === "user") return modal.record ? "Edit user" : "New user"
  if (modal.kind === "invoice") return modal.record ? "Edit invoice" : "New invoice"
  return modal.record ? "Edit bucket" : "New bucket"
}

function FormDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closedByCleanup = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      // close() queues a close event. In dev, React runs this cleanup once on
      // mount and then opens the dialog again. Ignore that queued event so it
      // does not clear the modal after the dialog has been reopened.
      closedByCleanup.current = true
      dialog.close()
    }
  }, [])

  function requestClose() {
    ref.current?.close()
  }

  function handleClose() {
    // A close event can arrive after the dialog has been opened again. If it is
    // still open, that event is stale and must not dismiss the form.
    if (closedByCleanup.current || ref.current?.open) {
      closedByCleanup.current = false
      return
    }
    onClose()
  }

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
      className="m-auto flex max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface p-6 text-foreground backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={requestClose} className="text-sm text-muted">
          Close
        </button>
      </div>
      <div className="mt-4 overflow-y-auto">{children}</div>
    </dialog>
  )
}

function Items({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-muted">None</span>
  return <span className="block max-w-56 whitespace-normal break-words">{values.join(", ")}</span>
}

function signed(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}

function Activity({
  activity,
  signedValues = false,
}: {
  activity: { count: number; face_value: number }
  signedValues?: boolean
}) {
  const count = signedValues ? signed(activity.count) : String(activity.count)
  const face = signedValues ? signed(activity.face_value) : String(activity.face_value)
  const neutral = signedValues && activity.count === 0 && activity.face_value === 0
  return (
    <div className={neutral ? "text-muted" : undefined}>
      <div>{count}</div>
      <div className="text-muted">{face} face</div>
    </div>
  )
}

function money(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function TradeNote({ state }: { state: { error?: string; message?: string } | null }) {
  if (!state?.error && !state?.message) return null
  return (
    <p className={`mt-1 max-w-56 text-xs ${state.error ? "text-red-700" : "text-muted"}`}>
      {state.error ?? state.message}
    </p>
  )
}

export function RiskToolbar({
  parameters,
}: {
  parameters: { key: string; label: string; weight: number }[]
}) {
  const [state, action, pending] = useActionState(scoreRisk, null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <form action={action}>
        <button type="submit" disabled={pending} className={addButton}>
          {pending ? "Scoring" : "Score risk"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      >
        Adjust Scoring
      </button>
      <TradeNote state={state} />
      {open ? (
        <FormDialog title="Adjust Scoring" onClose={close}>
          <WeightsForm parameters={parameters} onSaved={close} />
        </FormDialog>
      ) : null}
    </div>
  )
}

function UpdateMatching() {
  const [state, action, pending] = useActionState(updateMatching, null)
  return (
    <form action={action} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-60"
      >
        {pending ? "Updating" : "Update matching"}
      </button>
      <TradeNote state={state} />
    </form>
  )
}

function InvoiceOffer({ invoice }: { invoice: InvoiceRecord }) {
  const [acceptState, accept, acceptPending] = useActionState(acceptInvoice, null)
  const [repayState, repay, repayPending] = useActionState(repayInvoice, null)
  const tiny = "mt-2 rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-60"

  if (invoice.buyer) {
    return (
      <div>
        <div>{invoice.sold_price === null ? "Sold" : `${money(invoice.sold_price)} ${invoice.currency} sold`}</div>
        {invoice.repaid ? <div className="text-muted">Repaid</div> : null}
        {!invoice.repaid && invoice.repayment_amount > 0 ? (
          <div className="text-muted">
            {money(invoice.repayment_amount)} of {money(invoice.face_value)} repaid
          </div>
        ) : null}
        {invoice.repaid ? null : (
          <form
            action={repay}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <button type="submit" disabled={repayPending} className={tiny}>
              {repayPending ? "Repaying" : "Repay"}
            </button>
            <TradeNote state={repayState} />
          </form>
        )}
      </div>
    )
  }

  if (invoice.offer !== null && invoice.offer_rlusd !== null) {
    return (
      <div>
        <div>
          {money(invoice.offer)} {invoice.currency}
        </div>
        <div className="text-muted">
          {money(invoice.offer_rlusd)} RLUSD{invoice.offer_investor ? ` · ${invoice.offer_investor}` : ""}
        </div>
        <form
          action={accept}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <button type="submit" disabled={acceptPending} className={tiny}>
            {acceptPending ? "Accepting" : "Accept"}
          </button>
          <TradeNote state={acceptState} />
        </form>
      </div>
    )
  }

  return <span className="text-muted">{invoice.offer_detail ?? "No offer"}</span>
}

function openFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>, open: () => void) {
  if (event.target !== event.currentTarget) return
  if (event.key === "Enter") open()
}

export function DemoBrowser({ data }: { data: DemoData }) {
  const [tab, setTab] = useState<Tab>("organisations")
  const [modal, setModal] = useState<Modal | null>(null)
  const close = useCallback(() => setModal(null), [])
  const current = tabs.find((item) => item.id === tab) ?? tabs[0]
  const names = data.organisations.map((organisation) => ({
    id: organisation.id,
    legal_name: organisation.legal_name,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Demo data" className="flex gap-1 overflow-x-auto">
        {tabs.map((item) => {
          const active = item.id === tab
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                active ? "bg-surface font-medium" : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={addButton}
          onClick={() => setModal({ kind: current.kind, record: null })}
        >
          {current.add}
        </button>
        {tab === "invoices" ? <UpdateMatching /> : null}
      </div>
      <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
        {tab === "organisations" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Legal name</th>
                <th className={th}>Country</th>
                <th className={th}>Industries</th>
                <th className={th}>Risk score</th>
                <th className={th}>Funds</th>
                <th className={th}>Invoices created</th>
                <th className={th}>Bought − sold</th>
                <th className={th}>Invoices repaid</th>
              </tr>
            </thead>
            <tbody>
              {data.organisations.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.organisations.map((organisation) => (
                <tr
                  key={organisation.id}
                  tabIndex={0}
                  className={row}
                  onClick={() => setModal({ kind: "organisation", record: organisation })}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () => setModal({ kind: "organisation", record: organisation }))
                  }
                >
                  <td className={td}>{organisation.legal_name}</td>
                  <td className={td}>{organisation.country}</td>
                  <td className={td}>{organisation.industries.join(", ")}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div>{organisation.risk_score}</div>
                    <button
                      type="button"
                      className="mt-2 rounded-lg border border-border px-2 py-1 text-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        setModal({ kind: "score", organisation })
                      }}
                    >
                      Edit score
                    </button>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div>{organisation.available_rlusd} available</div>
                    <div className="text-muted">{organisation.portfolio_rlusd} portfolio</div>
                    <button
                      type="button"
                      className="mt-2 rounded-lg border border-border px-2 py-1 text-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        setModal({ kind: "funds", organisation })
                      }}
                    >
                      Funds
                    </button>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Activity activity={organisation.invoices_created} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Activity activity={organisation.invoices_traded} signedValues />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Activity activity={organisation.invoices_repaid} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "users" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Username</th>
                <th className={th}>Login</th>
                <th className={th}>Role</th>
                <th className={th}>Organisation</th>
                <th className={th}>Created invoices</th>
                <th className={th}>Bought invoices</th>
                <th className={th}>Buckets</th>
              </tr>
            </thead>
            <tbody>
              {data.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.users.map((user) => (
                <tr
                  key={user.id}
                  tabIndex={0}
                  className={row}
                  onClick={() => setModal({ kind: "user", record: user })}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () => setModal({ kind: "user", record: user }))
                  }
                >
                  <td className={td}>{user.username}</td>
                  <td className={td}>{user.login}</td>
                  <td className={td}>{user.role}</td>
                  <td className={td}>{user.organisation}</td>
                  <td className={td}>
                    <Items values={user.created_invoices} />
                  </td>
                  <td className={td}>
                    <Items values={user.bought_invoices} />
                  </td>
                  <td className={td}>
                    {user.role === "investor" ? <Items values={user.buckets} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "invoices" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Document</th>
                <th className={th}>Seller</th>
                <th className={th}>Obligor</th>
                <th className={th}>Buyer</th>
                <th className={th}>Face value</th>
                <th className={th}>Currency</th>
                <th className={th}>Risk score</th>
                <th className={th}>Offer</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  tabIndex={0}
                  className={row}
                  onClick={() => setModal({ kind: "invoice", record: invoice })}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () => setModal({ kind: "invoice", record: invoice }))
                  }
                >
                  <td className={td}>{invoice.document_id}</td>
                  <td className={td}>{invoice.seller}</td>
                  <td className={td}>{invoice.obligor}</td>
                  <td className={td}>{invoice.buyer || "None"}</td>
                  <td className={td}>{invoice.face_value}</td>
                  <td className={td}>{invoice.currency}</td>
                  <td className={td}>{invoice.risk_score}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <InvoiceOffer invoice={invoice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "buckets" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Investor</th>
                <th className={th}>Status</th>
                <th className={th}>Risk</th>
                <th className={th}>APR</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.buckets.map((bucket) => (
                <tr
                  key={bucket.id}
                  tabIndex={0}
                  className={row}
                  onClick={() => setModal({ kind: "bucket", record: bucket })}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () => setModal({ kind: "bucket", record: bucket }))
                  }
                >
                  <td className={td}>{bucket.name}</td>
                  <td className={td}>{bucket.investor}</td>
                  <td className={td}>{bucket.status}</td>
                  <td className={td}>
                    {bucket.risk_low}–{bucket.risk_high}
                  </td>
                  <td className={td}>{bucket.apr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      {modal ? (
        <FormDialog key={modalKey(modal)} title={modalTitle(modal)} onClose={close}>
          {modal.kind === "organisation" ? (
            <OrganisationForm
              industries={data.industryNames}
              initial={modal.record}
              onSaved={close}
            />
          ) : null}
          {modal.kind === "user" ? (
            <UserForm organisations={names} initial={modal.record} onSaved={close} />
          ) : null}
          {modal.kind === "invoice" ? (
            <InvoiceForm organisations={names} initial={modal.record} onSaved={close} />
          ) : null}
          {modal.kind === "bucket" ? (
            <BucketForm
              organisations={data.investors}
              features={data.features}
              initial={modal.record}
              onSaved={close}
            />
          ) : null}
          {modal.kind === "funds" ? <FundsForm initial={modal.organisation} onSaved={close} /> : null}
          {modal.kind === "score" ? (
            <ManualScoreForm
              organisationId={modal.organisation.id}
              baseline={modal.organisation.risk_score_base}
              onSaved={close}
            />
          ) : null}
        </FormDialog>
      ) : null}
    </div>
  )
}
