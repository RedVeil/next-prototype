"use client"

import { useEffect, useRef, useState } from "react"
import { Check, LoaderCircle } from "lucide-react"

export function ProgressSequence({
  title,
  steps,
  intervalMs = 520,
  onComplete,
}: {
  title: string
  steps: readonly string[]
  intervalMs?: number
  onComplete: () => void
}) {
  const [index, setIndex] = useState(0)
  const completedRef = useRef(false)

  useEffect(() => {
    if (index >= steps.length) {
      if (completedRef.current) return
      completedRef.current = true
      const done = window.setTimeout(onComplete, 280)
      return () => window.clearTimeout(done)
    }
    const id = window.setTimeout(() => setIndex((value) => value + 1), intervalMs)
    return () => window.clearTimeout(id)
  }, [index, intervalMs, onComplete, steps.length])

  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">Automated checks in progress</p>
      <ol className="mt-5 space-y-2.5">
        {steps.map((step, stepIndex) => {
          const done = stepIndex < index
          const current = stepIndex === index && index < steps.length
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span className="flex size-5 items-center justify-center">
                {done ? (
                  <Check className="size-4 text-emerald-700" />
                ) : current ? (
                  <LoaderCircle className="size-4 animate-spin text-neutral-500" />
                ) : (
                  <span className="size-1.5 rounded-full bg-neutral-200" />
                )}
              </span>
              <span className={done || current ? "text-neutral-900" : "text-neutral-400"}>
                {step}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
