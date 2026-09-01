"use client"

import { useRouter } from "next/navigation"
import { Menu } from "lucide-react"
import { useStore } from "@/lib/store"

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { role, seller, investor, clearProfile, selectProfile, selectInvestorProfile } = useStore()
  const router = useRouter()
  const entity = role === "investor" ? investor : seller

  function logOut() {
    clearProfile()
    router.replace("/")
  }

  function switchPortal(next: "seller" | "investor") {
    if (next === role) return
    if (next === "seller") {
      selectProfile("existing")
      router.push("/seller/dashboard")
      return
    }
    selectInvestorProfile("existing")
    router.push("/investor/dashboard")
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6">
      <button
        type="button"
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <label className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex">
          <span className="sr-only">Portal</span>
          <select
            value={role ?? "seller"}
            onChange={(event) => switchPortal(event.target.value as "seller" | "investor")}
            className="h-8 rounded-md border border-border bg-white px-2 text-xs font-medium text-neutral-800 outline-none focus:border-neutral-400"
            aria-label="Switch portal"
          >
            <option value="seller">Seller Portal</option>
            <option value="investor">Investor Portal</option>
          </select>
        </label>
        <button
          type="button"
          onClick={logOut}
          className="hidden text-xs text-neutral-500 hover:text-neutral-800 sm:inline"
        >
          Log out
        </button>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-900">{entity?.name}</p>
          <p className="text-xs text-neutral-500">
            {role === "investor" ? "Institutional investor" : `CNPJ ${entity?.cnpj}`}
          </p>
        </div>
        <div
          className="flex size-9 items-center justify-center rounded-full border border-border bg-neutral-100 text-xs font-medium text-neutral-700"
          aria-label="Account"
        >
          {entity?.initials}
        </div>
      </div>
    </header>
  )
}
