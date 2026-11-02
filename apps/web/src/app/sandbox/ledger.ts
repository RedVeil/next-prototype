import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import {
  AccountSetAsfFlags,
  Client,
  Wallet,
  decode,
  decodeAccountID,
  isValidClassicAddress,
  xrpToDrops,
  type SubmittableTransaction,
  type TxResponse,
} from "xrpl"
import { RLUSD_CURRENCY, RLUSD_ISSUER, isRlusdCurrency } from "@/ledger/rlusd"
import { withSourceTag } from "@/ledger/source-tag"
import type { createServiceClient } from "@/lib/supabase/service"
import { anyoneCanSend } from "./types"

type ServiceClient = ReturnType<typeof createServiceClient>

export type FundingPayment = {
  destination: string
  amountDrops: string
}

const disableMasterFlag = 0x00100000

class NeedsFunding extends Error {
  constructor(readonly payment: FundingPayment) {
    super("The new account is not funded yet.")
  }
}

export function ledgerSocketUrl() {
  if (process.env.XRPL_WS_URL) return process.env.XRPL_WS_URL
  if (process.env.XRPL_NETWORK === "testnet") return "wss://s.altnet.rippletest.net:51233"
  if (process.env.XRPL_NETWORK === "devnet") return "wss://s.devnet.rippletest.net:51233"
  return "wss://xrplcluster.com"
}

function masterKey() {
  const key = process.env.BOT_WALLET_MASTER_KEY
  if (!key) throw new Error("The bot wallet key is not configured.")
  return key
}

function encryptSeed(seed: string) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(masterKey(), salt, 32)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64")
}

function decryptSeed(encoded: string) {
  const payload = Buffer.from(encoded, "base64")
  const salt = payload.subarray(0, 16)
  const iv = payload.subarray(16, 28)
  const tag = payload.subarray(28, 44)
  const ciphertext = payload.subarray(44)
  const key = scryptSync(masterKey(), salt, 32)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

export function walletFromStoredSeed(ciphertext: string) {
  return Wallet.fromSeed(decryptSeed(ciphertext))
}

function generatedSeed(wallet: Wallet) {
  if (!wallet.seed) throw new Error("The wallet generator did not return a seed.")
  return wallet.seed
}

export async function withClient<T>(run: (client: Client) => Promise<T>) {
  const client = new Client(ledgerSocketUrl())
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.disconnect()
  }
}

function transactionResult(response: TxResponse) {
  const meta = response.result.meta
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String(meta.TransactionResult)
  }
  return ""
}

function isMissingAccount(error: unknown) {
  if (!error || typeof error !== "object") return false
  if ("data" in error && error.data && typeof error.data === "object" && "error" in error.data) {
    return error.data.error === "actNotFound"
  }
  return error instanceof Error && error.message.includes("actNotFound")
}

async function reserveDrops(client: Client, ownerCount: number) {
  const info = await client.request({ command: "server_info" })
  const ledger = info.result.info.validated_ledger
  if (!ledger) throw new Error("The ledger did not report its reserve.")
  return BigInt(xrpToDrops(ledger.reserve_base_xrp + ledger.reserve_inc_xrp * ownerCount))
}

const rlusdTrustLimit = "1000000000"

function rlusdTrustTransaction(account: string): SubmittableTransaction {
  return {
    TransactionType: "TrustSet",
    Account: account,
    LimitAmount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: rlusdTrustLimit },
  }
}

async function fundingPayment(client: Client, destination: string, preauthCount: number): Promise<FundingPayment> {
  const ownerCount = 2 + preauthCount
  const reserve = await reserveDrops(client, ownerCount)
  const feeDrops = BigInt(10000) * BigInt(4 + preauthCount)
  return { destination, amountDrops: (reserve + feeDrops).toString() }
}

async function activationPayment(client: Client, destination: string): Promise<FundingPayment> {
  const reserve = await reserveDrops(client, 1)
  const feeDrops = BigInt(10000)
  return { destination, amountDrops: (reserve + feeDrops).toString() }
}

const accountReserveDrops = BigInt(1000010)

function formatDrops(drops: bigint) {
  const scale = BigInt(1000000)
  const xrp = drops / scale
  const fraction = (drops % scale).toString().padStart(6, "0").replace(/0+$/, "")
  return fraction ? `${xrp}.${fraction}` : xrp.toString()
}

function formatXrp(drops: string) {
  const whole = BigInt(drops)
  const spendable = whole > accountReserveDrops ? whole - accountReserveDrops : BigInt(0)
  return formatDrops(spendable)
}

export async function fundedAddresses(addresses: string[]) {
  const balances = await xrpBalances(addresses)
  return new Set([...balances].filter(([, balance]) => balance !== null).map(([address]) => address))
}

export async function xrpBalances(addresses: string[]) {
  const unique = [...new Set(addresses.filter((address) => isValidClassicAddress(address)))]
  const balances = new Map<string, string | null>()
  if (unique.length === 0) return balances
  return withClient(async (client) => {
    for (const address of unique) {
      const account = await accountExists(client, address)
      balances.set(address, account ? formatXrp(account.Balance) : null)
    }
    return balances
  })
}

