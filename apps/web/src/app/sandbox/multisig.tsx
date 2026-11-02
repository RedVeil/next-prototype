"use client"

import { useSigner, useWallet, useWalletModal } from "@xrpl-commons/xrpl-connect-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { isWalletError, WalletErrorCode } from "xrpl-connect"
import { isValidClassicAddress, xrpToDrops } from "xrpl"
import type { SubmittableTransaction } from "xrpl"
import { withSourceTag } from "@/ledger/source-tag"
import {
  finishMultisig,
  prepareMultisig,
  submitMultisigDeposits,
  submitMultisigSigners,
  submitMultisigTrust,
  trustBot,
  trustMultisig,
  updateMultisigDeposits,
  updateMultisigSigners,
  type FundingPayment,
} from "./actions"
import { anyoneCanSend, type MultisigRecord, type UserRecord } from "./types"

const button =
  "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
const field =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"

async function fundAccount(
  payment: FundingPayment,
  account: string,
  signAndSubmit: (transaction: {
    TransactionType: "Payment"
    Account: string
    Destination: string
    Amount: string
  }) => Promise<unknown>,
) {
  await signAndSubmit(
    withSourceTag({
      TransactionType: "Payment",
      Account: account,
      Destination: payment.destination,
      Amount: payment.amountDrops,
    }),
  )
}

function messageFrom(error: unknown, fallback = "The multisig could not be created.") {
  if (isWalletError(error) && error.code === WalletErrorCode.SIGN_REJECTED) {
    return "The wallet rejected the transaction."
  }
  return error instanceof Error ? error.message : fallback
}

export function ConnectWallet() {
  const { connected, connecting, account, disconnect } = useWallet()
  const { open, ready } = useWalletModal()

  if (connected && account) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="max-w-56 truncate font-mono text-xs">{account.address}</span>
        <button type="button" onClick={() => void disconnect()} className="text-muted">
          Disconnect
        </button>
      </p>
    )
  }

  return (
    <button type="button" onClick={() => void open()} disabled={!ready || connecting} className={button}>
      {connecting ? "Connecting" : "Connect wallet"}
    </button>
  )
}

