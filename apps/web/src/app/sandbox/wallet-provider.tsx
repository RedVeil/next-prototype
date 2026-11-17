"use client"

import { WalletConnector, XrplConnectProvider } from "@xrpl-commons/xrpl-connect-react"
import { XamanAdapter, type WalletManagerOptions } from "xrpl-connect"
import type { ReactNode } from "react"
import { openXamanSignWindow } from "@/app/portal/xaman-window"

let config: WalletManagerOptions | null = null

function walletConfig(network: "mainnet" | "testnet" | "devnet", xamanApiKey: string) {
  if (!config) {
    config = {
      adapters: [new XamanAdapter({ ...(xamanApiKey ? { apiKey: xamanApiKey } : {}), onQRCode: openXamanSignWindow })],
      network,
      autoConnect: true,
    }
  }
  return config
}

export function WalletProviders({
  network,
  xamanApiKey,
  children,
}: {
  network: "mainnet" | "testnet" | "devnet"
  xamanApiKey: string
  children: ReactNode
}) {
  return (
    <XrplConnectProvider config={walletConfig(network, xamanApiKey)}>
      {children}
      <WalletConnector theme="light" />
    </XrplConnectProvider>
  )
}
