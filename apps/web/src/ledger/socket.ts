export function ledgerSocketUrl() {
  if (process.env.XRPL_WS_URL) return process.env.XRPL_WS_URL
  if (process.env.XRPL_NETWORK === "testnet") return "wss://s.altnet.rippletest.net:51233"
  if (process.env.XRPL_NETWORK === "devnet") return "wss://s.devnet.rippletest.net:51233"
  return "wss://xrplcluster.com"
}
