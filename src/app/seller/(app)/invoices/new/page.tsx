"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NEW_INVOICE_STEPS } from "@/lib/mock-data"
import { buildPostedInvoice } from "@/lib/pricing"
import { useStore } from "@/lib/store"
import { ProgressSequence } from "@/components/offer/ProgressSequence"

export default function NewInvoicePage() {
  const router = useRouter()
  const { seller, addInvoice, invoices, riskScores } = useStore()
  const [buyerName, setBuyerName] = useState("Café Leste Distribuidora")
  const [buyerCnpj, setBuyerCnpj] = useState("11.222.333/0001-44")
  const [nfeKey, setNfeKey] = useState("3526...4401")
  const [faceValue, setFaceValue] = useState("220000")
  const [daysToMaturity, setDaysToMaturity] = useState("28")
  const [buyerAccepted, setBuyerAccepted] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onVerified = useCallback(() => {
    if (!seller) return
    const face = Number(faceValue)
    const days = Number(daysToMaturity)
    const { invoice, riskScore } = buildPostedInvoice(
      {
        buyerName,
        buyerCnpj,
        nfeKey,
        faceValue: face,
        daysToMaturity: days,
        buyerAccepted,
      },
      seller,
      invoices,
      riskScores,
    )
    addInvoice(invoice, riskScore)
    router.push(`/seller/invoices/${invoice.id}`)
  }, [
    addInvoice,
    buyerAccepted,
    buyerCnpj,
    buyerName,
    daysToMaturity,
    faceValue,
    invoices,
    nfeKey,
    riskScores,
    router,
    seller,
  ])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const face = Number(faceValue)
    const days = Number(daysToMaturity)
    if (!buyerName.trim() || !buyerCnpj.trim()) {
      setError("Buyer name and CNPJ are required.")
      return
    }
    if (!Number.isFinite(face) || face <= 0) {
      setError("Enter a face value greater than zero.")
      return
    }
    if (!Number.isFinite(days) || days <= 0) {
      setError("Enter days to due greater than zero.")
      return
    }
    setError(null)
    setVerifying(true)
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm text-neutral-500">
        <Link href="/seller/invoices" className="hover:text-neutral-800">
          Invoices
        </Link>
        <span className="mx-1.5">/</span>
        Post invoice
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
        Post invoice
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Submit an NF-e issued by {seller?.name ?? "your company"}. We will verify the receivable and show a
        financing offer if it is eligible.
      </p>

      {verifying ? (
        <div className="mt-8">
          <ProgressSequence
            title="Verifying invoice"
            steps={NEW_INVOICE_STEPS}
            onComplete={onVerified}
          />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-lg border border-border bg-white p-6">
          <label className="block text-sm">
            <span className="text-neutral-600">Buyer / sacado</span>
            <input
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Buyer CNPJ</span>
            <input
              value={buyerCnpj}
              onChange={(event) => setBuyerCnpj(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">NF-e key</span>
            <input
              value={nfeKey}
              onChange={(event) => setNfeKey(event.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-neutral-600">Face value (R$)</span>
              <input
                value={faceValue}
                onChange={(event) => setFaceValue(event.target.value)}
                inputMode="numeric"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Days to due</span>
              <input
                value={daysToMaturity}
                onChange={(event) => setDaysToMaturity(event.target.value)}
                inputMode="numeric"
                className={fieldClass}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={buyerAccepted}
              onChange={(event) => setBuyerAccepted(event.target.checked)}
              className="mt-0.5"
            />
            <span>Buyer has accepted the registered duplicata</span>
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <p className="text-xs leading-relaxed text-neutral-500">
            The buyer does not need an account. If acceptance is missing, the invoice will
            not be eligible and no rate will be shown.
          </p>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Verify and get rate
          </button>
        </form>
      )}
    </div>
  )
}