export async function reservedXrp(addresses: string[]) {
  const unique = [...new Set(addresses.filter((address) => isValidClassicAddress(address)))]
  const reserves = new Map<string, { reserved: string; free: string } | null>()
  if (unique.length === 0) return reserves
  return withClient(async (client) => {
    const info = await client.request({ command: "server_info" })
    const ledger = info.result.info.validated_ledger
    if (!ledger) throw new Error("The ledger did not report its reserve.")
    for (const address of unique) {
      const account = await accountExists(client, address)
      if (!account) {
        reserves.set(address, null)
        continue
      }
      const required = BigInt(xrpToDrops(ledger.reserve_base_xrp + ledger.reserve_inc_xrp * Number(account.OwnerCount ?? 0)))
      const held = BigInt(account.Balance)
      const reserved = held < required ? held : required
      const free = held > required ? held - required : BigInt(0)
      reserves.set(address, { reserved: formatDrops(reserved), free: formatDrops(free) })
    }
    return reserves
  })
}

async function accountExists(client: Client, address: string) {
  try {
    const info = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    })
    return info.result.account_data
  } catch (error) {
    if (isMissingAccount(error)) return null
    throw error
  }
}

async function trustsRlusd(client: Client, address: string) {
  const lines = await client.request({
    command: "account_lines",
    account: address,
    ledger_index: "validated",
    peer: RLUSD_ISSUER,
  })
  return lines.result.lines.some(
    (entry) => isRlusdCurrency(entry.currency) && entry.account === RLUSD_ISSUER && Number(entry.limit) > 0,
  )
}

