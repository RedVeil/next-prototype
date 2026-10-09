"use client"

import type { Confidence } from "@/lib/types"
import { formatScore, scoreBand } from "@/lib/format"

function scoreTone(score: number) {
  if (score >= 80) return "text-emerald-800"
  if (score >= 70) return "text-amber-800"
  return "text-red-800"
}

type RiskScoreBadgeProps = {
  score: number
  confidence?: Confidence
  onClick?: () => void
}

export function RiskScoreBadge({ score, confidence, onClick }: RiskScoreBadgeProps) {
  const content = (
    <>
      <span className={`font-medium ${scoreTone(score)}`}>{formatScore(score)}</span>
      {confidence && (
        <span className="block text-[11px] font-normal text-neutral-500">
          {confidence} · {scoreBand(score)}
        </span>
      )}
    </>
  )

  if (!onClick) {
    return <span className="text-sm text-neutral-900">{content}</span>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded text-left text-sm text-neutral-900 hover:underline"
    >
      {content}
    </button>
  )
}
