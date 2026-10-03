import { PRIORITY_WEIGHT } from '@/config/constants'
import type { DayKey, Priority, RatingThresholds, ScoringWeights } from '@/types'
import { clamp, ratio, round, sum, toPercent } from '@/utils/math'

/**
 * Productivity scoring engine.
 *
 * Design contract:
 *  - **Pure and deterministic.** Takes pre-aggregated primitives, never a
 *    database handle or `Date.now()`. Same input → same score, which is what
 *    makes it testable and makes historical scores stable.
 *  - **Six weighted components**, each normalised to 0–100 independently, then
 *    combined by the workspace's configurable weights.
 *  - **Not-applicable is not zero.** A component with no data to judge returns
 *    `null` and is dropped from the average, with the remaining weights
 *    renormalised. Scoring a day with no scheduled work as 0% "task completion"
 *    would make the metric useless — and a day with genuinely nothing recorded
 *    reports "no data" rather than a misleading 0.
 */

export interface ScoredTask {
  priority: Priority
  /** Per-task importance multiplier (0.25–4). */
  scoreWeight: number
  completed: boolean
  /** Whether the task was completed at or before its deadline. `null` = no deadline. */
  onTime: boolean | null
  estimatedMinutes: number | null
  actualMinutes: number
}

export interface ScoringInput {
  /** The day's workload: everything scheduled for, due on, or completed on the day. */
  tasks: ScoredTask[]
  /** Deadlines that fell due in the period and were missed (still open, past due). */
  missedDeadlines: number
  /** Deadlines that fell due in the period and were met. */
  metDeadlines: number
  focusMinutes: number
  /** Target focus minutes for the period, from planning settings. */
  focusTarget: number
  plannedMinutes: number
  actualMinutes: number
  /** Days with recorded activity in the trailing consistency window. */
  activeDaysInWindow: number
  /** Size of that window (e.g. 7). */
  consistencyWindow: number
  weights: ScoringWeights
}

export interface ScoreComponent {
  key: keyof ScoringWeights
  label: string
  /** 0–100, or `null` when there was nothing to evaluate. */
  value: number | null
  /** Configured weight (percentage points). */
  weight: number
  /** Weight actually applied after renormalisation. */
  effectiveWeight: number
  /** Plain-language reason the component scored what it did. */
  explanation: string
}

export interface ScoreResult {
  score: number
  rating: Rating
  components: ScoreComponent[]
  /** `true` when nothing in the period could be evaluated. */
  noData: boolean
}

export type Rating = 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Needs Improvement' | 'No Data'

/* ------------------------------------------------------------- components -- */

/** Share of the period's tasks that were completed. */
export function taskCompletionScore(tasks: ScoredTask[]): number | null {
  if (tasks.length === 0) return null
  return toPercent(ratio(tasks.filter((t) => t.completed).length, tasks.length) * 100)
}

/**
 * Completion weighted by importance: `PRIORITY_WEIGHT[priority] * scoreWeight`.
 * This is what stops a day of trivial checkboxes from outscoring a day spent
 * shipping the one critical thing.
 */
export function priorityCompletionScore(tasks: ScoredTask[]): number | null {
  if (tasks.length === 0) return null
  const weightOf = (t: ScoredTask) => PRIORITY_WEIGHT[t.priority] * clamp(t.scoreWeight || 1, 0.25, 4)
  const total = sum(tasks.map(weightOf))
  if (total === 0) return null
  const earned = sum(tasks.filter((t) => t.completed).map(weightOf))
  return toPercent(ratio(earned, total) * 100)
}

/**
 * Deadline discipline: met deadlines as a share of deadlines that came due.
 * Tasks without deadlines are ignored — they cannot be late.
 */
export function deadlineDisciplineScore(metDeadlines: number, missedDeadlines: number): number | null {
  const total = metDeadlines + missedDeadlines
  if (total === 0) return null
  return toPercent(ratio(metDeadlines, total) * 100)
}

