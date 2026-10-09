import type { Wallet } from "xrpl"
import { encryptSeed } from "./crypto"
import { db } from "./db"
import {
  ensureFunded,
  finishMultisig,
  forgetSecret,
  readXrpBalance,
  rememberWallet,
  withMainnet,
} from "./xrpl-ops"

async function saveBot(wallet: Wallet, purpose: "central_issuer" | "central_repayment", multisigId: string) {
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

async function saveMultisig(input: {
  role: "central_governance" | "central_issuer" | "central_repayment"
  address: string
  quorum: number
  signers: { address: string; weight: number; kind: "bot" | "team_member" | "central_governance" }[]
  senders: { address: string; label: string }[]
}) {
  const existing = await db().from("multisig_accounts").select("id").eq("role", input.role).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data.id as string
  const inserted = await db()
    .from("multisig_accounts")
    .insert({
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
  if (input.senders.length > 0) {
    const senders = await db().from("multisig_authorized_senders").insert(
      input.senders.map((sender) => ({
        multisig_account_id: id,
        xrpl_address: sender.address,
        label: sender.label,
      })),
    )
    if (senders.error) throw new Error(senders.error.message)
  }
  return id
}

/** Create the three central multisigs once. Safe to run again. */
export async function bootstrapCentralMultisigs(): Promise<{ status: "created" | "exists" }> {
  const governance = await db().from("multisig_accounts").select("id").eq("role", "central_governance").maybeSingle()
  if (governance.error) throw new Error(governance.error.message)
  const issuer = await db().from("multisig_accounts").select("id").eq("role", "central_issuer").maybeSingle()
  const repayment = await db().from("multisig_accounts").select("id").eq("role", "central_repayment").maybeSingle()
  if (governance.data && issuer.data && repayment.data) return { status: "exists" }

  const governanceMaster = await rememberWallet("master:central_governance")
  const issuerMaster = await rememberWallet("master:central_issuer")
  const issuerBot = await rememberWallet("bot:central_issuer")
  const repaymentMaster = await rememberWallet("master:central_repayment")
  const repaymentBot = await rememberWallet("bot:central_repayment")

  let funderAddress = ""
  await withMainnet(async (client, funder) => {
    funderAddress = funder.address
    await ensureFunded(client, funder, governanceMaster.address, 2)
    await ensureFunded(client, funder, issuerBot.address, 0)
    await ensureFunded(client, funder, issuerMaster.address, 3)
    await ensureFunded(client, funder, repaymentBot.address, 0)
    await ensureFunded(client, funder, repaymentMaster.address, 3)

    await finishMultisig(client, governanceMaster, {
      quorum: 1,
      signers: [{ address: funder.address, weight: 1 }],
      preauth: [funder.address],
      trust: false,
    })
    await finishMultisig(client, issuerMaster, {
      quorum: 1,
      signers: [
        { address: issuerBot.address, weight: 1 },
        { address: governanceMaster.address, weight: 1 },
      ],
      preauth: [funder.address],
      trust: true,
    })
    await finishMultisig(client, repaymentMaster, {
      quorum: 1,
      signers: [
        { address: repaymentBot.address, weight: 1 },
        { address: governanceMaster.address, weight: 1 },
      ],
      preauth: [],
      trust: true,
    })
  })

  const governanceId = await saveMultisig({
    role: "central_governance",
    address: governanceMaster.address,
    quorum: 1,
    signers: [{ address: funderAddress, weight: 1, kind: "team_member" }],
    senders: [],
  })

  const issuerId = await saveMultisig({
    role: "central_issuer",
    address: issuerMaster.address,
    quorum: 1,
    signers: [
      { address: issuerBot.address, weight: 1, kind: "bot" },
      { address: governanceMaster.address, weight: 1, kind: "central_governance" },
    ],
    senders: [],
  })
  const repaymentId = await saveMultisig({
    role: "central_repayment",
    address: repaymentMaster.address,
    quorum: 1,
    signers: [
      { address: repaymentBot.address, weight: 1, kind: "bot" },
      { address: governanceMaster.address, weight: 1, kind: "central_governance" },
    ],
    senders: [],
  })

  await saveBot(issuerBot, "central_issuer", issuerId)
  await saveBot(repaymentBot, "central_repayment", repaymentId)

  const funderSeed = process.env.XRPL_FUNDER_SEED
  if (funderSeed) {
    const { Wallet } = await import("xrpl")
    const funder = Wallet.fromSeed(funderSeed)
    for (const id of [governanceId, issuerId]) {
      const existing = await db()
        .from("multisig_authorized_senders")
        .select("id")
        .eq("multisig_account_id", id)
        .eq("xrpl_address", funder.address)
        .maybeSingle()
      if (existing.data) continue
      const inserted = await db().from("multisig_authorized_senders").insert({
        multisig_account_id: id,
        xrpl_address: funder.address,
        label: "Funder",
      })
      if (inserted.error) throw new Error(inserted.error.message)
    }
  }

  await forgetSecret("master:central_governance")
  await forgetSecret("master:central_issuer")
  await forgetSecret("master:central_repayment")
  return { status: "created" }
}
