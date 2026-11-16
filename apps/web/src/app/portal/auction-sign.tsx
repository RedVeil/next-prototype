"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSigner, useWallet, useWalletModal } from "@xrpl-commons/xrpl-connect-react"
import { isWalletError, WalletErrorCode } from "xrpl-connect"
import type { SubmittableTransaction } from "xrpl"
import {
  cancelHold,
  declineInvite,
  ignoreInvite,
  startAccept,
  startAuction,
  startBid,
  startPull,
  submitAccept,
  submitBid,
  submitCancellation,
  submitSetup,
} from "./auction-actions"

function walletMessage(error: unknown) {
  if (isWalletError(error) && error.code === WalletErrorCode.SIGN_REJECTED) return "The wallet rejected the transaction."
  return error instanceof Error ? error.message : "The wallet could not sign."
}

function detailOf(value: object) {
  if ("error" in value && typeof value.error === "string") return value.error
  if ("message" in value && typeof value.message === "string") return value.message
  return ""
}

function toSign(transaction: unknown) {
  return transaction as SubmittableTransaction
}

function toPayload(signed: { hash?: string; tx_blob?: string; signature?: string; signerAddress?: string; tx_json?: unknown }) {
  return {
    hash: signed.hash,
    tx_blob: signed.tx_blob,
    signature: signed.signature,
    signerAddress: signed.signerAddress,
    tx_json: signed.tx_json && typeof signed.tx_json === "object" ? (signed.tx_json as Record<string, unknown>) : undefined,
  }
}

const button = "h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60"
const quiet = "h-10 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"

