"use client"

import { formatAmount, formatChartTime } from "./format"
import {
  CHART_RANGES,
  CHART_SERIES,
  type ChartRange,
  type ChartSeriesKey,
  type PortfolioPoint,
} from "./chart-model"

export function PortfolioChart({
  points,
  range,
  visible,
  onRange,
  onToggle,
}: {
  points: PortfolioPoint[]
  range: ChartRange
  visible: Record<ChartSeriesKey, boolean>
  onRange: (range: ChartRange) => void
  onToggle: (key: ChartSeriesKey) => void
}) {
  const width = 640
  const height = 220
  const pad = { l: 52, r: 8, t: 12, b: 28 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const active = CHART_SERIES.filter((series) => visible[series.key])
  const finite = points
    .flatMap((point) => active.map((series) => point[series.key]))
    .filter((value) => Number.isFinite(value))
  const flat = finite.length === 0 || finite.every((value) => value === finite[0])
  let min = finite.length ? Math.min(...finite) : 0
  let max = finite.length ? Math.max(...finite) : 1
  if (flat) {
    const base = finite[0] ?? 0
    if (base === 0) {
      min = 0
      max = 1
    } else {
      const span = Math.abs(base) * 0.2
      min = base - span
      max = base + span
    }
  } else {
    const padY = (max - min) * 0.08
    min -= padY
    max += padY
  }

  function xAt(index: number) {
    if (points.length <= 1) return pad.l + plotW / 2
    return pad.l + (index / (points.length - 1)) * plotW
  }

  function yAt(value: number) {
    return pad.t + ((max - value) / (max - min || 1)) * plotH
  }

  function line(key: ChartSeriesKey) {
    if (points.length === 0) return ""
    if (points.length === 1) {
      const y = yAt(points[0]?.[key] ?? 0)
      return `${pad.l},${y} ${pad.l + plotW},${y}`
    }
    return points.map((point, index) => `${xAt(index)},${yAt(point[key])}`).join(" ")
  }

  const ticks = [max, min + (max - min) / 2, min]
  const compact = range === "1D"
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div>
      {points.length === 0 || active.length === 0 ? (
        <p className="flex h-48 items-center justify-center text-sm text-neutral-500">
          {active.length === 0 ? "Turn on a line to draw the chart." : "No snapshots in this range."}
        </p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Cash, invoices, and portfolio over time">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="#e7e5e4" strokeWidth="1" />
              <text x={pad.l - 8} y={yAt(tick) + 4} textAnchor="end" fill="#737373" fontSize="11">
                {formatAmount(tick)}
              </text>
            </g>
          ))}
          {active.map((series) => (
            <polyline
              key={series.key}
              fill="none"
              stroke={series.color}
              strokeWidth={series.key === "portfolio" ? 2.5 : 1.75}
              points={line(series.key)}
            />
          ))}
          {first && last && (
            <>
              <text x={pad.l} y={height - 8} fill="#737373" fontSize="11">
                {formatChartTime(first.capturedAt, compact)}
              </text>
              <text x={width - pad.r} y={height - 8} textAnchor="end" fill="#737373" fontSize="11">
                {formatChartTime(last.capturedAt, compact)}
              </text>
            </>
          )}
        </svg>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {CHART_SERIES.map((series) => {
            const on = visible[series.key]
            return (
              <button
                key={series.key}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(series.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${on ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-400"}`}
              >
                <span className="size-2 rounded-full" style={{ background: series.color, opacity: on ? 1 : 0.35 }} />
                {series.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          {CHART_RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRange(item.id)}
              className={`px-2 py-1 text-xs ${item.id === range ? "font-semibold text-neutral-900 underline decoration-2 underline-offset-4" : "text-neutral-500"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
