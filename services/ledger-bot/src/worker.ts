import { ensureAdminUser } from "./admin-user"
import { loadRootEnv } from "./env"
import { pollOnce, recoverStuckProvisionJobs } from "./poll"

loadRootEnv()

const intervalMs = 15_000

async function main() {
  await ensureAdminUser().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
  })
  await recoverStuckProvisionJobs()
  console.log("Ledger bot polling. Only provision_investor_multisigs is submitted.")
  for (;;) {
    try {
      await pollOnce()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

main()