async function submitTransaction(
  client: Client,
  wallet: Wallet,
  transaction: SubmittableTransaction,
  allowed = new Set<string>(),
) {
  const prepared = await client.autofill(withSourceTag(transaction))
  const signed = wallet.sign(prepared)
  try {
    const response = await client.submitAndWait(signed.tx_blob)
    const code = transactionResult(response)
    if (code !== "tesSUCCESS" && !allowed.has(code)) {
      throw new Error(code || "The ledger rejected the transaction.")
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if ([...allowed].some((code) => message.includes(code))) return
    throw error
  }
}

async function botIsPreauthorized(client: Client, account: string, botAddress: string) {
  const listed = await client.request({
    command: "account_objects",
    account,
    type: "deposit_preauth",
    ledger_index: "validated",
  })
  return listed.result.account_objects.some((entry) => "Authorize" in entry && entry.Authorize === botAddress)
}

async function preauthorizeWithBot(client: Client, seedCiphertext: string, account: string, botAddress: string) {
  if (await botIsPreauthorized(client, account, botAddress)) return
  const botWallet = Wallet.fromSeed(decryptSeed(seedCiphertext))
  const prepared = await client.autofill(
    withSourceTag({
      TransactionType: "DepositPreauth",
      Account: account,
      Authorize: botAddress,
      SigningPubKey: "",
    }),
  )
  const signed = botWallet.sign(prepared, true)
  const response = await client.submitAndWait(signed.tx_blob)
  const code = transactionResult(response)
  if (code !== "tesSUCCESS" && code !== "tecDUPLICATE") {
    throw new Error(code || "The ledger rejected the bot authorization.")
  }
}

async function clearSetup(supabase: ServiceClient, multisigId: string, created: boolean) {
  await supabase.from("bots").delete().eq("multisig_id", multisigId)
  await supabase.from("org_multisig_signers").delete().eq("multisig_id", multisigId)
  await supabase.from("org_multisig_destinations").delete().eq("multisig_id", multisigId)
  await supabase.from("provision_secrets").delete().eq("id", multisigId)
  if (created) {
    await supabase.from("multisigs").delete().eq("id", multisigId)
    return
  }
  await supabase
    .from("multisigs")
    .update({ address: null, status: "not_created", quorum: 1 })
    .eq("id", multisigId)
}

export async function prepareOrgMultisig(
  supabase: ServiceClient,
  organisationId: string,
  identityIds: string[],
): Promise<{ error?: string; multisigId?: string; payment?: FundingPayment; botPayment?: FundingPayment }> {
  if (!organisationId) return { error: "Choose an organisation." }
  if (identityIds.length === 0) return { error: "Choose at least one wallet." }

  const { data: existing, error: existingError } = await supabase
    .from("multisigs")
    .select("id, address")
    .eq("organisation_id", organisationId)
    .eq("type", "org")
    .maybeSingle()
  if (existingError) return { error: existingError.message }
  if (existing?.address) return { error: "This organisation already has a multisig address." }

  const { data: members, error: memberError } = await supabase
    .from("organisation_members")
    .select("identity_id")
    .eq("organisation_id", organisationId)
  if (memberError) return { error: memberError.message }
  const memberIds = new Set((members ?? []).map((row) => row.identity_id as string))
  if (identityIds.some((id) => !memberIds.has(id))) {
    return { error: "Choose wallets that belong to this organisation." }
  }

  const { data: identities, error: identityError } = await supabase
    .from("identities")
    .select("id, xrpl_address")
    .in("id", identityIds)
  if (identityError) return { error: identityError.message }
  const wallets = (identities ?? []).map((row) => ({
    id: row.id as string,
    address: (row.xrpl_address as string | null) ?? "",
  }))
  if (wallets.length !== identityIds.length || wallets.some((wallet) => !isValidClassicAddress(wallet.address))) {
    return { error: "Every selected user needs a classic XRPL address." }
  }
  if (new Set(wallets.map((wallet) => wallet.address)).size !== wallets.length) {
    return { error: "Choose each wallet address once." }
  }
  if (wallets.length > 31) return { error: "A multisig can include at most 31 wallets besides the bot." }

  const { data: repayment, error: repaymentError } = await supabase
    .from("multisigs")
    .select("address")
    .eq("type", "repayment")
    .maybeSingle()
  if (repaymentError) return { error: repaymentError.message }
  const repaymentAddress = (repayment?.address as string | null) ?? ""
  const repaymentClassic = isValidClassicAddress(repaymentAddress) ? repaymentAddress : ""

  const master = Wallet.generate()
  const bot = Wallet.generate()
  let masterCipher: string
  let botCipher: string
  try {
    masterCipher = encryptSeed(generatedSeed(master))
    botCipher = encryptSeed(generatedSeed(bot))
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The bot wallet key is not configured." }
  }
  const preauthCount = wallets.length + 1 + (repaymentClassic ? 1 : 0)

  let created = false
  let multisigId = (existing?.id as string | undefined) ?? ""
  if (!multisigId) {
    const { data: inserted, error: insertError } = await supabase
      .from("multisigs")
      .insert({
        organisation_id: organisationId,
        type: "org",
        address: master.address,
        status: "not_created",
        quorum: 1,
      })
      .select("id")
      .single()
    if (insertError) return { error: insertError.message }
    multisigId = inserted.id as string
    created = true
  } else {
    const { error: updateError } = await supabase
      .from("multisigs")
      .update({ address: master.address, status: "not_created", quorum: 1 })
      .eq("id", multisigId)
    if (updateError) return { error: updateError.message }
  }

  const fail = async (message: string) => {
    await clearSetup(supabase, multisigId, created)
    return { error: message }
  }

  const { error: botError } = await supabase.from("bots").insert({
    address: bot.address,
    seed_ciphertext: botCipher,
    multisig_id: multisigId,
  })
  if (botError) return fail(botError.message)

  const { error: signerError } = await supabase.from("org_multisig_signers").insert([
    ...wallets.map((wallet) => ({
      multisig_id: multisigId,
      address: wallet.address,
      weight: 1,
      kind: "user",
      identity_id: wallet.id,
    })),
    {
      multisig_id: multisigId,
      address: bot.address,
      weight: 1,
      kind: "bot",
      identity_id: null,
    },
  ])
  if (signerError) return fail(signerError.message)

  const destinations = [
    ...wallets.map((wallet) => ({
      multisig_id: multisigId,
      address: wallet.address,
      kind: "wallet",
    })),
    { multisig_id: multisigId, address: bot.address, kind: "bot" },
    {
      multisig_id: multisigId,
      address: repaymentClassic || null,
      kind: "repayment",
    },
  ]
  const { error: destinationError } = await supabase.from("org_multisig_destinations").insert(destinations)
  if (destinationError) return fail(destinationError.message)

  const { error: secretError } = await supabase.from("provision_secrets").insert({
    id: multisigId,
    address: master.address,
    seed_ciphertext: masterCipher,
  })
  if (secretError) return fail(secretError.message)

  try {
    const payments = await withClient(async (client) => ({
      payment: await fundingPayment(client, master.address, preauthCount),
      botPayment: await activationPayment(client, bot.address),
    }))
    return { multisigId, ...payments }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The ledger did not report its reserve.")
  }
}

type CentralKind = "governance" | "issuer" | "repayment"

export async function prepareCentralMultisig(
  supabase: ServiceClient,
  kind: string,
  signerAddress: string,
): Promise<{ error?: string; multisigId?: string; payment?: FundingPayment; botPayment?: FundingPayment }> {
  if (kind !== "governance" && kind !== "issuer" && kind !== "repayment") {
    return { error: "Choose a multisig type." }
  }
  const centralKind = kind as CentralKind

  const { data: existing, error: existingError } = await supabase
    .from("multisigs")
    .select("id, address")
    .eq("type", centralKind)
    .maybeSingle()
  if (existingError) return { error: existingError.message }
  if (existing?.address) return { error: "This multisig already has an address." }

  let governanceAddress = ""
  if (centralKind !== "governance") {
    const { data: governance, error: governanceError } = await supabase
      .from("multisigs")
      .select("address")
      .eq("type", "governance")
      .maybeSingle()
    if (governanceError) return { error: governanceError.message }
    governanceAddress = (governance?.address as string | null) ?? ""
    if (!isValidClassicAddress(governanceAddress)) {
      return { error: "Create the governance multisig first." }
    }
  } else if (!isValidClassicAddress(signerAddress)) {
    return { error: "Connect a classic XRPL wallet." }
  }

  const master = Wallet.generate()
  const bot = centralKind === "governance" ? null : Wallet.generate()
  let masterCipher: string
  let botCipher = ""
  try {
    masterCipher = encryptSeed(generatedSeed(master))
    if (bot) botCipher = encryptSeed(generatedSeed(bot))
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The bot wallet key is not configured." }
  }

  const signers = bot
    ? [
        { address: bot.address, weight: 1, kind: "bot", identity_id: null },
        { address: governanceAddress, weight: 1, kind: "governance", identity_id: null },
      ]
    : [{ address: signerAddress, weight: 1, kind: "wallet", identity_id: null }]
  const destinations = bot
    ? [
        { address: bot.address, kind: "bot" },
        { address: governanceAddress, kind: "governance" },
      ]
    : [{ address: signerAddress, kind: "wallet" }]
  const preauthCount = destinations.length

  let created = false
  let multisigId = (existing?.id as string | undefined) ?? ""
  if (!multisigId) {
    const { data: inserted, error: insertError } = await supabase
      .from("multisigs")
      .insert({
        organisation_id: null,
        type: centralKind,
        address: master.address,
        status: "not_created",
        quorum: 1,
      })
      .select("id")
      .single()
    if (insertError) return { error: insertError.message }
    multisigId = inserted.id as string
    created = true
  } else {
    const { error: updateError } = await supabase
      .from("multisigs")
      .update({ address: master.address, status: "not_created", quorum: 1 })
      .eq("id", multisigId)
    if (updateError) return { error: updateError.message }
  }

  const fail = async (message: string) => {
    await clearSetup(supabase, multisigId, created)
    return { error: message }
  }

  if (bot) {
    const { error: botError } = await supabase.from("bots").insert({
      address: bot.address,
      seed_ciphertext: botCipher,
      multisig_id: multisigId,
    })
    if (botError) return fail(botError.message)
  }

  const { error: signerError } = await supabase.from("org_multisig_signers").insert(
    signers.map((signer) => ({ ...signer, multisig_id: multisigId })),
  )
  if (signerError) return fail(signerError.message)

  const { error: destinationError } = await supabase.from("org_multisig_destinations").insert(
    destinations.map((destination) => ({ ...destination, multisig_id: multisigId })),
  )
  if (destinationError) return fail(destinationError.message)

  const { error: secretError } = await supabase.from("provision_secrets").insert({
    id: multisigId,
    address: master.address,
    seed_ciphertext: masterCipher,
  })
  if (secretError) return fail(secretError.message)

  try {
    const payments = await withClient(async (client) => ({
      payment: await fundingPayment(client, master.address, preauthCount),
      botPayment: bot ? await activationPayment(client, bot.address) : undefined,
    }))
    return { multisigId, ...payments }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The ledger did not report its reserve.")
  }
}

export async function finishOrgMultisig(
  supabase: ServiceClient,
  multisigId: string,
): Promise<{ error?: string; message?: string; needsFunding?: FundingPayment }> {
  if (!multisigId) return { error: "Choose a multisig to finish." }

  const { data: multisig, error: multisigError } = await supabase
    .from("multisigs")
    .select("id, address, status, quorum")
    .eq("id", multisigId)
    .maybeSingle()
  if (multisigError) return { error: multisigError.message }
  if (!multisig?.address) return { error: "This multisig does not have an address yet." }

  const address = multisig.address as string
  const { data: botRow, error: botError } = await supabase
    .from("bots")
    .select("address, seed_ciphertext")
    .eq("multisig_id", multisigId)
    .maybeSingle()
  if (botError) return { error: botError.message }
  const botAddress = (botRow?.address as string | null) ?? ""
  const botCipher = (botRow?.seed_ciphertext as string | null) ?? ""
  const { data: destinations, error: destinationError } = await supabase
    .from("org_multisig_destinations")
    .select("address")
    .eq("multisig_id", multisigId)
  if (destinationError) return { error: destinationError.message }
  const preauthAddresses = [
    ...new Set(
      (destinations ?? [])
        .map((row) => (row.address as string | null) ?? "")
        .filter((value) => isValidClassicAddress(value)),
    ),
  ]

  const { data: signers, error: signerError } = await supabase
    .from("org_multisig_signers")
    .select("address, weight")
    .eq("multisig_id", multisigId)
  if (signerError) return { error: signerError.message }
  const signerEntries = (signers ?? []).map((row) => ({
    SignerEntry: { Account: row.address as string, SignerWeight: Number(row.weight) },
  }))
  if (signerEntries.length === 0) return { error: "This multisig has no signers." }

  const { data: secret, error: secretError } = await supabase
    .from("provision_secrets")
    .select("seed_ciphertext")
    .eq("id", multisigId)
    .maybeSingle()
  if (secretError) return { error: secretError.message }

  let wallet: Wallet | null = null
  if (secret) {
    try {
      wallet = Wallet.fromSeed(decryptSeed(secret.seed_ciphertext as string))
    } catch {
      return { error: "The setup key for this multisig could not be read." }
    }
  }

  try {
    await withClient(async (client) => {
      const account = await accountExists(client, address)
      if (!account) {
        throw new NeedsFunding(await fundingPayment(client, address, preauthAddresses.length))
      }
      if (isValidClassicAddress(botAddress) && !(await accountExists(client, botAddress))) {
        throw new NeedsFunding(await activationPayment(client, botAddress))
      }
      const flags = Number(account.Flags ?? 0)
      if ((flags & disableMasterFlag) !== 0) {
        if (!isValidClassicAddress(botAddress)) return
        if (!botCipher) throw new Error("The bot key for this multisig is not available.")
        await preauthorizeWithBot(client, botCipher, address, botAddress)
        await submitTransaction(client, Wallet.fromSeed(decryptSeed(botCipher)), rlusdTrustTransaction(botAddress))
        return
      }
      if (!wallet) throw new Error("The setup key for this multisig is no longer available.")

      await submitTransaction(client, wallet, {
        TransactionType: "SignerListSet",
        Account: address,
        SignerQuorum: Number(multisig.quorum) || 1,
        SignerEntries: signerEntries,
      })
      await submitTransaction(client, wallet, {
        TransactionType: "AccountSet",
        Account: address,
        SetFlag: AccountSetAsfFlags.asfDepositAuth,
      })
      for (const authorize of preauthAddresses) {
        if (!(await accountExists(client, authorize))) continue
        await submitTransaction(
          client,
          wallet,
          { TransactionType: "DepositPreauth", Account: address, Authorize: authorize },
          new Set(["tecDUPLICATE"]),
        )
      }
      await submitTransaction(client, wallet, rlusdTrustTransaction(address))
      if (isValidClassicAddress(botAddress)) {
        if (!botCipher) throw new Error("The bot key for this multisig is not available.")
        await submitTransaction(client, Wallet.fromSeed(decryptSeed(botCipher)), rlusdTrustTransaction(botAddress))
      }
      await submitTransaction(client, wallet, {
        TransactionType: "AccountSet",
        Account: address,
        SetFlag: AccountSetAsfFlags.asfDisableMaster,
      })
    })
  } catch (error) {
    if (error instanceof NeedsFunding) return { needsFunding: error.payment }
    return { error: error instanceof Error ? error.message : "The multisig setup did not finish." }
  }

  const { error: deleteError } = await supabase.from("provision_secrets").delete().eq("id", multisigId)
  if (deleteError) return { error: deleteError.message }
  const { error: liveError } = await supabase.from("multisigs").update({ status: "live" }).eq("id", multisigId)
  if (liveError) return { error: liveError.message }
  return { message: multisig.status === "live" ? "Activated the bot." : "Created the multisig." }
}

const lsfDepositAuth = 0x01000000
const maxList = 32

export type SignerChange = {
  multisigId: string
  quorum: number
  signers: { address: string; weight: number }[]
  walletAddress: string
}

export type DepositChange = {
  multisigId: string
  allowAnyone: boolean
  addresses: string[]
  walletAddress: string
}

export type LedgerChange = {
  error?: string
  message?: string
  transactions?: SubmittableTransaction[]
}

type PlannedTransaction = SubmittableTransaction
type SignerEntry = { address: string; weight: number }

function compareAddress(left: string, right: string) {
  const a = Buffer.from(decodeAccountID(left))
  const b = Buffer.from(decodeAccountID(right))
  return a.compare(b)
}

function sameSigners(current: SignerEntry[], currentQuorum: number, next: SignerEntry[], quorum: number) {
  if (currentQuorum !== quorum || current.length !== next.length) return false
  const left = [...current].sort((a, b) => compareAddress(a.address, b.address))
  const right = [...next].sort((a, b) => compareAddress(a.address, b.address))
  return left.every((signer, index) => signer.address === right[index]?.address && signer.weight === right[index]?.weight)
}

function signerListTransaction(account: string, quorum: number, signers: SignerEntry[]): PlannedTransaction {
  return {
    TransactionType: "SignerListSet",
    Account: account,
    SignerQuorum: quorum,
    SignerEntries: [...signers]
      .sort((a, b) => compareAddress(a.address, b.address))
      .map((signer) => ({ SignerEntry: { Account: signer.address, SignerWeight: signer.weight } })),
  }
}

async function submitWithBot(client: Client, seedCiphertext: string, transaction: PlannedTransaction) {
  const botWallet = Wallet.fromSeed(decryptSeed(seedCiphertext))
  const prepared = await client.autofill(withSourceTag({ ...transaction, SigningPubKey: "" }), 1)
  const signed = botWallet.sign(prepared, true)
  await submitBlob(client, signed.tx_blob)
}

async function submitBlob(client: Client, blob: string) {
  try {
    const response = await client.submitAndWait(blob)
    const code = transactionResult(response)
    if (code !== "tesSUCCESS") throw new Error(code || "The ledger rejected the transaction.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "The ledger rejected the transaction."
    if (message.includes("tesSUCCESS")) return
    throw new Error(message)
  }
}

async function prepareForWallet(client: Client, account: string, walletAddress: string, transactions: PlannedTransaction[]) {
  const info = await accountExists(client, account)
  if (!info) throw new Error("This multisig is not on the ledger.")
  let sequence = Number(info.Sequence)
  const prepared: PlannedTransaction[] = []
  for (const transaction of transactions) {
    prepared.push(
      await client.autofill(
        withSourceTag({
          ...transaction,
          Sequence: sequence,
          SigningPubKey: "",
          Signers: [{ Signer: { Account: walletAddress, SigningPubKey: "", TxnSignature: "" } }],
        }) as PlannedTransaction,
        1,
      ),
    )
    sequence += 1
  }
  return prepared
}

async function depositAuthorizations(client: Client, account: string) {
  const addresses = new Set<string>()
  let marker: string | undefined
  do {
    const listed = await client.request({
      command: "account_objects",
      account,
      type: "deposit_preauth",
      ledger_index: "validated",
      limit: 400,
      ...(marker ? { marker } : {}),
    })
    for (const entry of listed.result.account_objects) {
      if ("Authorize" in entry && typeof entry.Authorize === "string") addresses.add(entry.Authorize)
    }
    marker = typeof listed.result.marker === "string" ? listed.result.marker : undefined
  } while (marker)
  return addresses
}

async function ledgerSigners(client: Client, account: string) {
  const listed = await client.request({
    command: "account_objects",
    account,
    type: "signer_list",
    ledger_index: "validated",
  })
  const entry = listed.result.account_objects.find((item) => "SignerEntries" in item)
  if (!entry || !("SignerEntries" in entry)) return { quorum: 0, signers: [] as SignerEntry[] }
  const quorum = "SignerQuorum" in entry ? Number(entry.SignerQuorum) : 0
  const signers = (entry.SignerEntries ?? []).map((item) => ({
    address: item.SignerEntry.Account,
    weight: Number(item.SignerEntry.SignerWeight),
  }))
  return { quorum, signers }
}

function depositTransactions(account: string, open: boolean, flagOn: boolean, current: Set<string>, wanted: string[]) {
  const transactions: PlannedTransaction[] = []
  if (open) {
    if (flagOn) {
      transactions.push({
        TransactionType: "AccountSet",
        Account: account,
        ClearFlag: AccountSetAsfFlags.asfDepositAuth,
      })
    }
    return transactions
  }
  for (const address of wanted) {
    if (!current.has(address)) {
      transactions.push({ TransactionType: "DepositPreauth", Account: account, Authorize: address })
    }
  }
  for (const address of current) {
    if (!wanted.includes(address)) {
      transactions.push({ TransactionType: "DepositPreauth", Account: account, Unauthorize: address })
    }
  }
  if (!flagOn) {
    transactions.push({
      TransactionType: "AccountSet",
      Account: account,
      SetFlag: AccountSetAsfFlags.asfDepositAuth,
    })
  }
  return transactions
}

type LiveMultisig = { id: string; address: string; quorum: number }

async function liveMultisig(supabase: ServiceClient, multisigId: string): Promise<{ error: string } | LiveMultisig> {
  if (!multisigId) return { error: "Choose a multisig." }
  const { data, error } = await supabase
    .from("multisigs")
    .select("id, address, status, quorum")
    .eq("id", multisigId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data?.address || data.status !== "live") return { error: "Finish setup before changing this multisig." }
  return { id: data.id as string, address: data.address as string, quorum: Number(data.quorum) }
}

async function currentSigners(supabase: ServiceClient, multisigId: string) {
  const { data, error } = await supabase
    .from("org_multisig_signers")
    .select("address, weight")
    .eq("multisig_id", multisigId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ address: row.address as string, weight: Number(row.weight) }))
}