/**
 * Time efficiency: how close actual duration ran to the estimate on completed
 * work. Asymmetric on purpose — overrunning an estimate is penalised harder than
 * finishing early, because overruns are what break a plan.
 */
export function timeEfficiencyScore(tasks: ScoredTask[]): number | null {
  const comparable = tasks.filter(
    (t) => t.completed && (t.estimatedMinutes ?? 0) > 0 && t.actualMinutes > 0,
  )
  if (comparable.length === 0) return null

  const scores = comparable.map((t) => {
    const r = t.actualMinutes / (t.estimatedMinutes as number)
    const deviation = r > 1 ? (r - 1) / 1.0 : (1 - r) / 1.5
    return clamp(100 * (1 - deviation), 0, 100)
  })
  return toPercent(sum(scores) / scores.length)
}

/** Focus minutes against the period's target, capped at 100. */
export function focusTimeScore(focusMinutes: number, focusTarget: number): number | null {
  if (focusTarget <= 0) return focusMinutes > 0 ? 100 : null
  if (focusMinutes <= 0) return 0
  return toPercent(ratio(focusMinutes, focusTarget) * 100)
}

/** Share of the trailing window on which the user did anything at all. */
export function consistencyScore(activeDays: number, window: number): number | null {
  if (window <= 0) return null
  return toPercent(ratio(clamp(activeDays, 0, window), window) * 100)
}

/* ------------------------------------------------------------- aggregation -- */

const COMPONENT_LABELS: Record<keyof ScoringWeights, string> = {
  taskCompletion: 'Task completion',
  priorityCompletion: 'Priority-weighted completion',
  deadlineDiscipline: 'Deadline discipline',
  timeEfficiency: 'Time efficiency',
  focusTime: 'Focus time',
  consistency: 'Consistency',
}

export function computeScore(input: ScoringInput): ScoreResult {
  const completed = input.tasks.filter((t) => t.completed).length
  const comparable = input.tasks.filter(
    (t) => t.completed && (t.estimatedMinutes ?? 0) > 0 && t.actualMinutes > 0,
  ).length

  const raw: { key: keyof ScoringWeights; value: number | null; explanation: string }[] = [
    {
      key: 'taskCompletion',
      value: taskCompletionScore(input.tasks),
      explanation:
        input.tasks.length === 0
          ? 'No tasks were scheduled, due or completed in this period.'
          : `${completed} of ${input.tasks.length} task${input.tasks.length === 1 ? '' : 's'} completed.`,
    },
    {
      key: 'priorityCompletion',
      value: priorityCompletionScore(input.tasks),
      explanation:
        input.tasks.length === 0
          ? 'No tasks to weight by priority.'
          : 'Completion weighted by each task’s priority and importance multiplier.',
    },
    {
      key: 'deadlineDiscipline',
      value: deadlineDisciplineScore(input.metDeadlines, input.missedDeadlines),
      explanation:
        input.metDeadlines + input.missedDeadlines === 0
          ? 'No deadlines fell due in this period.'
          : `${input.metDeadlines} deadline${input.metDeadlines === 1 ? '' : 's'} met, ${input.missedDeadlines} missed.`,
    },
    {
      key: 'timeEfficiency',
      value: timeEfficiencyScore(input.tasks),
      explanation:
        comparable === 0
          ? 'No completed tasks had both an estimate and tracked time.'
          : `Estimate accuracy across ${comparable} completed task${comparable === 1 ? '' : 's'}.`,
    },
    {
      key: 'focusTime',
      value: focusTimeScore(input.focusMinutes, input.focusTarget),
      explanation:
        input.focusTarget <= 0
          ? 'No focus target configured.'
          : `${Math.round(input.focusMinutes)}m of focused work against a ${input.focusTarget}m target.`,
    },
    {
      key: 'consistency',
      value: consistencyScore(input.activeDaysInWindow, input.consistencyWindow),
      explanation: `Active on ${input.activeDaysInWindow} of the last ${input.consistencyWindow} days.`,
    },
  ]

  // Renormalise across the components that actually have data.
  const applicable = raw.filter((c) => c.value !== null)
  const applicableWeight = sum(applicable.map((c) => input.weights[c.key] ?? 0))

  const components: ScoreComponent[] = raw.map((c) => ({
    key: c.key,
    label: COMPONENT_LABELS[c.key],
    value: c.value,
    weight: input.weights[c.key] ?? 0,
    effectiveWeight:
      c.value === null || applicableWeight === 0
        ? 0
        : round(((input.weights[c.key] ?? 0) / applicableWeight) * 100, 1),
    explanation: c.explanation,
  }))

  if (applicable.length === 0 || applicableWeight === 0) {
    return { score: 0, rating: 'No Data', components, noData: true }
  }

  const weighted = sum(applicable.map((c) => (c.value as number) * (input.weights[c.key] ?? 0)))
  const score = toPercent(weighted / applicableWeight)

  return { score, rating: ratingFor(score, undefined, false), components, noData: false }
}

