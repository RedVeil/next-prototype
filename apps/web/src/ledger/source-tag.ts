const MAX_SOURCE_TAG = 0xffffffff

export function xrplSourceTag() {
  const raw = process.env.XRPL_SOURCE_TAG?.trim() ?? ""
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error("XRPL_SOURCE_TAG must be an integer from 0 to 4294967295.")
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value > MAX_SOURCE_TAG) {
    throw new Error("XRPL_SOURCE_TAG must be an integer from 0 to 4294967295.")
  }
  return value
}

export function withSourceTag<T extends object>(tx: T): T & { SourceTag: number } {
  return { ...tx, SourceTag: xrplSourceTag() }
}
