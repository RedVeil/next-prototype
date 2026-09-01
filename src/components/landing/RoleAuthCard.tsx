"use client"

import { FormEvent } from "react"
import { useRouter } from "next/navigation"

type RoleAuthCardProps = {
  title: string
  description: string
  loginHref: string
  signupHref: string
  onLogin?: () => void
  onSignup?: () => void
}

export function RoleAuthCard({
  title,
  description,
  loginHref,
  signupHref,
  onLogin,
  onSignup,
}: RoleAuthCardProps) {
  const router = useRouter()
  const fieldId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-")

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onLogin?.()
    router.push(loginHref)
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Enter as</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-500">{description}</p>

      <form onSubmit={handleLogin} className="mt-8 space-y-3">
        <label className="block text-sm" htmlFor={`${fieldId}-email`}>
          <span className="text-neutral-600">Email</span>
          <input
            id={`${fieldId}-email`}
            type="email"
            name="email"
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
            autoComplete="current-password"
            placeholder="••••••••"
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              onSignup?.()
              router.push(signupHref)
            }}
            className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  )
}
