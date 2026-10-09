import { ensureAdminUser } from "@antecipa/ledger-bot/chain"
import { AdminLoginForm } from "./login-form"

export default async function AdminLoginPage() {
  await ensureAdminUser().catch(() => undefined)
  return <AdminLoginForm />
}
