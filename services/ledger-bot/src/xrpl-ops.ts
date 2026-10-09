import {
  DEFAULT_RLUSD_ISSUER,
  RLUSD_CURRENCY,
  buildDepositAuth,
  buildDepositPreauth,
  buildDisableMaster,
  buildSignerListSet,
  buildTrustSet,
} from "@antecipa/xrpl"
import {
  Client,
  Wallet,
  dropsToXrp,
  isValidClassicAddress,
  multisign,
  xrpToDrops,
  type SubmittableTransaction,
} from "xrpl"
import { decryptSeed, encryptSeed } from "./crypto"
import { db } from "./db"
import { requireEnv } from "./env"

export const LSF_DISABLE_MASTER = 0x00100000
export const LSF_DEPOSIT_AUTH = 0x01000000

export function rlusdIssuer(): string {
  return process.env.RLUSD_ISSUER || DEFAULT_RLUSD_ISSUER
}

export function assertClassicAddress(address: string) {
  if (!isValidClassicAddress(address)) {
    throw new Error("XRPL address must be a classic r-address")
  }
}

type TxResult = {
  result: {
    hash?: string
    meta?: unknown
  }
}

function transactionResult(result: TxResult): string | null {
  const meta = result.result.meta
  if (typeof meta === "object" && meta && "TransactionResult" in meta) {
    return String((meta as { TransactionResult: string }).TransactionResult)
  }
  return null
}

function assertTesSuccess(result: TxResult) {
  const code = transactionResult(result)
  if (code && code !== "tesSUCCESS") throw new Error(code)
}

async function connectMainnet(): Promise<Client> {
  const client = new Client(requireEnv("XRPL_WS_URL"))
  await client.connect()
  const info = await client.request({ command: "server_info" })
  const networkId = info.result.info.network_id
  if (typeof networkId === "number" && networkId !== 0) {
    await client.disconnect()
    throw new Error("Refusing to submit: the XRPL server is not mainnet")
  }
  return client
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connectMainnet()
  try {
    return await fn(client)
  } finally {
    await client.disconnect()
  }
}

export async function withMainnet<T>(fn: (client: Client, funder: Wallet) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    const funder = Wallet.fromSeed(requireEnv("XRPL_FUNDER_SEED"))
    return fn(client, funder)
  })
}

async function reserveXrp(client: Client, ownerObjects: number, bufferXrp: number): Promise<string> {
  const info = await client.request({ command: "server_info" })
  const ledger = info.result.info.validated_ledger
  if (!ledger) throw new Error("XRPL server has no validated ledger yet")
  const base = Number(ledger.reserve_base_xrp)
  const inc = Number(ledger.reserve_inc_xrp)
  return (base + inc * ownerObjects + bufferXrp).toFixed(6)
}

export async function ensureFunded(client: Client, funder: Wallet, address: string, ownerObjects: number) {
  const exists = await accountExists(client, address)
  if (exists) return
  const drops = xrpToDrops(await reserveXrp(client, ownerObjects, ownerObjects === 0 ? 1 : 2))
  await submitMaster(client, funder, {
    TransactionType: "Payment",
    Account: funder.address,
    Destination: address,
    Amount: drops,
  })
}

async function accountExists(client: Client, address: string): Promise<boolean> {
  try {
    await client.request({ command: "account_info", account: address, ledger_index: "validated" })
    return true
  } catch (error) {
    if (String(error).includes("actNotFound")) return false
    throw error
  }
}

async function accountFlags(client: Client, address: string): Promise<number> {
  const info = await client.request({ command: "account_info", account: address, ledger_index: "validated" })
  return Number(info.result.account_data.Flags ?? 0)
}

async function submitMaster(client: Client, wallet: Wallet, tx: object): Promise<{ hash: string; feeDrops: string }> {
  const prepared = await client.autofill(tx as SubmittableTransaction)
  const signed = wallet.sign(prepared)
  const result = await client.submitAndWait(signed.tx_blob)
  assertTesSuccess(result as TxResult)
  return { hash: result.result.hash, feeDrops: String(prepared.Fee ?? "0") }
}

export async function submitMultisigned(
  client: Client,
  signers: Wallet[],
  tx: object,
): Promise<{ hash: string; feeDrops: string }> {
  const prepared = await client.autofill(tx as SubmittableTransaction)
  const fee = Number(prepared.Fee ?? "12")
  prepared.Fee = String(Math.ceil(fee * (1 + signers.length)))
  const blobs = signers.map((signer) => signer.sign(prepared, true).tx_blob)
  const combined = multisign(blobs)
  const result = await client.submitAndWait(combined)
  assertTesSuccess(result as TxResult)
  return { hash: result.result.hash, feeDrops: String(prepared.Fee) }
}

