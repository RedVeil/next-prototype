import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const stripCryptoJsAmd = fileURLToPath(new URL("./loaders/strip-cryptojs-amd.cjs", import.meta.url))

const envDir = [process.cwd(), path.resolve(process.cwd(), "..")].find((dir) =>
  existsSync(path.join(dir, ".env")),
)
if (envDir) loadEnvConfig(envDir)

const nextConfig: NextConfig = {
  env: {
    XRPL_SOURCE_TAG: process.env.XRPL_SOURCE_TAG ?? "",
  },
  turbopack: {
    rules: {
      "**/xrpl-connect.mjs": {
        loaders: [stripCryptoJsAmd],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /xrpl-connect\.mjs$/,
      parser: { amd: false },
    })
    return config
  },
}

export default nextConfig
