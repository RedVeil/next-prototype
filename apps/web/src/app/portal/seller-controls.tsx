"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { ActionState } from "@/app/sandbox/actions"
import { acceptSellerInvoice, createSellerInvoice } from "./dashboard-actions"

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

export function AddInvoiceButton({ organisations }: { organisations: { id: string; legalName: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
      >
        Add invoice
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-invoice-title"
            className="w-full max-w-lg rounded-lg border border-border bg-white p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-invoice-title" className="text-lg font-semibold tracking-tight">
                  Add invoice
                </h2>
                <p className="mt-1 text-sm text-neutral-500">Store an invoice issued by this organisation.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500" aria-label="Close">
                Close
              </button>
            </div>
            <InvoiceForm
              organisations={organisations}
              onSaved={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function InvoiceForm({
  organisations,
  onSaved,
}: {
  organisations: { id: string; legalName: string }[]
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState(createSellerInvoice, null)
  const router = useRouter()
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  useEffect(() => {
    if (!state?.message) return
    onSavedRef.current()
    router.refresh()
  }, [router, state])

  return (
    <form action={action} className="mt-4 grid gap-3">
      <label className="block text-sm text-neutral-600">
        Document id
        <input name="document_id" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Obligor
        <select name="obligor_organisation_id" className={inputClass} defaultValue="">
          <option value="">Add a new obligor</option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.legalName}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-neutral-600">
        New obligor name
        <input name="obligor_name" className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        New obligor company id
        <input name="obligor_company_id" className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Face value
        <input name="face_value" type="number" min="0" step="0.01" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Currency
        <input name="currency" required defaultValue="BRL" className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Origination date
        <input name="origination_date" type="date" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Due date
        <input name="due_date" type="date" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Product
        <input name="product" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Amount
        <input name="line_amount" type="number" min="0" step="0.01" required className={inputClass} />
      </label>
      <label className="block text-sm text-neutral-600">
        Unit
        <input name="unit" required placeholder="tons, units, hours" className={inputClass} />
      </label>
      <FormFeedback state={state} />
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-neutral-900 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving" : "Save invoice"}
      </button>
    </form>
  )
}

export function AcceptOfferButton({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(acceptSellerInvoice, null)
  const router = useRouter()
  useEffect(() => {
    if (state?.message) router.refresh()
  }, [router, state])
  return (
    <form action={action}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button type="submit" disabled={pending} className="text-sm font-medium text-neutral-900 underline disabled:opacity-60">
        {pending ? "Accepting" : "Accept"}
      </button>
      {state?.error ? <p className="mt-1 text-xs text-red-700">{state.error}</p> : null}
    </form>
  )
}

function FormFeedback({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null
  return <p className={`text-sm ${state.error ? "text-red-700" : "text-neutral-600"}`}>{state.error ?? state.message}</p>
}
