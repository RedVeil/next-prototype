import { bootstrapCentralMultisigs } from "./bootstrap"
import { ensureAdminUser } from "./admin-user"
import { loadRootEnv } from "./env"

loadRootEnv()

const result = await bootstrapCentralMultisigs()
await ensureAdminUser().catch(() => undefined)
console.log(result.status === "exists" ? "Central multisigs already exist." : "Central multisigs created.")