const DEFAULT_THRESHOLDS: RatingThresholds = { excellent: 90, veryGood: 80, good: 70, fair: 60 }

export function ratingFor(
  score: number,
  thresholds: RatingThresholds = DEFAULT_THRESHOLDS,
  noData = false,
): Rating {
  if (noData) return 'No Data'
  const t = thresholds ?? DEFAULT_THRESHOLDS
  if (score >= t.excellent) return 'Excellent'
  if (score >= t.veryGood) return 'Very Good'
  if (score >= t.good) return 'Good'
  if (score >= t.fair) return 'Fair'
  return 'Needs Improvement'
}

/** Tailwind text colour for a rating; used consistently everywhere a score appears. */
export function ratingColor(rating: Rating): string {
  switch (rating) {
    case 'Excellent':
      return 'text-emerald-400'
    case 'Very Good':
      return 'text-teal-400'
    case 'Good':
      return 'text-sky-400'
    case 'Fair':
      return 'text-amber-400'
    case 'Needs Improvement':
      return 'text-rose-400'
    default:
      return 'text-muted-foreground'
  }
}

export function ratingRingColor(rating: Rating): string {
  switch (rating) {
    case 'Excellent':
      return '#34d399'
    case 'Very Good':
      return '#2dd4bf'
    case 'Good':
      return '#38bdf8'
    case 'Fair':
      return '#fbbf24'
    case 'Needs Improvement':
      return '#fb7185'
    default:
      return '#64748b'
  }
}

/** Weights must sum to 100 for the UI editor to be meaningful. */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = sum(Object.values(weights))
  if (total === 0) {
    return { taskCompletion: 30, priorityCompletion: 25, deadlineDiscipline: 15, timeEfficiency: 10, focusTime: 10, consistency: 10 }
  }
  const scale = 100 / total
  const scaled = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, Math.round(v * scale)]),
  ) as unknown as ScoringWeights
  // Push any rounding residue into the largest bucket so the total is exactly 100.
  const drift = 100 - sum(Object.values(scaled))
  if (drift !== 0) {
    const keys = Object.keys(scaled) as (keyof ScoringWeights)[]
    const largest = keys.reduce((a, b) => (scaled[a] >= scaled[b] ? a : b))
    scaled[largest] = clamp(scaled[largest] + drift, 0, 100)
  }
  return scaled
}

export interface DailyScoreRecord {
  day: DayKey
  score: number
  noData: boolean
}

/** Best/weakest day across a period, ignoring days with no data. */
export function bestAndWeakest(days: DailyScoreRecord[]): {
  best: DailyScoreRecord | null
  weakest: DailyScoreRecord | null
} {
  const scored = days.filter((d) => !d.noData)
  if (scored.length === 0) return { best: null, weakest: null }
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  return { best: sorted[0], weakest: sorted[sorted.length - 1] }
}
