import { existsSync } from "node:fs"
import path from "node:path"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const envDir = [process.cwd(), path.resolve(process.cwd(), "..")].find((dir) =>
  existsSync(path.join(dir, ".env")),
)
if (envDir) loadEnvConfig(envDir)

const nextConfig: NextConfig = {
  env: {
    XRPL_SOURCE_TAG: process.env.XRPL_SOURCE_TAG ?? "",
  },
}

export default nextConfig
