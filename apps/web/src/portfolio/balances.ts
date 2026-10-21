import { isValidClassicAddress, type Client } from "xrpl"
import { withClient } from "@/app/sandbox/ledger"
import { isRlusdCurrency, RLUSD_ISSUER } from "@/ledger/rlusd"
import { roundMoney } from "@/app/sandbox/settle"

function missingAccount(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = error.data
  return Boolean(data && typeof data === "object" && "error" in data && data.error === "actNotFound")
}

async function balanceOf(client: Client, address: string) {
  try {
    await client.request({ command: "account_info", account: address, ledger_index: "validated" })
  } catch (error) {
    if (missingAccount(error)) return 0
    throw error
  }
  const lines = await client.request({
    command: "account_lines",
    account: address,
    ledger_index: "validated",
    peer: RLUSD_ISSUER,
  })
  const line = lines.result.lines.find((entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER)
  const amount = line ? Number(line.balance) : 0
  return Number.isFinite(amount) ? roundMoney(Math.max(0, amount)) : 0
}

export async function rlusdBalances(addresses: string[]) {
  const unique = [...new Set(addresses.filter((address) => isValidClassicAddress(address)))]
  const balances = new Map<string, number>()
  if (unique.length === 0) return balances
  return withClient(async (client) => {
    for (const address of unique) balances.set(address, await balanceOf(client, address))
    return balances
  })
}

export type RlusdTrust = "missing" | "none" | "trusted"

export async function rlusdTrustLines(addresses: string[]) {
  const unique = [...new Set(addresses.filter((address) => isValidClassicAddress(address)))]
  const trusts = new Map<string, RlusdTrust>()
  if (unique.length === 0) return trusts
  return withClient(async (client) => {
    for (const address of unique) {
      try {
        await client.request({ command: "account_info", account: address, ledger_index: "validated" })
      } catch (error) {
        if (missingAccount(error)) {
          trusts.set(address, "missing")
          continue
        }
        throw error
      }
      const lines = await client.request({
        command: "account_lines",
        account: address,
        ledger_index: "validated",
        peer: RLUSD_ISSUER,
      })
      const trusted = lines.result.lines.some(
        (entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER && Number(entry.limit) > 0,
      )
      trusts.set(address, trusted ? "trusted" : "none")
    }
    return trusts
  })
}