export function SetupSigner({ invoiceId, roundId, pendingLedger }: { invoiceId: string; roundId: string | null; pendingLedger: boolean }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  async function signSetup() {
    setPending(true)
    setDetail("")
    try {
      if (!account) {
        await open()
        return
      }
      if (pendingLedger && roundId) {
        const checked = await submitSetup(roundId, [])
        setDetail(detailOf(checked))
        router.refresh()
        return
      }
      const opened = await startAuction(invoiceId)
      if ("error" in opened && typeof opened.error === "string") {
        setDetail(opened.error)
        return
      }
      if (!("roundId" in opened) || typeof opened.roundId !== "string" || !("transactions" in opened) || !Array.isArray(opened.transactions)) {
        setDetail(detailOf(opened) || "The auction could not be prepared.")
        return
      }
      const payloads = []
      for (const transaction of opened.transactions) {
        const signed = await sign(toSign(transaction))
        if (!signed.tx_blob && !signed.tx_json) throw new Error("The wallet did not return a signed transaction.")
        payloads.push(toPayload(signed))
      }
      const saved = await submitSetup(opened.roundId, payloads)
      setDetail(detailOf(saved))
      router.refresh()
    } catch (error) {
      setDetail(walletMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={pending || !ready} onClick={() => void signSetup()} className={button}>
        {pending ? "Signing" : pendingLedger ? "Check the ledger" : "Sign setup"}
      </button>
      {detail ? <p className="mt-2 text-sm text-neutral-700">{detail}</p> : null}
    </div>
  )
}

export function AcceptSigner({ roundId }: { roundId: string }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  async function accept() {
    setPending(true)
    setDetail("")
    try {
      if (!account) {
        await open()
        return
      }
      const prepared = await startAccept(roundId)
      if ("error" in prepared && typeof prepared.error === "string") {
        setDetail(prepared.error)
        return
      }
      if (!("transaction" in prepared) || !("offerId" in prepared) || typeof prepared.offerId !== "string") {
        setDetail(detailOf(prepared) || "The winning bid could not be prepared.")
        return
      }
      const signed = await sign(toSign(prepared.transaction))
      if (!signed.tx_blob && !signed.tx_json) throw new Error("The wallet did not return a signed transaction.")
      const saved = await submitAccept(roundId, prepared.offerId, toPayload(signed))
      setDetail(detailOf(saved))
      router.refresh()
    } catch (error) {
      setDetail(walletMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={pending || !ready} onClick={() => void accept()} className={button}>
        {pending ? "Signing" : account ? "Accept best bid" : "Connect wallet"}
      </button>
      {detail ? <p className="mt-2 text-sm text-neutral-700">{detail}</p> : null}
    </div>
  )
}

export function BidSigner({ invitationId, canSign, offerId }: { invitationId: string; canSign: boolean; offerId: string | null }) {
  const { account } = useWallet()
  const { open, ready } = useWalletModal()
  const { sign } = useSigner()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [detail, setDetail] = useState("")

  async function signBid() {
    setPending(true)
    setDetail("")
    let ticketId = ""
    try {
      if (!account) {
        await open()
        return
      }
      const prepared = await startBid(invitationId)
      if ("error" in prepared && typeof prepared.error === "string") {
        setDetail(prepared.error)
        return
      }
      if (!("ticketId" in prepared) || typeof prepared.ticketId !== "string" || !("batch" in prepared)) {
        setDetail(detailOf(prepared) || "The bid could not be prepared.")
        return
      }
      ticketId = prepared.ticketId
      let authorize = null
      if ("authorize" in prepared && prepared.authorize) {
        const signedAuthorize = await sign(toSign(prepared.authorize))
        if (!signedAuthorize.tx_blob && !signedAuthorize.tx_json) throw new Error("The wallet did not return a signed transaction.")
        authorize = toPayload(signedAuthorize)
      }
      const signed = await sign(toSign(prepared.batch))
      if (!signed.tx_blob && !signed.tx_json && !signed.signature) throw new Error("The wallet did not return a signed transaction.")
      const saved = await submitBid(ticketId, toPayload(signed), authorize)
      setDetail(detailOf(saved))
      if ("error" in saved) await cancelHold(ticketId)
      router.refresh()
    } catch (error) {
      if (ticketId) await cancelHold(ticketId).catch(() => undefined)
      setDetail(walletMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function respond(kind: "decline" | "ignore" | "pull") {
    setPending(true)
    setDetail("")
    try {
      if (kind === "pull") {
        if (!offerId) return
        if (!account) {
          await open()
          return
        }
        const prepared = await startPull(offerId)
        if ("error" in prepared && typeof prepared.error === "string") {
          setDetail(prepared.error)
          return
        }
        if (!("transaction" in prepared)) return
        const signed = await sign(toSign(prepared.transaction))
        const saved = await submitCancellation(offerId, toPayload(signed))
        setDetail(detailOf(saved))
      } else {
        const saved = kind === "decline" ? await declineInvite(invitationId) : await ignoreInvite(invitationId)
        setDetail(detailOf(saved))
      }
      router.refresh()
    } catch (error) {
      setDetail(walletMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSign ? (
        <button type="button" disabled={pending || !ready} onClick={() => void signBid()} className={button}>
          {pending ? "Signing" : account ? "Sign bid" : "Connect wallet"}
        </button>
      ) : null}
      {offerId ? (
        <button type="button" disabled={pending || !ready} onClick={() => void respond("pull")} className={quiet}>
          Cancel bid
        </button>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => void respond("decline")} className={quiet}>
            Decline
          </button>
          <button type="button" disabled={pending} onClick={() => void respond("ignore")} className={quiet}>
            Ignore
          </button>
        </>
      )}
      {detail ? <p className="w-full text-sm text-neutral-700">{detail}</p> : null}
    </div>
  )
}

export function AuctionCountdown({ deadline }: { deadline: string }) {
  const [label, setLabel] = useState("—")
  useEffect(() => {
    const tick = () => {
      const remaining = new Date(deadline).getTime() - Date.now()
      if (remaining <= 0) {
        setLabel("Ended")
        return
      }
      const hours = Math.floor(remaining / 3_600_000)
      const minutes = Math.floor((remaining % 3_600_000) / 60_000)
      setLabel(`${hours}h ${minutes}m`)
    }
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [deadline])
  return <p className="mt-2 text-3xl font-semibold tabular-nums">{label}</p>
}
