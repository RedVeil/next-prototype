import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client as PgClient } from "pg"
import { reconcileAuctions } from "../auction/domain"
import { createServiceClient } from "../lib/supabase/service"

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

let pendingWake = false
let wakeWait: (() => void) | null = null

function notify() {
  pendingWake = true
  wakeWait?.()
}

function wait(ms: number) {
  if (pendingWake) {
    pendingWake = false
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeWait = null
      resolve()
    }, ms)
    wakeWait = () => {
      clearTimeout(timer)
      wakeWait = null
      pendingWake = false
      resolve()
    }
  })
}

async function listen() {
  const connection = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!connection) {
    console.log("Sale process is polling. SUPABASE_DB_URL is not set, so notifications are skipped.")
    return
  }
  const client = new PgClient({ connectionString: connection })
  client.on("error", (error: Error) => {
    console.error("Sale listener error.", error.message)
  })
  await client.connect()
  await client.query("listen sale_orders")
  client.on("notification", () => notify())
}

async function pass() {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc("expire_open_sale_orders")
  if (error) throw new Error(error.message)
  await reconcileAuctions()
}

async function main() {
  loadEnv()
  try {
    await listen()
  } catch (error) {
    console.error("Sale listener did not start.", error instanceof Error ? error.message : error)
  }
  console.log("Sale process is running.")
  let stopped = false
  const stop = () => {
    stopped = true
    notify()
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  while (!stopped) {
    try {
      await pass()
    } catch (error) {
      console.error("Sale pass failed.", error instanceof Error ? error.message : error)
    }
    if (!stopped) await wait(3000)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
