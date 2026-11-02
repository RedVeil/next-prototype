"use client"

import { useEffect, useRef, type FormEvent } from "react"

type FieldDraft = string | boolean | string[]
type Draft = Record<string, FieldDraft>

const drafts = new Map<string, Draft>()

export function readDraft(key: string) {
  return drafts.get(key)
}

export function clearDraft(key: string) {
  drafts.delete(key)
}

export function textDraft(draft: Draft | undefined, name: string, fallback?: string | number | null) {
  const value = draft?.[name]
  if (typeof value === "string") return value
  if (fallback === null || fallback === undefined) return ""
  return String(fallback)
}

export function checkDraft(draft: Draft | undefined, name: string, fallback = false) {
  const value = draft?.[name]
  return typeof value === "boolean" ? value : fallback
}

export function listDraft(draft: Draft | undefined, name: string, fallback: string[] = []) {
  const value = draft?.[name]
  return Array.isArray(value) ? value : fallback
}

export function writeDraft(key: string, form: HTMLFormElement) {
  const draft: Draft = {}
  for (const element of form.elements) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      continue
    }
    if (!element.name || element.type === "hidden" || element.type === "submit") continue
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      if (draft[element.name] === undefined) draft[element.name] = []
      if (element.name === "feature_id") {
        const selected = draft[element.name]
        if (element.checked && Array.isArray(selected)) selected.push(element.value)
        continue
      }
      draft[element.name] = element.checked
      continue
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      if (element.checked) draft[element.name] = element.value
      continue
    }
    draft[element.name] = element.value
  }
  drafts.set(key, draft)
}

export function useFormDraft(
  key: string,
  state: { error?: string; message?: string } | null,
  onSaved?: () => void,
) {
  const saved = useRef(onSaved)
  saved.current = onSaved
  useEffect(() => {
    if (state?.message) {
      clearDraft(key)
      saved.current?.()
    }
  }, [state, key])

  return {
    draft: readDraft(key),
    remember(event: FormEvent<HTMLFormElement>) {
      writeDraft(key, event.currentTarget)
    },
  }
}
