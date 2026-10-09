import { db } from "./db"
import { requireEnv } from "./env"

let ensured = false

/** Create the admin user from ADMIN_EMAIL and ADMIN_PASSWORD when it does not exist yet. */
export async function ensureAdminUser() {
  if (ensured) return
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const client = db()
  const listed = await client.auth.admin.listUsers({ perPage: 200 })
  if (listed.error) throw new Error(listed.error.message)
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (existing) {
    await client.from("profiles").upsert({ id: existing.id, role: "admin" })
    ensured = true
    return
  }
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  })
  if (created.error) throw new Error(created.error.message)
  if (created.data.user) {
    await client.from("profiles").upsert({ id: created.data.user.id, role: "admin" })
  }
  ensured = true
}
