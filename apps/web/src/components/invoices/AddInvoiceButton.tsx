"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { COUNTRIES, CURRENCIES, GOODS_AND_SERVICES, INDUSTRIES } from "@antecipa/domain"
import { createInvoice } from "@/lib/actions"
import { ChipSelect } from "@/components/ui/ChipSelect"
import { Dialog } from "@/components/ui/Dialog"

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

function emptyDraft() {
  return {
    documentId: "",
    originCountry: "",
    currency: "",
    amount: "",
    product: "",
    dueDate: "",
    buyerId: "",
    buyerName: "",
    buyerTaxId: "",
    issuerIndustries: [] as string[],
  }
}

export function AddInvoiceButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function close() {
    if (pending) return
    setOpen(false)
    setError(null)
  }

  function toggleIndustry(value: string) {
    setDraft((current) => {
      const selected = current.issuerIndustries.includes(value)
        ? current.issuerIndustries.filter((item) => item !== value)
        : [...current.issuerIndustries, value]
      return { ...current, issuerIndustries: selected }
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!draft.documentId.trim()) {
      setError("Document id is required.")
      return
    }
    if (!draft.originCountry || !draft.currency || !draft.product) {
      setError("Origin country, currency, and product are required.")
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Amount must be zero or greater.")
      return
    }
    setPending(true)
    setError(null)
    const result = await createInvoice({
      documentId: draft.documentId,
      originCountry: draft.originCountry,
      currency: draft.currency,
      amount,
      product: draft.product,
      dueDate: draft.dueDate || null,
      buyerId: draft.buyerId.trim() || null,
      buyerName: draft.buyerName,
      buyerTaxId: draft.buyerTaxId,
      issuerIndustries: draft.issuerIndustries,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDraft(emptyDraft())
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(emptyDraft())
          setError(null)
          setOpen(true)
        }}
        className="inline-flex h-10 shrink-0 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
      >
        Add invoice
      </button>
      {open && (
        <Dialog title="Add invoice" description="Each field is stored as you enter it." wide onClose={close}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            <label className="block text-sm text-neutral-600">
              Document id
              <input
                value={draft.documentId}
                onChange={(event) => setDraft({ ...draft, documentId: event.target.value })}
                className={inputClass}
                required
              />
            </label>
            <label className="block text-sm text-neutral-600">
              Origin country
              <select
                value={draft.originCountry}
                onChange={(event) => setDraft({ ...draft, originCountry: event.target.value })}
                className={inputClass}
                required
              >
                <option value="">Select</option>
                {COUNTRIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-600">
              Currency
              <select
                value={draft.currency}
                onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                className={inputClass}
                required
              >
                <option value="">Select</option>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-600">
              Amount
              <input
                type="number"
                min="0"
                step="any"
                value={draft.amount}
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                className={inputClass}
                required
              />
            </label>
            <label className="block text-sm text-neutral-600 sm:col-span-2">
              Product
              <select
                value={draft.product}
                onChange={(event) => setDraft({ ...draft, product: event.target.value })}
                className={inputClass}
                required
              >
                <option value="">Select</option>
                {GOODS_AND_SERVICES.map((product) => (
                  <option key={product} value={product}>
                    {product}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-600">
              Due date
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm text-neutral-600">
              Buyer id
              <input
                value={draft.buyerId}
                onChange={(event) => setDraft({ ...draft, buyerId: event.target.value })}
                className={inputClass}
                placeholder="Optional uuid"
              />
            </label>
            <label className="block text-sm text-neutral-600">
              Buyer name
              <input
                value={draft.buyerName}
                onChange={(event) => setDraft({ ...draft, buyerName: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm text-neutral-600">
              Buyer tax id
              <input
                value={draft.buyerTaxId}
                onChange={(event) => setDraft({ ...draft, buyerTaxId: event.target.value })}
                className={inputClass}
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm text-neutral-600">Issuer industries</legend>
              <ChipSelect options={INDUSTRIES} selected={draft.issuerIndustries} onToggle={toggleIndustry} />
            </fieldset>
            {error && <p className="text-sm text-neutral-700 sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:bg-neutral-400"
              >
                {pending ? "Saving" : "Save invoice"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}
