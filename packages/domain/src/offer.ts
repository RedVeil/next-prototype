export type PricedCandidate<T> = T & { price: number }

/**
 * Lowest financing price wins. Equal prices pick one candidate at random.
 * A later tie-break can replace the draw.
 */
export function chooseLowestPrice<T>(
  candidates: PricedCandidate<T>[],
  random: () => number = Math.random,
): PricedCandidate<T> | null {
  if (candidates.length === 0) return null
  let lowest = candidates[0].price
  for (const candidate of candidates) {
    if (candidate.price < lowest) lowest = candidate.price
  }
  const tied = candidates.filter((candidate) => candidate.price === lowest)
  const index = Math.min(tied.length - 1, Math.floor(random() * tied.length))
  return tied[index] ?? null
}
