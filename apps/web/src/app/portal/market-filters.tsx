"use client"

import { useEffect, useId, useRef, useState } from "react"

export type FilterOption = {
  value: string
  label: string
  detail?: string
}

type MenuBox = {
  top: number
  left: number
  width: number
  maxHeight: number
}

function summary(options: FilterOption[], selected: string[]) {
  if (options.length === 0 || selected.length === 0) return "None"
  if (selected.length === options.length) return "All"
  if (selected.length === 1) return options.find((option) => option.value === selected[0])?.label ?? "1 selected"
  return `${selected.length} selected`
}

function measure(button: HTMLButtonElement): MenuBox {
  const rect = button.getBoundingClientRect()
  const width = Math.min(320, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const maxHeight = Math.max(220, Math.min(420, window.innerHeight - rect.bottom - 12))
  return { top: rect.bottom + 4, left, width, maxHeight }
}

export function FilterDropdown({
  name,
  label,
  options,
  selected,
  searchable = false,
  scopeName,
}: {
  name: string
  label: string
  options: FilterOption[]
  selected: string[]
  searchable?: boolean
  scopeName?: string
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(selected)
  const [search, setSearch] = useState("")
  const [box, setBox] = useState<MenuBox | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const needle = search.trim().toLowerCase()
  const visible = options.filter((option) => {
    if (!needle) return true
    const haystack = `${option.label} ${option.detail ?? ""}`.toLowerCase()
    return needle.split(/\s+/).every((part) => haystack.includes(part))
  })

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    function onMove() {
      if (buttonRef.current) setBox(measure(buttonRef.current))
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-44">
      {scopeName ? (
        <input
          type="hidden"
          name={scopeName}
          value={picked.length === 0 ? "none" : picked.length === options.length ? "all" : "some"}
        />
      ) : null}
      {scopeName && picked.length === options.length
        ? null
        : picked.map((value) => <input key={value} type="hidden" name={name} value={value} />)}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          if (buttonRef.current) setBox(measure(buttonRef.current))
          setOpen(true)
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-white px-3 text-left text-sm"
      >
        <span className="truncate">
          <span className="text-neutral-500">{label}</span> {summary(options, picked)}
        </span>
        <span aria-hidden className="text-neutral-400">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && box ? (
        <div
          id={listId}
          style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          className="fixed z-50 flex flex-col overflow-hidden rounded-md border border-border bg-white p-3 shadow-lg"
        >
          <div className="flex gap-3 text-sm">
            <button type="button" className="font-medium underline" onClick={() => setPicked(options.map((option) => option.value))}>
              Select all
            </button>
            <button type="button" className="font-medium underline" onClick={() => setPicked([])}>
              Deselect all
            </button>
          </div>
          {searchable ? (
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault()
              }}
              placeholder="Legal name or company id"
              aria-label={`Search ${label.toLowerCase()}`}
              autoFocus
              autoComplete="off"
              className="mt-3 h-9 w-full shrink-0 rounded-md border border-border px-3 text-sm"
            />
          ) : null}
          {searchable && needle ? (
            <p className="mt-3 shrink-0 text-sm text-neutral-500">
              {visible.length === 0 ? "No matches" : `${visible.length} matching`}
            </p>
          ) : null}
          {options.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">None yet.</p>
          ) : visible.length === 0 ? null : (
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {visible.map((option) => {
                const checked = picked.includes(option.value)
                return (
                  <li key={option.value} className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() =>
                          setPicked((current) =>
                            current.includes(option.value)
                              ? current.filter((value) => value !== option.value)
                              : [...current, option.value],
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.detail ? <span className="block truncate text-neutral-500">{option.detail}</span> : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-neutral-700 underline"
                      onClick={() => setPicked([option.value])}
                    >
                      Select only
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