export function FundAccount({ destination, label }: { destination: string; label: string }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { signAndSubmit } = useSigner()
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  useEffect(() => {
    setDetail("")
  }, [destination])

  async function fund() {
    if (!destination) return
    if (!account) {
      await open()
      return
    }
    setPending(true)
    setDetail("")
    try {
      if (!isValidClassicAddress(destination)) throw new Error("That address is not a classic XRPL address.")
      const drops = xrpToDrops(amount.trim())
      if (BigInt(drops) <= BigInt(0)) throw new Error("Enter an XRP amount.")
      await fundAccount({ destination, amountDrops: drops }, account.address, signAndSubmit)
      router.refresh()
    } catch (error) {
      setDetail(messageFrom(error, "The payment could not be sent."))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        XRP
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="w-28 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
        />
      </label>
      <button
        type="button"
        onClick={() => void fund()}
        disabled={!destination || pending || !ready}
        className={button}
      >
        {pending ? "Funding" : label}
      </button>
      {detail ? <p className="text-sm text-red-700">{detail}</p> : null}
    </div>
  )
}

export function TrustRlusd({ kind, id }: { kind: "multisig" | "bot"; id: string }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  async function trust() {
    setPending(true)
    setDetail("")
    try {
      if (kind === "bot") {
        const result = await trustBot(id)
        if (result.error) setDetail(result.error)
        else router.refresh()
        return
      }
      const planned = await trustMultisig(id, account?.address ?? "")
      if (planned.error) {
        if (!account && planned.error.includes("Connect a signer")) {
          await open()
          return
        }
        setDetail(planned.error)
        return
      }
      if (planned.transactions) {
        if (!account) {
          await open()
          return
        }
        const blobs = await signChanges(planned.transactions, sign)
        const saved = await submitMultisigTrust(id, account.address, blobs)
        if (saved.error) {
          setDetail(saved.error)
          return
        }
      }
      router.refresh()
    } catch (error) {
      setDetail(messageFrom(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => void trust()}
        disabled={pending || !ready}
        className="mt-2 rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-60"
      >
        {pending ? "Adding" : "Add RLUSD trust"}
      </button>
      {detail ? <p className="mt-1 max-w-56 text-xs text-red-700">{detail}</p> : null}
    </div>
  )
}

export function FinishSetup({ multisigId, label = "Finish setup" }: { multisigId: string; label?: string }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { signAndSubmit } = useSigner()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  async function finish() {
    setPending(true)
    setDetail("")
    try {
      let result = await finishMultisig(multisigId)
      if (result.needsFunding) {
        if (!account) {
          await open()
          return
        }
        await fundAccount(result.needsFunding, account.address, signAndSubmit)
        result = await finishMultisig(multisigId)
      }
      if (result.error) setDetail(result.error)
    } catch (error) {
      setDetail(messageFrom(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => void finish()} disabled={pending || !ready} className="mt-2 rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-60">
        {pending ? "Finishing" : label}
      </button>
      {detail ? <p className="mt-1 max-w-56 text-xs text-red-700">{detail}</p> : null}
    </div>
  )
}

const multisigTypes = [
  { id: "organisation", label: "Organisation" },
  { id: "governance", label: "Governance" },
  { id: "issuer", label: "Issuer" },
  { id: "repayment", label: "Repayment" },
] as const

export function MultisigForm({
  organisations,
  users,
  central,
  onSaved,
}: {
  organisations: { id: string; legal_name: string }[]
  users: UserRecord[]
  central: { type: string; address: string }[]
  onSaved?: () => void
}) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { signAndSubmit } = useSigner()
  const taken = new Set(central.filter((row) => row.address).map((row) => row.type))
  const types = multisigTypes.filter((item) => (item.id === "organisation" ? organisations.length > 0 : !taken.has(item.id)))
  const [multisigType, setMultisigType] = useState<(typeof multisigTypes)[number]["id"]>(types[0]?.id ?? "governance")
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "")
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")
  const members = users.filter((user) => user.organisation_id === organisationId)
  const governance = central.find((row) => row.type === "governance")
  const needsGovernance = multisigType === "issuer" || multisigType === "repayment"
  const governanceReady = isValidClassicAddress(governance?.address ?? "")

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) {
      await open()
      return
    }
    setPending(true)
    setDetail("")
    try {
      const prepared = await prepareMultisig(new FormData(event.currentTarget))
      if (prepared.error || !prepared.multisigId || !prepared.payment) {
        setDetail(prepared.error ?? "The multisig could not be prepared.")
        return
      }
      await fundAccount(prepared.payment, account.address, signAndSubmit)
      if (prepared.botPayment) await fundAccount(prepared.botPayment, account.address, signAndSubmit)
      const finished = await finishMultisig(prepared.multisigId)
      if (finished.needsFunding) {
        await fundAccount(finished.needsFunding, account.address, signAndSubmit)
        const again = await finishMultisig(prepared.multisigId)
        if (again.error) {
          setDetail(again.error)
          return
        }
      } else if (finished.error) {
        setDetail(`${finished.error} Use Finish setup on the multisig.`)
        return
      }
      onSaved?.()
    } catch (error) {
      setDetail(messageFrom(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input type="hidden" name="signer_address" value={account?.address ?? ""} />
      <label className="block text-sm">
        Type
        <select
          name="multisig_type"
          className={field}
          value={multisigType}
          onChange={(event) => setMultisigType(event.target.value as (typeof multisigTypes)[number]["id"])}
        >
          {types.length === 0 ? <option value="">No multisigs available</option> : null}
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {multisigType === "organisation" ? (
        <>
          <label className="block text-sm">
            Organisation
            <select
              name="organisation_id"
              required
              className={field}
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
            >
              {organisations.length === 0 ? <option value="">No organisations available</option> : null}
              {organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.legal_name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm">Wallets</legend>
            {members.length === 0 ? <p className="text-sm text-muted">This organisation has no users.</p> : null}
            {members.map((user) => {
              const selectable = isValidClassicAddress(user.address)
              return (
                <label key={user.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="identity_id" value={user.id} disabled={!selectable} className="mt-1" />
                  <span>
                    {user.username}
                    <span className="mt-1 block font-mono text-xs break-all text-muted">
                      {user.address || "No wallet"}
                      {user.address && !selectable ? " · Not a classic XRPL address" : ""}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        </>
      ) : null}
      {multisigType === "governance" ? (
        <p className="text-sm text-muted">
          Signer is the connected wallet{account ? ` ${account.address}` : ""}. Quorum is 1.
        </p>
      ) : null}
      {needsGovernance ? (
        <p className="text-sm text-muted">
          {governanceReady
            ? `Signers are a new bot and the governance multisig ${governance?.address}. Quorum is 1 of 2.`
            : "Create the governance multisig before the issuer or repayment account."}
        </p>
      ) : null}
      {detail ? <p className="text-sm text-red-700">{detail}</p> : null}
      {account ? (
        <button
          type="submit"
          disabled={pending || types.length === 0 || (needsGovernance && !governanceReady)}
          className={button}
        >
          {pending ? "Creating" : "Create multisig"}
        </button>
      ) : (
        <button type="button" onClick={() => void open()} disabled={!ready} className={button}>
          Connect wallet
        </button>
      )}
    </form>
  )
}

async function signChanges(
  transactions: SubmittableTransaction[],
  sign: (transaction: SubmittableTransaction) => Promise<{ tx_blob?: string }>,
) {
  const blobs: string[] = []
  for (const transaction of transactions) {
    const signed = await sign(transaction)
    if (!signed.tx_blob) throw new Error("The wallet did not return a signed transaction.")
    blobs.push(signed.tx_blob)
  }
  return blobs
}

function walletData(form: HTMLFormElement, walletAddress: string) {
  const data = new FormData(form)
  data.set("wallet_address", walletAddress)
  return data
}

export function SignerForm({
  multisig,
  users,
  onSaved,
}: {
  multisig: MultisigRecord
  users: UserRecord[]
  onSaved?: () => void
}) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")
  const current = new Set(multisig.signers.map((signer) => signer.address))
  const members = users.filter(
    (user) =>
      user.organisation_id === multisig.organisation_id &&
      isValidClassicAddress(user.address) &&
      !current.has(user.address),
  )
  const botSigns = multisig.signers.some((signer) => signer.kind === "bot" && signer.weight >= multisig.quorum)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!botSigns && !account) {
      await open()
      return
    }
    setPending(true)
    setDetail("")
    try {
      const planned = await updateMultisigSigners(walletData(form, account?.address ?? ""))
      if (planned.error) {
        setDetail(planned.error)
        return
      }
      if (planned.transactions) {
        const blobs = await signChanges(planned.transactions, sign)
        const saved = await submitMultisigSigners(walletData(form, account?.address ?? ""), blobs)
        if (saved.error) {
          setDetail(saved.error)
          return
        }
      }
      onSaved?.()
    } catch (error) {
      setDetail(messageFrom(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input type="hidden" name="multisig_id" value={multisig.id} />
      <label className="block text-sm">
        Quorum
        <input name="quorum" type="number" min={1} required defaultValue={multisig.quorum} className={field} />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm">Signers</legend>
        {multisig.signers.map((signer) => (
          <label key={signer.address} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="signer_address" value={signer.address} defaultChecked className="mt-1" />
            <span className="min-w-0 flex-1">
              {signer.username || signer.kind}
              <span className="mt-1 block font-mono text-xs break-all text-muted">{signer.address}</span>
            </span>
            <input
              name={`weight_${signer.address}`}
              type="number"
              min={1}
              defaultValue={signer.weight}
              aria-label="Weight"
              className="w-16 rounded-lg border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
        ))}
        {members.map((user) => (
          <label key={user.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="signer_address" value={user.address} className="mt-1" />
            <span className="min-w-0 flex-1">
              {user.username}
              <span className="mt-1 block font-mono text-xs break-all text-muted">{user.address}</span>
            </span>
            <input
              name={`weight_${user.address}`}
              type="number"
              min={1}
              defaultValue={1}
              aria-label="Weight"
              className="w-16 rounded-lg border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        Add address
        <input name="extra_address" className={field} placeholder="Classic XRPL address" />
      </label>
      <label className="block text-sm">
        Weight
        <input name="extra_weight" type="number" min={1} defaultValue={1} className={field} />
      </label>
      {botSigns ? null : (
        <p className="text-sm text-muted">The connected wallet signs this change.</p>
      )}
      {detail ? <p className="text-sm text-red-700">{detail}</p> : null}
      <button type="submit" disabled={pending || !ready} className={button}>
        {pending ? "Saving" : "Save signers"}
      </button>
    </form>
  )
}

export function DepositForm({
  multisig,
  users,
  multisigs,
  onSaved,
}: {
  multisig: MultisigRecord
  users: UserRecord[]
  multisigs: MultisigRecord[]
  onSaved?: () => void
}) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const initialAnyone = multisig.destinations.some((destination) => destination.address === anyoneCanSend)
  const [anyone, setAnyone] = useState(initialAnyone)
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")
  const selected = new Set(
    multisig.destinations.map((destination) => destination.address).filter((address) => address && address !== anyoneCanSend),
  )
  const choices = new Map<string, string>()
  for (const destination of multisig.destinations) {
    if (destination.address && destination.address !== anyoneCanSend) choices.set(destination.address, destination.kind)
  }
  if (isValidClassicAddress(multisig.bot_address)) choices.set(multisig.bot_address, choices.get(multisig.bot_address) ?? "bot")
  for (const user of users) {
    if (isValidClassicAddress(user.address)) choices.set(user.address, choices.get(user.address) ?? user.username)
  }
  for (const other of multisigs) {
    if (isValidClassicAddress(other.address) && other.id !== multisig.id) {
      choices.set(other.address, choices.get(other.address) ?? other.type)
    }
  }
  const botSigns = multisig.signers.some((signer) => signer.kind === "bot" && signer.weight >= multisig.quorum)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!botSigns && !account) {
      await open()
      return
    }
    setPending(true)
    setDetail("")
    try {
      const planned = await updateMultisigDeposits(walletData(form, account?.address ?? ""))
      if (planned.error) {
        setDetail(planned.error)
        return
      }
      if (planned.transactions) {
        const blobs = await signChanges(planned.transactions, sign)
        const saved = await submitMultisigDeposits(walletData(form, account?.address ?? ""), blobs)
        if (saved.error) {
          setDetail(saved.error)
          return
        }
      }
      onSaved?.()
    } catch (error) {
      setDetail(messageFrom(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input type="hidden" name="multisig_id" value={multisig.id} />
      <fieldset className="grid gap-2" disabled={anyone}>
        <legend className="text-sm">Who can send funds</legend>
        {[...choices].map(([address, label]) => (
          <label key={address} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="sender_address"
              value={address}
              defaultChecked={selected.has(address)}
              className="mt-1"
            />
            <span>
              {label}
              <span className="mt-1 block font-mono text-xs break-all text-muted">{address}</span>
            </span>
          </label>
        ))}
        <label className="block text-sm">
          Add address
          <input name="extra_sender" className={field} placeholder="Classic XRPL address" />
        </label>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="allow_anyone"
          value="yes"
          checked={anyone}
          onChange={(event) => setAnyone(event.target.checked)}
          className="mt-1"
        />
        <span>
          Allow anyone
          <span className="mt-1 block text-muted">Any account can send funds to this multisig.</span>
        </span>
      </label>
      {botSigns ? null : <p className="text-sm text-muted">The connected wallet signs this change.</p>}
      {detail ? <p className="text-sm text-red-700">{detail}</p> : null}
      <button type="submit" disabled={pending || !ready} className={button}>
        {pending ? "Saving" : "Save senders"}
      </button>
    </form>
  )
}
