type MetricCardProps = {
  label: string
  value?: string
  hint?: string
  loading?: boolean
}

export function MetricCard({ label, value, hint, loading = false }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border bg-white px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded bg-neutral-200" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}
