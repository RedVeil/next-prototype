export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-600">{body}</p>
    </div>
  )
}
