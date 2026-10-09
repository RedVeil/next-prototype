import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

let loaded = false

/** Load the repo-root .env without overriding variables that are already set. */
export function loadRootEnv() {
  if (loaded) return
  loaded = true
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ]
  const file = candidates.find((candidate) => existsSync(candidate))
  if (!file) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

export function requireEnv(name: string): string {
  loadRootEnv()
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
