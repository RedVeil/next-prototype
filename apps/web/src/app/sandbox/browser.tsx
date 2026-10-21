"use client"

import { useActionState, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { scoreRisk } from "@/app/risk/actions"
import { acceptInvoice, repayInvoice, updateMatching } from "./actions"
import { BucketForm, FundsForm, InvoiceForm, ManualScoreForm, OrganisationForm, UserForm, WeightsForm } from "./forms"
import { ConnectWallet, DepositForm, FinishSetup, FundAccount, MultisigForm, SignerForm, TrustRlusd } from "./multisig"
import {
  anyoneCanSend,
  type BucketRecord,
  type DemoData,
  type InvoiceRecord,
  type MultisigDestination,
  type MultisigRecord,
  type MultisigWallet,
  type OrganisationRecord,
  type UserRecord,
} from "./types"

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
  { id: "multisigs", label: "Multisigs" },
  { id: "bots", label: "Bots" },
] as const

type Tab = (typeof tabs)[number]["id"]

type Modal =
  | { kind: "organisation"; record: OrganisationRecord | null }
  | { kind: "user"; record: UserRecord | null }
  | { kind: "invoice"; record: InvoiceRecord | null }
  | { kind: "bucket"; record: BucketRecord | null }
  | { kind: "funds"; organisation: OrganisationRecord }
  | { kind: "score"; organisation: OrganisationRecord }
  | { kind: "multisig" }
  | { kind: "signers"; multisig: MultisigRecord }
  | { kind: "deposits"; multisig: MultisigRecord }

function modalKey(modal: Modal) {
  if (modal.kind === "multisig") return "multisig"
  if (modal.kind === "signers" || modal.kind === "deposits") return `${modal.kind}-${modal.multisig.id}`
  if (modal.kind === "funds" || modal.kind === "score") return `${modal.kind}-${modal.organisation.id}`
  return `${modal.kind}-${modal.record?.id ?? "new"}`
}

