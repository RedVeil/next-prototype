import { createServiceClient } from "@/lib/supabase/service"

export default async function HomePage() {
  let connected = false
  let detail = "The database did not respond."

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from("platform_settings").select("id").limit(1)
    if (error) {
      detail = error.message
    } else {
      connected = true
      detail = "The existing database answered."
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : detail
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <p className="text-sm text-muted">Database</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {connected ? "Connected" : "Not connected"}
        </h1>
        <p className="mt-3 text-sm text-muted">{detail}</p>
      </div>
    </main>
  )
}
