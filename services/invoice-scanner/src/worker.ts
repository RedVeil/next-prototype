import { loadRootEnv } from "./env"
import { scanOnce } from "./scan"

loadRootEnv()

const intervalMs = 5 * 60 * 1000

async function main() {
  console.log("Invoice scanner polling every 5 minutes.")
  for (;;) {
    try {
      const result = await scanOnce()
      console.log(`Scan inserted ${result.inserted}, marked paid ${result.markedPaid}.`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

main()
