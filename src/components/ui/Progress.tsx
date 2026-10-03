import type { ReactNode } from 'react'
import { ratingLabel } from '@/i18n'
import { ratingColor, ratingRingColor, type Rating } from '@/services/scoring'
import { cn } from '@/utils/cn'
import { clamp } from '@/utils/math'

export function ProgressBar({
  value,
  className,
  barClassName,
  color,
  height = 'md',
}: {
  /** 0–100. Values outside the range are clamped. */
  value: number
  className?: string
  barClassName?: string
  /** Explicit colour (e.g. a project colour); defaults to the accent. */
  color?: string
  height?: 'sm' | 'md' | 'lg'
}) {
  const pct = clamp(Math.round(value), 0, 100)
  const heightClass = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' }[height]

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('w-full overflow-hidden rounded-full bg-muted', heightClass, className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', !color && 'bg-accent', barClassName)}
        style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </div>
  )
}

/**
 * Circular score gauge. Colour comes from the rating rather than the raw number so
 * a "good" score looks the same everywhere the score appears.
 */
export function ScoreRing({
  score,
  rating,
  size = 96,
  strokeWidth = 8,
  label,
  className,
}: {
  score: number
  rating: Rating
  size?: number
  strokeWidth?: number
  label?: ReactNode
  className?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = clamp(score, 0, 100)
  const offset = circumference * (1 - pct / 100)
  const stroke = ratingRingColor(rating)

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-semibold tabular-nums', ratingColor(rating))}
          style={{ fontSize: size / 3.6 }}
        >
          {rating === 'No Data' ? '—' : Math.round(score)}
        </span>
        {label ? (
          <span className="mt-0.5 text-[10px] leading-none text-muted-foreground">{label}</span>
        ) : null}
      </div>
    </div>
  )
}

/** Score with its rating word beside it — the compact inline form. */
export function ScoreLabel({
  score,
  rating,
  className,
}: {
  score: number
  rating: Rating
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className={cn('text-sm font-semibold tabular-nums', ratingColor(rating))}>
        {rating === 'No Data' ? '—' : Math.round(score)}
      </span>
      <span className="text-xs text-muted-foreground">{ratingLabel(rating)}</span>
    </span>
  )
}

/** Heatmap-style intensity cell used by the habit grid and activity calendar. */
export function IntensityCell({
  intensity,
  title,
  onClick,
  color = '#6366f1',
  className,
}: {
  /** 0–1. */
  intensity: number
  title?: string
  onClick?: () => void
  color?: string
  className?: string
}) {
  const level = clamp(intensity, 0, 1)
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'size-full rounded-sm border border-border/50 transition-transform',
        onClick && 'cursor-pointer hover:scale-110',
        className,
      )}
      style={{
        backgroundColor: level === 0 ? undefined : color,
        opacity: level === 0 ? 1 : 0.25 + level * 0.75,
      }}
    />
  )
}
