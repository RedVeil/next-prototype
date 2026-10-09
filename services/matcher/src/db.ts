import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireEnv } from "./env"

export type Db = SupabaseClient

let client: Db | null = null

export function db(): Db {
  if (client) return client
  client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
