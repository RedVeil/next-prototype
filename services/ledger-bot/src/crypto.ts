import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { requireEnv } from "./env"

function masterKey(): Buffer {
  return scryptSync(requireEnv("BOT_WALLET_MASTER_KEY"), "antecipa-bot-wallet", 32)
}

export function encryptSeed(seed: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

export function decryptSeed(payload: string): string {
  const buf = Buffer.from(payload, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
