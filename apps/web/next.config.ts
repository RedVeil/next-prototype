import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const stripCryptoJsAmd = fileURLToPath(new URL("./loaders/strip-cryptojs-amd.cjs", import.meta.url))
const xrplBrowser = fileURLToPath(new URL("./src/lib/xrpl-browser.js", import.meta.url))

const envDir = [process.cwd(), path.resolve(process.cwd(), "..")].find((dir) =>
  existsSync(path.join(dir, ".env")),
)
if (envDir) loadEnvConfig(envDir)

const nextConfig: NextConfig = {
  transpilePackages: [
    "@antecipa/domain",
    "@antecipa/xrpl",
    "@antecipa/rails",
    "@antecipa/risk",
    "@antecipa/matcher",
    "@antecipa/ledger-bot",
    "@antecipa/payouts",
    "@antecipa/funder",
  ],
  serverExternalPackages: ["xrpl"],
  turbopack: {
    resolveAlias: {
      xrpl: { browser: "./src/lib/xrpl-browser.js" },
    },
    rules: {
      "*": {
        condition: { content: /define\(\["\.\/core"\]/ },
        loaders: [stripCryptoJsAmd],
        as: "*.js",
      },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias, xrpl: xrplBrowser }
    }
    config.module.rules.push({
      test: /xrpl-connect\.mjs$/,
      parser: { amd: false },
    })
    return config
  },
}

export default nextConfig;
