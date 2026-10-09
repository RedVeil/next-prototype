import { buildSignerListSet } from "@antecipa/xrpl"
import { Wallet } from "xrpl"
import { decryptSeed } from "./crypto"
import { db } from "./db"
import { requireEnv } from "./env"
import { addBotFee, assertClassicAddress, submitMultisigned, withClient } from "./xrpl-ops"

async function signersFor(multisigId: string): Promise<{ wallets: Wallet[]; botWalletId: string | null }> {
  const account = await db().from("multisig_accounts").select("id, role, classic_address").eq("id", multisigId).maybeSingle()
  if (account.error) throw new Error(account.error.message)
  if (!account.data) throw new Error("Multisig not found")

  const bot = await db()
    .from("bot_wallets")
    .select("id, seed_ciphertext")
    .eq("multisig_account_id", multisigId)
    .maybeSingle()
  if (bot.error) throw new Error(bot.error.message)
  if (bot.data?.seed_ciphertext) {
    return {
      wallets: [Wallet.fromSeed(decryptSeed(String(bot.data.seed_ciphertext)))],
      botWalletId: String(bot.data.id),
    }
  }

  if (account.data.role !== "central_governance") {
    throw new Error("This multisig has no bot signer")
  }
  const funder = Wallet.fromSeed(requireEnv("XRPL_FUNDER_SEED"))
  const signer = await db()
    .from("multisig_signers")
    .select("address")
    .eq("multisig_account_id", multisigId)
    .eq("address", funder.address)
    .maybeSingle()
  if (signer.error) throw new Error(signer.error.message)
  if (!signer.data) throw new Error("Governance signer is not the funder wallet")
  return { wallets: [funder], botWalletId: null }
}

export async function changeAuthorizedSender(input: {
  multisigId: string
  address: string
  label: string
  remove: boolean
}) {
  assertClassicAddress(input.address)
  const account = await db().from("multisig_accounts").select("classic_address").eq("id", input.multisigId).maybeSingle()
  if (account.error) throw new Error(account.error.message)
  if (!account.data) throw new Error("Multisig not found")
  const { wallets, botWalletId } = await signersFor(input.multisigId)

  const submitted = await withClient((client) =>
    submitMultisigned(client, wallets, {
      TransactionType: "DepositPreauth",
      Account: String(account.data!.classic_address),
      ...(input.remove ? { Unauthorize: input.address } : { Authorize: input.address }),
    }),
  )
  if (botWalletId) await addBotFee(botWalletId, submitted.feeDrops)

  if (input.remove) {
    const removed = await db()
      .from("multisig_authorized_senders")
      .delete()
      .eq("multisig_account_id", input.multisigId)
      .eq("xrpl_address", input.address)
    if (removed.error) throw new Error(removed.error.message)
    return
  }

  const existing = await db()
    .from("multisig_authorized_senders")
    .select("id")
    .eq("multisig_account_id", input.multisigId)
    .eq("xrpl_address", input.address)
    .maybeSingle()
  if (existing.data) return
  const inserted = await db().from("multisig_authorized_senders").insert({
    multisig_account_id: input.multisigId,
    xrpl_address: input.address,
    label: input.label,
  })
  if (inserted.error) throw new Error(inserted.error.message)
}

/** Replace the investor's own XRPL account. After multisig 1 exists, the bot updates the signer list and deposit authorization on XRPL. */
export async function replaceInvestorAccount(investorId: string, nextAddress: string) {
  assertClassicAddress(nextAddress)
  const investor = await db().from("investors").select("id, own_xrpl_address").eq("id", investorId).maybeSingle()
  if (investor.error) throw new Error(investor.error.message)
  if (!investor.data) throw new Error("Investor not found")
  const current = investor.data.own_xrpl_address ? String(investor.data.own_xrpl_address) : null
  if (current === nextAddress) return

  const multisig = await db()
    .from("multisig_accounts")
    .select("id, classic_address, quorum")
    .eq("investor_id", investorId)
    .eq("role", "investor_wallet")
    .maybeSingle()
  if (multisig.error) throw new Error(multisig.error.message)

  if (multisig.data) {
    const signerRows = await db()
      .from("multisig_signers")
      .select("address, weight, kind")
      .eq("multisig_account_id", multisig.data.id)
    if (signerRows.error) throw new Error(signerRows.error.message)
    const rows = signerRows.data ?? []
    if (!rows.some((row) => row.kind === "investor")) throw new Error("Multisig 1 has no investor signer")
    const nextSigners = rows.map((row) => ({
      address: row.kind === "investor" ? nextAddress : String(row.address),
      weight: Number(row.weight),
    }))
    if (new Set(nextSigners.map((signer) => signer.address)).size !== nextSigners.length) {
      throw new Error("That XRPL account is already a signer on multisig 1")
    }

    const { wallets, botWalletId } = await signersFor(String(multisig.data.id))
    const account = String(multisig.data.classic_address)
    const signerList = await withClient((client) =>
      submitMultisigned(
        client,
        wallets,
        buildSignerListSet({
          account,
          quorum: Number(multisig.data!.quorum),
          signers: nextSigners,
        }),
      ),
    )
    if (botWalletId) await addBotFee(botWalletId, signerList.feeDrops)

    if (current) {
      const removed = await withClient((client) =>
        submitMultisigned(client, wallets, {
          TransactionType: "DepositPreauth",
          Account: account,
          Unauthorize: current,
        }),
      )
      if (botWalletId) await addBotFee(botWalletId, removed.feeDrops)
    }
    const authorized = await withClient((client) =>
      submitMultisigned(client, wallets, {
        TransactionType: "DepositPreauth",
        Account: account,
        Authorize: nextAddress,
      }),
    )
    if (botWalletId) await addBotFee(botWalletId, authorized.feeDrops)

    const signerUpdate = await db()
      .from("multisig_signers")
      .update({ address: nextAddress })
      .eq("multisig_account_id", multisig.data.id)
      .eq("kind", "investor")
    if (signerUpdate.error) throw new Error(signerUpdate.error.message)

    if (current) {
      const senderUpdate = await db()
        .from("multisig_authorized_senders")
        .update({ xrpl_address: nextAddress, label: "Investor account" })
        .eq("multisig_account_id", multisig.data.id)
        .eq("xrpl_address", current)
      if (senderUpdate.error) throw new Error(senderUpdate.error.message)
    }
  }

  const updated = await db().from("investors").update({ own_xrpl_address: nextAddress }).eq("id", investorId)
  if (updated.error) throw new Error(updated.error.message)
}