async function signingMaterial(
  supabase: ServiceClient,
  multisigId: string,
  quorum: number,
  walletAddress: string,
): Promise<{ seed: string } | { walletAddress: string } | { error: string }> {
  const signers = await currentSigners(supabase, multisigId)
  const { data: bots, error } = await supabase.from("bots").select("address, seed_ciphertext").eq("multisig_id", multisigId)
  if (error) throw new Error(error.message)
  const bot = (bots ?? []).find((row) => {
    const address = (row.address as string | null) ?? ""
    const signer = signers.find((item) => item.address === address)
    return Boolean(signer && signer.weight >= quorum && row.seed_ciphertext)
  })
  if (bot) return { seed: bot.seed_ciphertext as string }
  const wallet = signers.find((signer) => signer.address === walletAddress && signer.weight >= quorum)
  if (wallet) return { walletAddress }
  if (!walletAddress) return { error: "Connect a signer wallet that can meet the quorum." }
  return { error: "The connected wallet cannot meet the quorum." }
}

function decodedTransactions(blobs: string[]) {
  return blobs.map((blob) => {
    try {
      return decode(blob)
    } catch {
      return null
    }
  })
}

function signerAccount(tx: Record<string, unknown>) {
  const signers = tx.Signers
  if (!Array.isArray(signers) || signers.length !== 1) return ""
  const entry = signers[0] as { Signer?: { Account?: string } }
  return entry.Signer?.Account ?? ""
}