function modalTitle(modal: Modal) {
  if (modal.kind === "signers") return "Change signers"
  if (modal.kind === "deposits") return "Who can send"
  if (modal.kind === "multisig") return "Add multisig"
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

function Address({ value }: { value: string }) {
  if (!value) return <span className="text-muted">None</span>
  return <span className="block max-w-56 font-mono text-xs break-all">{value}</span>
}

function SignerList({ wallets }: { wallets: MultisigWallet[] }) {
  if (wallets.length === 0) return <span className="text-muted">None</span>
  return (
    <ul className="max-w-64 space-y-1">
      {wallets.map((wallet) => (
        <li key={`${wallet.kind}-${wallet.address}-${wallet.username}`}>
          <Address value={wallet.address} />
          <span className="text-muted">
            {wallet.kind}
            {wallet.username ? ` · ${wallet.username}` : ""} · weight {wallet.weight}
          </span>
        </li>
      ))}
    </ul>
  )
}

function BotXrp({ bot }: { bot: { address: string; xrp: string | null; xrp_known: boolean } }) {
  if (!bot.address) return <span className="text-muted">None</span>
  if (!bot.xrp_known) return <span className="text-muted">Unknown</span>
  if (bot.xrp === null) return <span className="text-muted">Unfunded</span>
  return <span className="whitespace-nowrap">{bot.xrp} XRP</span>
}

function DestinationList({ wallets }: { wallets: MultisigDestination[] }) {
  if (wallets.length === 0) return <span className="text-muted">None</span>
  return (
    <ul className="max-w-64 space-y-1">
      {wallets.map((wallet, index) => (
        <li key={`${wallet.kind}-${wallet.address}-${index}`}>
          {wallet.address ? <Address value={wallet.address} /> : <span className="text-muted">Unset</span>}
          <div className="text-muted">{wallet.kind}</div>
        </li>
      ))}
    </ul>
  )
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
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)
  const [selectedMultisigId, setSelectedMultisigId] = useState<string | null>(null)
  const close = useCallback(() => setModal(null), [])
  const selectedBot = data.bots.find((bot) => bot.id === selectedBotId) ?? null
  const selectedMultisig = data.multisigs.find((multisig) => multisig.id === selectedMultisigId) ?? null
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
        {"add" in current ? (
          <button
            type="button"
            className={addButton}
            onClick={() => setModal({ kind: current.kind, record: null })}
          >
            {current.add}
          </button>
        ) : null}
        {tab === "organisations" || tab === "multisigs" ? (
          <>
            <button type="button" className={addButton} onClick={() => setModal({ kind: "multisig" })}>
              Add multisig
            </button>
            {tab === "multisigs" ? <FundAccount destination={selectedMultisig?.address ?? ""} label="Fund multisig" /> : null}
            <ConnectWallet />
          </>
        ) : null}
        {tab === "invoices" ? <UpdateMatching /> : null}
        {tab === "bots" ? (
          <>
            <FundAccount destination={selectedBot?.address ?? ""} label="Fund bot" />
            <ConnectWallet />
          </>
        ) : null}
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
                <th className={th}>Multisig</th>
              </tr>
            </thead>
            <tbody>
              {data.organisations.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${td} text-muted`}>
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
                  <td className={td}>
                    {organisation.multisig_address ? (
                      <div>
                        <div className="max-w-56 font-mono text-xs break-all">{organisation.multisig_address}</div>
                        <div className="max-w-56 font-mono text-xs break-all text-muted">{organisation.bot_address}</div>
                        {organisation.multisig_status === "live" ? (
                          organisation.bot_address && !organisation.bot_funded ? (
                            <FinishSetup multisigId={organisation.multisig_id} label="Activate bot" />
                          ) : null
                        ) : (
                          <FinishSetup multisigId={organisation.multisig_id} />
                        )}
                      </div>
                    ) : null}
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
                <th className={th}>XRPL address</th>
                <th className={th}>Created invoices</th>
                <th className={th}>Bought invoices</th>
                <th className={th}>Buckets</th>
              </tr>
            </thead>
            <tbody>
              {data.users.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${td} text-muted`}>
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
                  <td className={`${td} max-w-56 font-mono text-xs break-all`}>
                    {user.address || <span className="font-sans text-sm text-muted">None</span>}
                  </td>
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
                <th className={th}>Token address</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${td} text-muted`}>
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
                  <td className={`${td} max-w-56 font-mono text-xs break-all`}>{invoice.token_address}</td>
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
        {tab === "multisigs" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Address</th>
                <th className={th}>Reserved XRP</th>
                <th className={th}>Free XRP</th>
                <th className={th}>Status</th>
                <th className={th}>Type</th>
                <th className={th}>Organisation</th>
                <th className={th}>Quorum</th>
                <th className={th}>Connected wallets</th>
                <th className={th}>Can interact</th>
              </tr>
            </thead>
            <tbody>
              {data.multisigs.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.multisigs.map((multisig) => (
                <tr
                  key={multisig.id}
                  tabIndex={0}
                  aria-selected={selectedMultisigId === multisig.id}
                  className={`${row}${selectedMultisigId === multisig.id ? " bg-background" : ""}`}
                  onClick={() => setSelectedMultisigId((current) => (current === multisig.id ? null : multisig.id))}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () =>
                      setSelectedMultisigId((current) => (current === multisig.id ? null : multisig.id)),
                    )
                  }
                >
                  <td className={td}>
                    <Address value={multisig.address} />
                  </td>
                  <td className={td}>
                    <BotXrp bot={{ address: multisig.address, xrp: multisig.xrp_reserved, xrp_known: multisig.xrp_known }} />
                  </td>
                  <td className={td}>
                    <BotXrp bot={{ address: multisig.address, xrp: multisig.xrp_free, xrp_known: multisig.xrp_known }} />
                  </td>
                  <td className={td}>
                    {multisig.status}
                    {multisig.rlusd_trust === "trusted" ? <div className="mt-1 text-xs text-muted">Trusts RLUSD</div> : null}
                    {multisig.rlusd_trust === "none" && multisig.status === "live" ? (
                      <TrustRlusd kind="multisig" id={multisig.id} />
                    ) : null}
                  </td>
                  <td className={td}>{multisig.type}</td>
                  <td className={td}>{multisig.organisation || <span className="text-muted">None</span>}</td>
                  <td className={td}>
                    {multisig.quorum} of {Math.max(multisig.signers.length, multisig.quorum)}
                    {multisig.address && multisig.status !== "live" ? (
                      <FinishSetup multisigId={multisig.id} />
                    ) : null}
                    {multisig.status === "live" && multisig.bot_address && !multisig.bot_funded ? (
                      <FinishSetup multisigId={multisig.id} label="Activate bot" />
                    ) : null}
                    {multisig.status === "live" ? (
                      <button
                        type="button"
                        className="mt-2 block rounded-lg border border-border px-2 py-1 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          setModal({ kind: "signers", multisig })
                        }}
                      >
                        Change signers
                      </button>
                    ) : null}
                  </td>
                  <td className={td}>
                    <SignerList wallets={multisig.signers} />
                  </td>
                  <td className={td}>
                    {multisig.destinations.some((destination) => destination.address === anyoneCanSend) ? (
                      "Anyone"
                    ) : (
                      <DestinationList wallets={multisig.destinations} />
                    )}
                    {multisig.status === "live" ? (
                      <button
                        type="button"
                        className="mt-2 block rounded-lg border border-border px-2 py-1 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          setModal({ kind: "deposits", multisig })
                        }}
                      >
                        Change senders
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "bots" ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className={th}>Address</th>
                <th className={th}>XRP</th>
                <th className={th}>Multisig</th>
                <th className={th}>Type</th>
                <th className={th}>Organisation</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.bots.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${td} text-muted`}>
                    None yet.
                  </td>
                </tr>
              ) : null}
              {data.bots.map((bot) => (
                <tr
                  key={bot.id}
                  tabIndex={0}
                  aria-selected={selectedBotId === bot.id}
                  className={`${row}${selectedBotId === bot.id ? " bg-background" : ""}`}
                  onClick={() => setSelectedBotId((current) => (current === bot.id ? null : bot.id))}
                  onKeyDown={(event) =>
                    openFromKeyboard(event, () =>
                      setSelectedBotId((current) => (current === bot.id ? null : bot.id)),
                    )
                  }
                >
                  <td className={td}>
                    <Address value={bot.address} />
                  </td>
                  <td className={td}>
                    <BotXrp bot={bot} />
                  </td>
                  <td className={td}>
                    <Address value={bot.multisig_address} />
                  </td>
                  <td className={td}>{bot.multisig_type || <span className="text-muted">None</span>}</td>
                  <td className={td}>{bot.organisation || <span className="text-muted">None</span>}</td>
                  <td className={td}>
                    {bot.multisig_status || <span className="text-muted">None</span>}
                    {bot.rlusd_trust === "trusted" ? <div className="mt-1 text-xs text-muted">Trusts RLUSD</div> : null}
                    {bot.rlusd_trust === "none" ? <TrustRlusd kind="bot" id={bot.id} /> : null}
                  </td>
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
          {modal.kind === "signers" ? (
            <SignerForm multisig={modal.multisig} users={data.users} onSaved={close} />
          ) : null}
          {modal.kind === "deposits" ? (
            <DepositForm
              multisig={modal.multisig}
              users={data.users}
              multisigs={data.multisigs}
              onSaved={close}
            />
          ) : null}
          {modal.kind === "multisig" ? (
            <MultisigForm
              organisations={data.organisations
                .filter((organisation) => !organisation.multisig_address)
                .map((organisation) => ({ id: organisation.id, legal_name: organisation.legal_name }))}
              users={data.users}
              central={data.multisigs
                .filter((multisig) => multisig.type !== "org")
                .map((multisig) => ({ type: multisig.type, address: multisig.address }))}
              onSaved={close}
            />
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
