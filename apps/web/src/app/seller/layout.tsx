import { WalletProviders } from "../sandbox/wallet-provider"
import { RoleSidebar } from "../portal/role-sidebar"
import { portalSession } from "../portal/session"

function walletNetwork(): "mainnet" | "testnet" | "devnet" {
  const network = process.env.XRPL_NETWORK
  if (network === "testnet" || network === "devnet") return network
  return "mainnet"
}

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const session = await portalSession("seller")
  const page = (
    <div className="flex w-full min-w-0 flex-1 flex-col md:flex-row">
      {session ? <RoleSidebar role="seller" title="Seller" /> : null}
      {children}
    </div>
  )
  if (!session) return page
  return (
    <WalletProviders network={walletNetwork()} xamanApiKey={process.env.XUMM_API_KEY ?? ""}>
      {page}
    </WalletProviders>
  )
}