async function hasSignerList(client: Client, address: string): Promise<boolean> {
  const page = await client.request({
    command: "account_objects",
    account: address,
    type: "signer_list",
    ledger_index: "validated",
  })
  return page.result.account_objects.length > 0
}

async function hasPreauth(client: Client, account: string, authorized: string): Promise<boolean> {
  const page = await client.request({
    command: "account_objects",
    account,
    type: "deposit_preauth",
    ledger_index: "validated",
  })
  return page.result.account_objects.some((object) => {
    const record = object as { Authorize?: string }
    return record.Authorize === authorized
  })
}

async function hasTrustLine(client: Client, account: string, issuer: string): Promise<boolean> {
  const lines = await client.request({ command: "account_lines", account, ledger_index: "validated" })
  return lines.result.lines.some((line) => line.currency === RLUSD_CURRENCY && line.account === issuer)
}

export async function readRlusdBalance(address: string): Promise<string> {
  return withClient(async (client) => {
    try {
      const lines = await client.request({ command: "account_lines", account: address, ledger_index: "validated" })
      const line = lines.result.lines.find(
        (entry) => entry.currency === RLUSD_CURRENCY && entry.account === rlusdIssuer(),
      )
      return line?.balance ?? "0"
    } catch (error) {
      if (String(error).includes("actNotFound")) return "0"
      throw error
    }
  })
}

export async function readXrpBalance(address: string): Promise<string> {
  return withClient(async (client) => {
    try {
      const info = await client.request({ command: "account_info", account: address, ledger_index: "validated" })
      return String(dropsToXrp(info.result.account_data.Balance))
    } catch (error) {
      if (String(error).includes("actNotFound")) return "0"
      throw error
    }
  })
}

export async function rememberWallet(id: string): Promise<Wallet> {
  const existing = await db().from("provision_secrets").select("seed_ciphertext").eq("id", id).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data?.seed_ciphertext) {
    return Wallet.fromSeed(decryptSeed(existing.data.seed_ciphertext))
  }
  const wallet = Wallet.generate()
  if (!wallet.seed) throw new Error("Generated wallet has no seed")
  const inserted = await db().from("provision_secrets").insert({
    id,
    address: wallet.address,
    seed_ciphertext: encryptSeed(wallet.seed),
  })
  if (inserted.error) throw new Error(inserted.error.message)
  return wallet
}

export async function forgetSecret(id: string) {
  const removed = await db().from("provision_secrets").delete().eq("id", id)
  if (removed.error) throw new Error(removed.error.message)
}

export async function finishMultisig(
  client: Client,
  master: Wallet,
  spec: {
    quorum: number
    signers: { address: string; weight: number }[]
    preauth: string[]
    trust: boolean
  },
) {
  const flags = await accountFlags(client, master.address)
  if (!(await hasSignerList(client, master.address))) {
    await submitMaster(client, master, buildSignerListSet({
      account: master.address,
      quorum: spec.quorum,
      signers: spec.signers,
    }))
  }
  for (const authorized of spec.preauth) {
    if (await hasPreauth(client, master.address, authorized)) continue
    const tx = buildDepositPreauth({ account: master.address, authorize: authorized })
    await submitMaster(client, master, {
      TransactionType: "DepositPreauth",
      Account: tx.Account,
      Authorize: authorized,
    })
  }
  if (spec.trust && !(await hasTrustLine(client, master.address, rlusdIssuer()))) {
    const trust = buildTrustSet({ account: master.address, issuer: rlusdIssuer() })
    await submitMaster(client, master, trust)
  }
  const flagsNow = flags & LSF_DEPOSIT_AUTH ? flags : await accountFlags(client, master.address)
  if ((flagsNow & LSF_DEPOSIT_AUTH) === 0) {
    await submitMaster(client, master, buildDepositAuth(master.address))
  }
  const after = await accountFlags(client, master.address)
  if ((after & LSF_DISABLE_MASTER) === 0) {
    await submitMaster(client, master, buildDisableMaster(master.address))
  }
}

export function sameAmount(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const trimmed = value.trim()
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
    const [whole, fraction = ""] = trimmed.split(".")
    return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`
  }
  const a = normalize(left)
  const b = normalize(right)
  return a != null && a === b
}

export async function addBotFee(botWalletId: string, feeDrops: string) {
  const row = await db().from("bot_wallets").select("xrp_fees_spent").eq("id", botWalletId).maybeSingle()
  if (row.error) throw new Error(row.error.message)
  const current = Number(row.data?.xrp_fees_spent ?? 0)
  const added = Number(dropsToXrp(feeDrops))
  const updated = await db()
    .from("bot_wallets")
    .update({ xrp_fees_spent: current + added })
    .eq("id", botWalletId)
  if (updated.error) throw new Error(updated.error.message)
}
