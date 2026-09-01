import { StatusBadge } from "@/components/ui/StatusBadge"

type ConnectionStatus = "connected" | "automatic"

export function ConnectionCard({
  title,
  status,
  description,
  children,
}: {
  title: string
  status: ConnectionStatus
  description: string
  children?: React.ReactNode
}) {
  return (
    <article className="rounded-lg border border-border bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        <StatusBadge tone="positive">
          {status === "connected" ? "Connected" : "Automatic"}
        </StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{description}</p>
      {children && <div className="mt-5 space-y-3 text-sm">{children}</div>}
    </article>
  )
}