function matchesPlan(actual: Record<string, unknown> | null, expected: PlannedTransaction) {
  if (!actual || actual.TransactionType !== expected.TransactionType || actual.Account !== expected.Account) return false
  if (expected.TransactionType === "SignerListSet") {
    const wanted = new Map(expected.SignerEntries?.map((entry) => [entry.SignerEntry.Account, entry.SignerEntry.SignerWeight]))
    const entries = actual.SignerEntries
    if (!Array.isArray(entries) || entries.length !== wanted.size || Number(actual.SignerQuorum) !== expected.SignerQuorum) {
      return false
    }
    return entries.every((entry) => {
      const signer = (entry as { SignerEntry?: { Account?: string; SignerWeight?: number } }).SignerEntry
      return signer?.Account != null && wanted.get(signer.Account) === Number(signer.SignerWeight)
    })
  }
  if (expected.TransactionType === "DepositPreauth") {
    return actual.Authorize === expected.Authorize && actual.Unauthorize === expected.Unauthorize
  }
  if (expected.TransactionType === "AccountSet") {
    return Number(actual.SetFlag ?? 0) === Number(expected.SetFlag ?? 0) && Number(actual.ClearFlag ?? 0) === Number(expected.ClearFlag ?? 0)
  }
  if (expected.TransactionType === "TrustSet") {
    const wanted = expected.LimitAmount
    const limit = actual.LimitAmount as { currency?: unknown; issuer?: unknown; value?: unknown } | string | undefined
    if (!wanted || typeof wanted === "string" || !limit || typeof limit === "string") return false
    return limit.currency === wanted.currency && limit.issuer === wanted.issuer && limit.value === wanted.value
  }
  return false
}

