export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function toRlusd(amount: number, currency: string, rate: number) {
  const code = currency.trim().toUpperCase()
  if (code === "RLUSD" || code === "USD") return roundMoney(amount)
  if (code === "BRL") return roundMoney(amount * rate)
  return null
}

function faceFromRlusd(rlusd: number, currency: string, rate: number) {
  const code = currency.trim().toUpperCase()
  if (code === "RLUSD" || code === "USD") return rlusd
  if (code === "BRL") {
    if (!(rate > 0)) return null
    return rlusd / rate
  }
  return null
}

export function repaymentOf(input: {
  face: number
  repaidSoFar: number
  soldPrice: number
  availableRlusd: number
  currency: string
  rate: number
}) {
  const remaining = roundMoney(input.face - input.repaidSoFar)
  if (remaining <= 0) return { error: "This invoice is already repaid." }
  const availableFace = faceFromRlusd(input.availableRlusd, input.currency, input.rate)
  if (availableFace === null) {
    return { error: `${input.currency} is not converted. Only BRL, USD, and RLUSD are.` }
  }
  if (availableFace <= 0) return { error: "The obligor has no available RLUSD." }

  let paymentFace = Math.min(remaining, availableFace)
  let paymentRlusd = toRlusd(paymentFace, input.currency, input.rate)
  if (paymentRlusd === null) {
    return { error: `${input.currency} is not converted. Only BRL, USD, and RLUSD are.` }
  }
  if (paymentRlusd > input.availableRlusd) {
    paymentRlusd = roundMoney(input.availableRlusd)
    const capped = faceFromRlusd(paymentRlusd, input.currency, input.rate)
    if (capped === null) return { error: "The obligor has no available RLUSD." }
    paymentFace = Math.min(remaining, capped)
  }
  paymentFace = roundMoney(paymentFace)
  if (remaining - paymentFace < 0.01) {
    const fullRlusd = toRlusd(remaining, input.currency, input.rate)
    if (fullRlusd !== null && fullRlusd <= input.availableRlusd + 0.001) {
      paymentFace = remaining
      paymentRlusd = fullRlusd
    }
  }
  paymentRlusd = toRlusd(paymentFace, input.currency, input.rate)
  if (paymentRlusd === null || paymentFace <= 0 || paymentRlusd <= 0) {
    return { error: "The obligor has no available RLUSD." }
  }
  if (paymentRlusd > input.availableRlusd + 0.001) {
    return { error: "The obligor does not have enough available RLUSD." }
  }

  const unpaidCost = Math.max(0, input.soldPrice - input.repaidSoFar)
  const profitFace = Math.max(0, paymentFace - unpaidCost)
  const profitRlusd = toRlusd(profitFace, input.currency, input.rate) ?? 0
  const fullyRepaid = paymentFace >= remaining - 0.001
  return {
    paymentFace,
    paymentRlusd: roundMoney(paymentRlusd),
    profitRlusd: roundMoney(profitRlusd),
    nextRepayment: fullyRepaid ? roundMoney(input.face) : roundMoney(input.repaidSoFar + paymentFace),
    fullyRepaid,
  }
}
