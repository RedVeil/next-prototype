"use client"

import { WalletConnector, XrplConnectProvider } from "@xrpl-commons/xrpl-connect-react"
import { CrossmarkAdapter, XamanAdapter, type WalletManagerOptions } from "xrpl-connect"
import type { ReactNode } from "react"

let config: WalletManagerOptions | null = null

function walletConfig(network: "mainnet" | "testnet" | "devnet", xamanApiKey: string) {
  if (!config) {
    config = {
      adapters: [new CrossmarkAdapter(), new XamanAdapter(xamanApiKey ? { apiKey: xamanApiKey } : {})],
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