async function applyPlan(
  supabase: ServiceClient,
  multisig: LiveMultisig,
  walletAddress: string,
  transactions: PlannedTransaction[],
  blobs: string[] | null,
) {
  if (transactions.length === 0) return {}
  const signer = await signingMaterial(supabase, multisig.id, multisig.quorum, walletAddress)
  if ("error" in signer) return { error: signer.error }
  try {
    if ("seed" in signer && !blobs) {
      await withClient(async (client) => {
        const seed = "seed" in signer ? signer.seed : ""
        for (const transaction of transactions) await submitWithBot(client, seed, transaction)
      })
      return {}
    }
    if (!blobs) {
      const signingWallet = "walletAddress" in signer ? signer.walletAddress : ""
      if (!signingWallet) return { error: "Connect a signer wallet that can meet the quorum." }
      const transactionsForWallet = await withClient((client) =>
        prepareForWallet(client, multisig.address, signingWallet, transactions),
      )
      return { transactions: transactionsForWallet }
    }
    if (blobs.length !== transactions.length) return { error: "The signed transactions do not match this change." }
    const decoded = decodedTransactions(blobs)
    const signerAddresses = new Set((await currentSigners(supabase, multisig.id)).filter((item) => item.weight >= multisig.quorum).map((item) => item.address))
    if (decoded.some((tx, index) => !matchesPlan(tx, transactions[index]!) || !signerAddresses.has(signerAccount(tx ?? {})))) {
      return { error: "The signed transactions do not match this change." }
    }
    await withClient(async (client) => {
      for (const blob of blobs) await submitBlob(client, blob)
    })
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger rejected the transaction." }
  }
}

