"use client"

export function ChipSelect({
  options,
  selected,
  onToggle,
  disabled = false,
}: {
  options: readonly string[]
  selected: readonly string[]
  onToggle: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 ${
              on
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-border bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
