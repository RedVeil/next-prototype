import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createServiceClient } from "../lib/supabase/service"
import { SNAPSHOT_INTERVAL_MS, captureDueSnapshots } from "./capture"

function loadEnvFile(file: string, override: boolean) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (override || process.env[key] === undefined) process.env[key] = value
  }
}

function loadEnv() {
  const webEnv = existsSync(resolve(process.cwd(), "apps/web/.env"))
    ? resolve(process.cwd(), "apps/web/.env")
    : resolve(process.cwd(), ".env")
  const rootEnv = existsSync(resolve(process.cwd(), "apps/web/.env"))
    ? resolve(process.cwd(), ".env")
    : resolve(process.cwd(), "../../.env")
  loadEnvFile(webEnv, false)
  if (rootEnv !== webEnv) loadEnvFile(rootEnv, true)
}

function wait(ms: number) {
  return new Promise<void>((resolveWait) => {
    setTimeout(resolveWait, ms)
  })
}

async function main() {
  loadEnv()
  const supabase = createServiceClient()
  console.log("Portfolio snapshots are running.")
  let stopped = false
  const stop = () => {
    stopped = true
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  while (!stopped) {
    try {
      const written = await captureDueSnapshots(supabase)
      console.log(`Recorded ${written} portfolio snapshots.`)
    } catch (error) {
      console.error("Portfolio snapshot pass failed.", error instanceof Error ? error.message : error)
    }
    if (!stopped) await wait(SNAPSHOT_INTERVAL_MS)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
