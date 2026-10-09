"use client"

import { useActionState } from "react"
import { signIn, signUp, type ActionResult } from "@/lib/actions"

export function RoleAuthCard({
  title,
  description,
  role,
}: {
  title: string
  description: string
  role: "company" | "investor"
}) {
  const [signInState, signInAction, signingIn] = useActionState(signIn, null as ActionResult | null)
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, null as ActionResult | null)
  const fieldId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-")

  return (
    <div className="mx-auto w-full max-w-sm">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Enter as</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-500">{description}</p>

      <form className="mt-8 space-y-3">
        <input type="hidden" name="role" value={role} />
        <label className="block text-sm" htmlFor={`${fieldId}-email`}>
          <span className="text-neutral-600">Email</span>
          <input
            id={`${fieldId}-email`}
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </label>
        <label className="block text-sm" htmlFor={`${fieldId}-password`}>
          <span className="text-neutral-600">Password</span>
          <input
            id={`${fieldId}-password`}
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </label>
        {signInState && !signInState.ok && <p className="text-sm text-red-700">{signInState.error}</p>}
        {signUpState && !signUpState.ok && <p className="text-sm text-red-700">{signUpState.error}</p>}
        {signUpState?.ok && signUpState.message && <p className="text-sm text-neutral-700">{signUpState.message}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            formAction={signInAction}
            disabled={signingIn || signingUp}
            className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
          >
            Log in
          </button>
          <button
            type="submit"
            formAction={signUpAction}
            disabled={signingIn || signingUp}
            className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:text-neutral-400"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  )
}
