"use server"

import { loadCatalogue } from "./load"
import { runMatch, type InvoiceOutcome } from "./match"
import { frankfurterRate } from "./rate"

export type ActionState = {
  error?: string
  rate?: number
  today?: string
  invoices?: InvoiceOutcome[]
} | null

export async function runMatching(_state: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formData.get("brl_usd")
  const typed = typeof raw === "string" ? raw.trim() : ""
  let rate: number
  if (typed) {
    rate = Number(typed)
    if (!Number.isFinite(rate) || rate <= 0) {
      return { error: "The BRL to USD rate must be greater than zero." }
    }
  } else {
    try {
      rate = await frankfurterRate()
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Frankfurter did not return a rate." }
    }
  }

  try {
    const catalogue = await loadCatalogue()
    const today = new Date().toISOString().slice(0, 10)
    return {
      rate,
      today,
      invoices: runMatch({
        today,
        rate,
        invoices: catalogue.invoices,
        buckets: catalogue.buckets,
      }),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The match did not run." }
  }
}
