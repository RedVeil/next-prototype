import { Check, Clock, LoaderCircle } from "lucide-react"

export type TimelineItem = {
  label: string
  status: "complete" | "waiting" | "processing"
  detail?: string
}

export function TransactionTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="space-y-0">
      {items.map((item, index) => (
        <li key={item.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-white">
              {item.status === "complete" ? (
                <Check className="size-3.5 text-emerald-700" />
              ) : item.status === "processing" ? (
                <LoaderCircle className="size-3.5 animate-spin text-neutral-500" />
              ) : (
                <Clock className="size-3.5 text-amber-700" />
              )}
            </span>
            {index < items.length - 1 && (
              <span className="min-h-6 w-px flex-1 bg-border" />
            )}
          </div>
          <div className="pb-6">
            <p className="text-sm font-medium text-neutral-900">{item.label}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {item.detail ??
                (item.status === "complete"
                  ? "Complete"
                  : item.status === "processing"
                    ? "Processing"
                    : "Waiting")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
