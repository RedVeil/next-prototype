"use client"

import { useWallet, useWalletModal, WalletConnector, XrplConnectProvider, type XrplConnectConfig } from "@xrpl-commons/xrpl-connect-react"
import {
  CrossmarkAdapter,
  GemWalletAdapter,
  GhostsigAdapter,
  LedgerAdapter,
  MetaMaskSnapAdapter,
  OtsuAdapter,
  XyraAdapter,
  type WalletIdentifier,
} from "xrpl-connect"
import type { ReactNode } from "react"

const walletConfig: XrplConnectConfig = {
  adapters: [
    new CrossmarkAdapter(),
    new GemWalletAdapter(),
    new LedgerAdapter(),
    new XyraAdapter(),
    new OtsuAdapter(),
    new GhostsigAdapter(),
    new MetaMaskSnapAdapter(),
  ],
  network: "mainnet",
  autoConnect: true,
}

export const investorWalletIds: WalletIdentifier[] = [
  "crossmark",
  "gemwallet",
  "ledger",
  "xyra",
  "otsu",
  "ghostsig",
  "metamask-snap",
]

export function XrplWalletProvider({ children }: { children: ReactNode }) {
  return <XrplConnectProvider config={walletConfig}>{children}</XrplConnectProvider>
}

export function InvestorWalletConnector({ onConnect }: { onConnect?: (address: string) => void }) {
  const { account, connected } = useWallet()
  const modal = useWalletModal()

  return (
    <div className="space-y-3">
      <WalletConnector
        wallets={investorWalletIds}
        showUnavailable
        theme="light"
        onConnect={(connectedAccount) => onConnect?.(connectedAccount.address)}
      />
      <button
        type="button"
        disabled={!modal.ready}
        onClick={() => void modal.open()}
        className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium disabled:text-neutral-400"
      >
        {connected && account ? "Change wallet" : "Connect wallet"}
      </button>
      {connected && account && <p className="break-all text-sm text-neutral-600">{account.address}</p>}
    </div>
  )
}