async function signerRows(supabase: ServiceClient, multisigId: string, signers: SignerEntry[]) {
  const addresses = signers.map((signer) => signer.address)
  const [bots, identities, multisigs] = await Promise.all([
    supabase.from("bots").select("address").eq("multisig_id", multisigId),
    addresses.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("identities").select("id, xrpl_address").in("xrpl_address", addresses),
    addresses.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("multisigs").select("type, address").in("address", addresses),
  ])
  if (bots.error) return { error: bots.error.message }
  if (identities.error) return { error: identities.error.message }
  if (multisigs.error) return { error: multisigs.error.message }
  const botAddresses = new Set((bots.data ?? []).map((row) => (row.address as string | null) ?? ""))
  const identityByAddress = new Map(
    (identities.data ?? []).map((row) => [(row.xrpl_address as string | null) ?? "", row.id as string]),
  )
  const governance = new Set(
    (multisigs.data ?? []).filter((row) => row.type === "governance").map((row) => (row.address as string | null) ?? ""),
  )
  return {
    rows: signers.map((signer) => {
      if (botAddresses.has(signer.address)) {
        return { multisig_id: multisigId, address: signer.address, weight: signer.weight, kind: "bot", identity_id: null }
      }
      if (governance.has(signer.address)) {
        return { multisig_id: multisigId, address: signer.address, weight: signer.weight, kind: "governance", identity_id: null }
      }
      const identityId = identityByAddress.get(signer.address)
      if (identityId) {
        return { multisig_id: multisigId, address: signer.address, weight: signer.weight, kind: "user", identity_id: identityId }
      }
      return { multisig_id: multisigId, address: signer.address, weight: signer.weight, kind: "wallet", identity_id: null }
    }),
  }
}

async function saveSigners(supabase: ServiceClient, multisigId: string, signers: SignerEntry[], quorum: number) {
  const described = await signerRows(supabase, multisigId, signers)
  if ("error" in described && described.error) return described.error
  const rows = described.rows ?? []
  if (rows.length > 0) {
    const { error } = await supabase.from("org_multisig_signers").upsert(rows, { onConflict: "multisig_id,address" })
    if (error) return error.message
  }
  const { data: existing, error: readError } = await supabase
    .from("org_multisig_signers")
    .select("id, address")
    .eq("multisig_id", multisigId)
  if (readError) return readError.message
  const keep = new Set(signers.map((signer) => signer.address))
  const remove = (existing ?? []).filter((row) => !keep.has(row.address as string)).map((row) => row.id as string)
  if (remove.length > 0) {
    const { error } = await supabase.from("org_multisig_signers").delete().in("id", remove)
    if (error) return error.message
  }
  const { error } = await supabase.from("multisigs").update({ quorum }).eq("id", multisigId)
  return error?.message
}

async function destinationRows(supabase: ServiceClient, multisigId: string, addresses: string[]) {
  const [bots, multisigs] = await Promise.all([
    supabase.from("bots").select("address").eq("multisig_id", multisigId),
    addresses.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("multisigs").select("type, address").in("address", addresses),
  ])
  if (bots.error) return { error: bots.error.message }
  if (multisigs.error) return { error: multisigs.error.message }
  const botAddresses = new Set((bots.data ?? []).map((row) => (row.address as string | null) ?? ""))
  const byAddress = new Map((multisigs.data ?? []).map((row) => [(row.address as string | null) ?? "", row.type as string]))
  return {
    rows: addresses.map((address) => {
      const type = byAddress.get(address)
      const kind = botAddresses.has(address) ? "bot" : type === "governance" ? "governance" : type === "repayment" ? "repayment" : "wallet"
      return { multisig_id: multisigId, address, kind }
    }),
  }
}

async function saveDeposits(supabase: ServiceClient, multisigId: string, allowAnyone: boolean, addresses: string[]) {
  const described = allowAnyone
    ? { rows: [{ multisig_id: multisigId, address: anyoneCanSend, kind: "wallet" }] }
    : await destinationRows(supabase, multisigId, addresses)
  if ("error" in described && described.error) return described.error
  const { error: deleteError } = await supabase.from("org_multisig_destinations").delete().eq("multisig_id", multisigId)
  if (deleteError) return deleteError.message
  const rows = described.rows ?? []
  if (rows.length === 0) return undefined
  const { error } = await supabase.from("org_multisig_destinations").insert(rows)
  return error?.message
}

