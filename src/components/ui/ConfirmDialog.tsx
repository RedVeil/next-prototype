"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

type ConfirmDialogProps = {
  title: string
  description?: string
  children?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 sm:p-8">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-white"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 id="confirm-title" className="text-lg font-semibold text-neutral-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="px-6 py-5 text-sm text-neutral-700">{children}</div>}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-white ${
              danger ? "bg-red-700 hover:bg-red-800" : "bg-neutral-900 hover:bg-neutral-800"
            } disabled:bg-neutral-400`}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
