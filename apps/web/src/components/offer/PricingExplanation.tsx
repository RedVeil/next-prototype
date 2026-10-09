"use client"

import { useState } from "react"

const items = [
  "Invoice risk",
  "Remaining tenor",
  "Seller → buyer payment history",
  "External buyer credit signals",
  "Seller Open Finance evidence",
  "Platform buyer history",
  "Current funding cost",
  "Required investor return",
]

export function PricingExplanation() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-5 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-neutral-700 hover:text-neutral-900"
        aria-expanded={open}
      >
        How was this price calculated?
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600">
          <p>
            The firm price combines documentary eligibility with an indicative risk view and
            current funding conditions. It is not a full credit model.
          </p>
          <ul className="list-disc space-y-1 pl-4">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Investor matching and any downstream settlement happen in the background. The
            legal receivable remains registered off-chain through Brazilian duplicata
            infrastructure.
          </p>
        </div>
      )}
    </div>
  )
}
