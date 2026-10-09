type Tone = "neutral" | "positive" | "warning" | "danger"

const tones: Record<Tone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: Tone
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
