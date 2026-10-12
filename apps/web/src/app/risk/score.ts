export function clampScore(value: number) {
  return Math.min(10000, Math.max(0, Math.round(value)))
}

export function organisationScore(
  baseline: number,
  repaidAsSeller: number,
  repaidAsObligor: number,
  sellerStepPercent: number,
  obligorStepPercent: number,
  floor: number,
) {
  const sellerKeep = 1 - sellerStepPercent / 100
  const obligorKeep = 1 - obligorStepPercent / 100
  const decay = sellerKeep ** repaidAsSeller * obligorKeep ** repaidAsObligor
  return clampScore(floor + (baseline - floor) * decay)
}

export function invoiceScore(
  sellerScore: number,
  obligorScore: number,
  sellerWeight: number,
  obligorWeight: number,
) {
  const total = sellerWeight + obligorWeight
  if (total === 0) return null
  return clampScore((obligorScore * obligorWeight + sellerScore * sellerWeight) / total)
}
