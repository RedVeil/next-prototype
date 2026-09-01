import { Check } from "lucide-react"
import type { Invoice } from "@/lib/types"

const checks = [
  { key: "nfeVerified", label: "Valid NF-e" },
  { key: "buyerAccepted", label: "Buyer acceptance" },
  { key: "duplicataRegistered", label: "Registered Duplicata Escritural" },
  { key: "ownershipClean", label: "Seller is current owner" },
  { key: "noPriorAssignment", label: "No prior assignment" },
  { key: "noLien", label: "No lien" },
] as const

export function EligibilityChecks({ invoice }: { invoice: Invoice }) {
  return (
    <ul className="space-y-2">
      {checks.map((check) => {
        const ok = invoice[check.key]
        return (
          <li key={check.key} className="flex items-center gap-2 text-sm">
            {ok ? (
              <Check className="size-4 text-emerald-700" />
            ) : (
              <span className="size-4 rounded-full border border-amber-400" />
            )}
            <span className={ok ? "text-neutral-800" : "text-amber-800"}>{check.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
