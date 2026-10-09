"use client"

import { useActionState } from "react"
import Link from "next/link"
import { signIn, type ActionResult } from "@/lib/actions"
import { PLATFORM_NAME } from "@/lib/brand"

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(signIn, null as ActionResult | null)

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background px-4">
      <form action={action} className="w-full max-w-sm rounded-lg border border-border bg-white p-6">
        <p className="text-[15px] font-semibold tracking-tight">{PLATFORM_NAME}</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-neutral-500">Sign in with the admin account from the server environment.</p>
        <label className="mt-6 block text-sm">
          <span className="text-neutral-600">Email</span>
          <input name="email" type="email" required className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-neutral-600">Password</span>
          <input name="password" type="password" required className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        {state && !state.ok && <p className="mt-3 text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
        >
          Log in
        </button>
        <p className="mt-4 text-xs text-neutral-500">
          <Link href="/" className="hover:text-neutral-800">
            Back
          </Link>
        </p>
      </form>
    </div>
  )
}
