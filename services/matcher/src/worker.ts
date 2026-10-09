import { loadRootEnv } from "./env"
import { matchPass } from "./run"

loadRootEnv()

const intervalMs = 5 * 60 * 1000

async function main() {
  console.log("Matcher polling every 5 minutes.")
  for (;;) {
    try {
      const result = await matchPass()
      console.log(`Match pass saw ${result.candidates} invoices and wrote ${result.offers} offers.`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

main()
