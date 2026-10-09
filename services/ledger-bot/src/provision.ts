import { encryptSeed } from "./crypto"
import { db } from "./db"
import {
  assertClassicAddress,
  ensureFunded,
  finishMultisig,
  forgetSecret,
  readXrpBalance,
  rememberWallet,
  withMainnet,
} from "./xrpl-ops"

type InvestorRow = {
  id: string
  own_xrpl_address: string | null
  application_status: string
}

async function requireCentral(role: "central_governance" | "central_repayment") {
  const row = await db().from("multisig_accounts").select("id, classic_address").eq("role", role).maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data) throw new Error("Central multisigs are not bootstrapped. Run the ledger-bot bootstrap first.")
  return row.data as { id: string; classic_address: string }
}

async function saveInvestorMultisig(input: {
  investorId: string
  role: "investor_wallet" | "investor_reservation"
  address: string
  quorum: number
  signers: { address: string; weight: number; kind: "bot" | "investor" | "central_governance" }[]
  senders: { address: string; label: string }[]
}) {
  const existing = await db()
    .from("multisig_accounts")
    .select("id")
    .eq("investor_id", input.investorId)
    .eq("role", input.role)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data.id as string
  const inserted = await db()
    .from("multisig_accounts")
    .insert({
      investor_id: input.investorId,
      role: input.role,
      classic_address: input.address,
      quorum: input.quorum,
      deposit_auth_enabled: true,
    })
    .select("id")
    .single()
  if (inserted.error) throw new Error(inserted.error.message)
  const id = inserted.data.id as string
  const signers = await db().from("multisig_signers").insert(
    input.signers.map((signer) => ({
      multisig_account_id: id,
      address: signer.address,
      weight: signer.weight,
      kind: signer.kind,
    })),
  )
  if (signers.error) throw new Error(signers.error.message)
  const senders = await db().from("multisig_authorized_senders").insert(
    input.senders.map((sender) => ({
      multisig_account_id: id,
      xrpl_address: sender.address,
      label: sender.label,
    })),
  )
  if (senders.error) throw new Error(senders.error.message)
  return id
}

async function saveBot(
  wallet: { address: string; seed?: string },
  purpose: "investor_wallet" | "investor_reservation",
  multisigId: string,
) {
  const existing = await db().from("bot_wallets").select("id").eq("public_address", wallet.address).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data.id as string
  if (!wallet.seed) throw new Error("Bot wallet has no seed")
  const balance = await readXrpBalance(wallet.address)
  const inserted = await db()
    .from("bot_wallets")
    .insert({
      public_address: wallet.address,
      multisig_account_id: multisigId,
      purpose,
      xrp_balance: balance,
      seed_ciphertext: encryptSeed(wallet.seed),
    })
    .select("id")
    .single()
  if (inserted.error) throw new Error(inserted.error.message)
  return inserted.data.id as string
}

export async function enqueueInvestorProvision(investorId: string) {
  const existing = await db()
    .from("ledger_jobs")
    .select("id, payload, status")
    .eq("type", "provision_investor_multisigs")
    .in("status", ["queued", "running", "succeeded"])
  if (existing.error) throw new Error(existing.error.message)
  const duplicate = (existing.data ?? []).some((job) => {
    const payload = job.payload as { investorId?: string } | null
    return payload?.investorId === investorId
  })
  if (duplicate) return
  const inserted = await db().from("ledger_jobs").insert({
    type: "provision_investor_multisigs",
    payload: { investorId },
    status: "queued",
  })
  if (inserted.error) throw new Error(inserted.error.message)
}

export async function requeueProvisionJob(jobId: string) {
  const updated = await db()
    .from("ledger_jobs")
    .update({ status: "queued", last_error: null })
    .eq("id", jobId)
    .eq("type", "provision_investor_multisigs")
    .eq("status", "failed")
  if (updated.error) throw new Error(updated.error.message)
}

export async function provisionInvestor(investorId: string): Promise<string> {
  const investorResult = await db()
    .from("investors")
    .select("id, own_xrpl_address, application_status")
    .eq("id", investorId)
    .maybeSingle()
  if (investorResult.error) throw new Error(investorResult.error.message)
  const investor = investorResult.data as InvestorRow | null
  if (!investor) throw new Error("Investor not found")
  if (investor.application_status !== "accepted") throw new Error("Investor is not accepted")
  if (!investor.own_xrpl_address) throw new Error("Investor has no XRPL address")
  assertClassicAddress(investor.own_xrpl_address)

  const governance = await requireCentral("central_governance")
  const repayment = await requireCentral("central_repayment")

  const bot1 = await rememberWallet(`investor:${investorId}:bot-wallet`)
  const bot2 = await rememberWallet(`investor:${investorId}:bot-reservation`)
  const ms1 = await rememberWallet(`investor:${investorId}:master-wallet`)
  const ms2 = await rememberWallet(`investor:${investorId}:master-reservation`)

  await withMainnet(async (client, funder) => {
    await ensureFunded(client, funder, bot1.address, 0)
    await ensureFunded(client, funder, bot2.address, 0)
    await ensureFunded(client, funder, ms1.address, 4)
    await ensureFunded(client, funder, ms2.address, 3)
    await finishMultisig(client, ms1, {
      quorum: 1,
      signers: [
        { address: bot1.address, weight: 1 },
        { address: investor.own_xrpl_address!, weight: 1 },
        { address: governance.classic_address, weight: 1 },
      ],
      preauth: [investor.own_xrpl_address!, repayment.classic_address],
      trust: true,
    })
    await finishMultisig(client, ms2, {
      quorum: 1,
      signers: [
        { address: bot2.address, weight: 1 },
        { address: governance.classic_address, weight: 1 },
      ],
      preauth: [ms1.address],
      trust: true,
    })
  })

  const walletId = await saveInvestorMultisig({
    investorId,
    role: "investor_wallet",
    address: ms1.address,
    quorum: 1,
    signers: [
      { address: bot1.address, weight: 1, kind: "bot" },
      { address: investor.own_xrpl_address, weight: 1, kind: "investor" },
      { address: governance.classic_address, weight: 1, kind: "central_governance" },
    ],
    senders: [
      { address: investor.own_xrpl_address, label: "Investor account" },
      { address: repayment.classic_address, label: "Central repayment" },
    ],
  })
  const reservationId = await saveInvestorMultisig({
    investorId,
    role: "investor_reservation",
    address: ms2.address,
    quorum: 1,
    signers: [
      { address: bot2.address, weight: 1, kind: "bot" },
      { address: governance.classic_address, weight: 1, kind: "central_governance" },
    ],
    senders: [{ address: ms1.address, label: "Investor multisig 1" }],
  })
  await saveBot(bot1, "investor_wallet", walletId)
  const reservationBotId = await saveBot(bot2, "investor_reservation", reservationId)
  void reservationBotId

  await forgetSecret(`investor:${investorId}:master-wallet`)
  await forgetSecret(`investor:${investorId}:master-reservation`)

  const walletBot = await db().from("bot_wallets").select("id").eq("public_address", bot1.address).maybeSingle()
  if (walletBot.error) throw new Error(walletBot.error.message)
  return String(walletBot.data?.id ?? "")
}
