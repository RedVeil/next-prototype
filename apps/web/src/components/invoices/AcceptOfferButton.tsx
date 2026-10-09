"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { acceptInvoiceOffer } from "@/lib/accept-offer"

export function AcceptOfferButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true)
          setError(null)
          void acceptInvoiceOffer(invoiceId)
            .then((result) => {
              if (!result.ok) {
                setError(result.error)
                return
              }
              router.refresh()
            })
            .catch(() => setError("Something went wrong"))
            .finally(() => setPending(false))
        }}
        className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? "Accepting…" : "Accept"}
      </button>
      {error && <p className="mt-1 max-w-40 text-xs text-red-700">{error}</p>}
    </div>
  )
}