async function planSignerChange(client: Client, account: string, quorum: number, signers: SignerEntry[]) {
  const current = await ledgerSigners(client, account)
  if (sameSigners(current.signers, current.quorum, signers, quorum)) return []
  return [signerListTransaction(account, quorum, signers)]
}

async function planDepositChange(client: Client, account: string, allowAnyone: boolean, addresses: string[]) {
  const info = await accountExists(client, account)
  if (!info) throw new Error("This multisig is not on the ledger.")
  for (const address of addresses) {
    if (allowAnyone) break
    if (!(await accountExists(client, address))) throw new Error(`${address} is not on the ledger yet.`)
  }
  const flagOn = (Number(info.Flags ?? 0) & lsfDepositAuth) !== 0
  const current = await depositAuthorizations(client, account)
  return depositTransactions(account, allowAnyone, flagOn, current, allowAnyone ? [] : addresses)
}

export async function changeMultisigSigners(
  supabase: ServiceClient,
  change: SignerChange,
  blobs: string[] | null = null,
): Promise<LedgerChange> {
  const multisig = await liveMultisig(supabase, change.multisigId)
  if ("error" in multisig) return multisig
  if (change.signers.length === 0) return { error: "Keep at least one signer." }
  if (change.signers.length > maxList) return { error: "A multisig can have at most 32 signers." }
  if (!Number.isInteger(change.quorum) || change.quorum < 1) return { error: "Quorum must be at least 1." }
  const total = change.signers.reduce((sum, signer) => sum + signer.weight, 0)
  if (change.quorum > total) return { error: "The quorum is higher than the total signer weight." }
  let transactions: PlannedTransaction[]
  try {
    transactions = blobs
      ? [signerListTransaction(multisig.address, change.quorum, change.signers)]
      : await withClient((client) => planSignerChange(client, multisig.address, change.quorum, change.signers))
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger did not report the signer list." }
  }
  if (blobs && transactions.length === 1) {
    const current = await withClient((client) => ledgerSigners(client, multisig.address)).catch(() => null)
    if (current && sameSigners(current.signers, current.quorum, change.signers, change.quorum)) transactions = []
  }
  const applied = await applyPlan(supabase, multisig, change.walletAddress, transactions, blobs)
  if (applied.error) return applied
  if (applied.transactions) return { transactions: applied.transactions }
  const saved = await saveSigners(supabase, multisig.id, change.signers, change.quorum)
  if (saved) return { error: saved }
  return { message: "Saved the signers." }
}

export async function changeMultisigDeposits(
  supabase: ServiceClient,
  change: DepositChange,
  blobs: string[] | null = null,
): Promise<LedgerChange> {
  const multisig = await liveMultisig(supabase, change.multisigId)
  if ("error" in multisig) return multisig
  if (!change.allowAnyone && change.addresses.length > maxList) return { error: "Choose at most 32 addresses." }
  let transactions: PlannedTransaction[]
  try {
    transactions = await withClient((client) =>
      planDepositChange(client, multisig.address, change.allowAnyone, change.allowAnyone ? [] : change.addresses),
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger did not report the deposit list." }
  }
  const applied = await applyPlan(supabase, multisig, change.walletAddress, transactions, blobs)
  if (applied.error) return applied
  if (applied.transactions) return { transactions: applied.transactions }
  const saved = await saveDeposits(supabase, multisig.id, change.allowAnyone, change.addresses)
  if (saved) return { error: saved }
  return { message: change.allowAnyone ? "Anyone can send funds." : "Saved who can send funds." }
}

export async function trustMultisigRlusd(
  supabase: ServiceClient,
  multisigId: string,
  walletAddress: string,
  blobs: string[] | null = null,
): Promise<LedgerChange> {
  const multisig = await liveMultisig(supabase, multisigId)
  if ("error" in multisig) return multisig
  try {
    const already = await withClient((client) => trustsRlusd(client, multisig.address))
    if (already) return { message: "This multisig already trusts RLUSD." }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger did not report the trust line." }
  }
  const applied = await applyPlan(supabase, multisig, walletAddress, [rlusdTrustTransaction(multisig.address)], blobs)
  if (applied.error) return applied
  if (applied.transactions) return { transactions: applied.transactions }
  return { message: "The multisig trusts RLUSD." }
}

export async function trustBotRlusd(supabase: ServiceClient, botId: string): Promise<LedgerChange> {
  if (!botId) return { error: "Choose a bot." }
  const { data, error } = await supabase.from("bots").select("address, seed_ciphertext").eq("id", botId).maybeSingle()
  if (error) return { error: error.message }
  const address = (data?.address as string | null) ?? ""
  const seed = (data?.seed_ciphertext as string | null) ?? ""
  if (!isValidClassicAddress(address) || !seed) return { error: "This bot is not available." }
  try {
    await withClient(async (client) => {
      if (!(await accountExists(client, address))) throw new Error("This bot is not on the ledger.")
      if (await trustsRlusd(client, address)) return
      await submitTransaction(client, Wallet.fromSeed(decryptSeed(seed)), rlusdTrustTransaction(address))
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The ledger rejected the trust line." }
  }
  return { message: "The bot trusts RLUSD." }
}
