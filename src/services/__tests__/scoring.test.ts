import { describe, expect, it } from 'vitest'
import {
  bestAndWeakest,
  computeScore,
  consistencyScore,
  deadlineDisciplineScore,
  focusTimeScore,
  normalizeWeights,
  priorityCompletionScore,
  ratingFor,
  taskCompletionScore,
  timeEfficiencyScore,
  type ScoredTask,
  type ScoringInput,
} from '@/services/scoring'
import { DEFAULT_RATING_THRESHOLDS, DEFAULT_SCORING_WEIGHTS } from '@/config/constants'

function scored(overrides: Partial<ScoredTask> = {}): ScoredTask {
  return {
    priority: 'medium',
    scoreWeight: 1,
    completed: false,
    onTime: null,
    estimatedMinutes: null,
    actualMinutes: 0,
    ...overrides,
  }
}

function input(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    tasks: [],
    metDeadlines: 0,
    missedDeadlines: 0,
    focusMinutes: 0,
    focusTarget: 180,
    plannedMinutes: 0,
    actualMinutes: 0,
    activeDaysInWindow: 0,
    consistencyWindow: 7,
    weights: DEFAULT_SCORING_WEIGHTS,
    ...overrides,
  }
}

describe('taskCompletionScore', () => {
  it('is null with no tasks rather than 0', () => {
    expect(taskCompletionScore([])).toBeNull()
  })

  it('is the completion percentage', () => {
    expect(
      taskCompletionScore([scored({ completed: true }), scored({ completed: true }), scored(), scored()]),
    ).toBe(50)
  })
})

describe('priorityCompletionScore', () => {
  it('weights critical work far above low-priority work', () => {
    // Completing the one critical task (weight 4) out of 4+1 total weight = 80.
    const tasks = [
      scored({ priority: 'critical', completed: true }),
      scored({ priority: 'low', completed: false }),
    ]
    expect(priorityCompletionScore(tasks)).toBe(80)
  })

  it('penalises completing only trivia', () => {
    const tasks = [
      scored({ priority: 'critical', completed: false }),
      scored({ priority: 'low', completed: true }),
    ]
    expect(priorityCompletionScore(tasks)).toBe(20)
  })

  it('differs from plain completion for a mixed-priority day', () => {
    const tasks = [
      scored({ priority: 'critical', completed: false }),
      scored({ priority: 'low', completed: true }),
      scored({ priority: 'low', completed: true }),
    ]
    expect(taskCompletionScore(tasks)).toBe(67)
    expect(priorityCompletionScore(tasks)).toBe(33)
  })

  it('applies the per-task importance multiplier', () => {
    const tasks = [
      scored({ priority: 'medium', scoreWeight: 4, completed: true }),
      scored({ priority: 'medium', scoreWeight: 1, completed: false }),
    ]
    // weights 8 and 2 → 80
    expect(priorityCompletionScore(tasks)).toBe(80)
  })

  it('clamps an out-of-range weight', () => {
    const tasks = [
      scored({ priority: 'medium', scoreWeight: 1000, completed: true }),
      scored({ priority: 'medium', scoreWeight: 1, completed: false }),
    ]
    // Weight clamps to 4 → 8 of 10 → 80, not ~100.
    expect(priorityCompletionScore(tasks)).toBe(80)
  })
})

describe('deadlineDisciplineScore', () => {
  it('is null when no deadlines came due', () => {
    expect(deadlineDisciplineScore(0, 0)).toBeNull()
  })

  it('is the share of deadlines met', () => {
    expect(deadlineDisciplineScore(3, 1)).toBe(75)
    expect(deadlineDisciplineScore(0, 2)).toBe(0)
  })
})

describe('timeEfficiencyScore', () => {
  it('is null without comparable tasks', () => {
    expect(timeEfficiencyScore([scored({ completed: true })])).toBeNull()
    // Estimated but never tracked → not comparable.
    expect(timeEfficiencyScore([scored({ completed: true, estimatedMinutes: 60 })])).toBeNull()
  })

  it('is 100 for a perfect estimate', () => {
    expect(timeEfficiencyScore([scored({ completed: true, estimatedMinutes: 60, actualMinutes: 60 })])).toBe(100)
  })

  it('penalises overruns harder than finishing early', () => {
    const over = timeEfficiencyScore([scored({ completed: true, estimatedMinutes: 60, actualMinutes: 90 })])!
    const under = timeEfficiencyScore([scored({ completed: true, estimatedMinutes: 60, actualMinutes: 30 })])!
    expect(over).toBe(50)
    expect(under).toBe(67)
    expect(under).toBeGreaterThan(over)
  })

  it('floors at 0 for an extreme overrun', () => {
    expect(timeEfficiencyScore([scored({ completed: true, estimatedMinutes: 10, actualMinutes: 300 })])).toBe(0)
  })

  it('ignores incomplete tasks', () => {
    const tasks = [
      scored({ completed: true, estimatedMinutes: 60, actualMinutes: 60 }),
      scored({ completed: false, estimatedMinutes: 60, actualMinutes: 600 }),
    ]
    expect(timeEfficiencyScore(tasks)).toBe(100)
  })
})

describe('focusTimeScore', () => {
  it('is proportional to the target and caps at 100', () => {
    expect(focusTimeScore(90, 180)).toBe(50)
    expect(focusTimeScore(180, 180)).toBe(100)
    expect(focusTimeScore(400, 180)).toBe(100)
  })

  it('is 0 when a target exists but nothing was logged', () => {
    expect(focusTimeScore(0, 180)).toBe(0)
  })

  it('is null when there is no target and no focus time', () => {
    expect(focusTimeScore(0, 0)).toBeNull()
  })
})

describe('consistencyScore', () => {
  it('is the share of active days in the window', () => {
    expect(consistencyScore(5, 7)).toBe(71)
    expect(consistencyScore(7, 7)).toBe(100)
    expect(consistencyScore(0, 7)).toBe(0)
  })

  it('clamps activity above the window size', () => {
    expect(consistencyScore(12, 7)).toBe(100)
  })
})

describe('computeScore', () => {
  it('reports no data for an empty period instead of scoring 0', () => {
    const result = computeScore(input({ focusTarget: 0, consistencyWindow: 0 }))
    expect(result.noData).toBe(true)
    expect(result.score).toBe(0)
    expect(result.rating).toBe('No Data')
  })

  it('is deterministic for identical input', () => {
    const args = input({
      tasks: [scored({ completed: true, priority: 'high' }), scored({ priority: 'low' })],
      metDeadlines: 1,
      missedDeadlines: 1,
      focusMinutes: 120,
      activeDaysInWindow: 4,
    })
    expect(computeScore(args).score).toBe(computeScore(args).score)
  })

  it('renormalises weights across only the applicable components', () => {
    // Only consistency has data: window 7, 7 active days → 100.
    const result = computeScore(input({ focusTarget: 0, activeDaysInWindow: 7 }))
    expect(result.score).toBe(100)
    const consistency = result.components.find((c) => c.key === 'consistency')!
    expect(consistency.effectiveWeight).toBe(100)
    const completion = result.components.find((c) => c.key === 'taskCompletion')!
    expect(completion.value).toBeNull()
    expect(completion.effectiveWeight).toBe(0)
  })

  it('produces a perfect score for a perfect period', () => {
    const result = computeScore(
      input({
        tasks: [
          scored({ completed: true, priority: 'critical', estimatedMinutes: 60, actualMinutes: 60 }),
          scored({ completed: true, priority: 'high', estimatedMinutes: 30, actualMinutes: 30 }),
        ],
        metDeadlines: 2,
        missedDeadlines: 0,
        focusMinutes: 180,
        focusTarget: 180,
        activeDaysInWindow: 7,
      }),
    )
    expect(result.score).toBe(100)
    expect(result.rating).toBe('Excellent')
  })

  it('produces a low score for a bad period', () => {
    const result = computeScore(
      input({
        tasks: [scored({ priority: 'critical' }), scored({ priority: 'high' })],
        metDeadlines: 0,
        missedDeadlines: 2,
        focusMinutes: 0,
        activeDaysInWindow: 1,
      }),
    )
    expect(result.score).toBeLessThan(20)
    expect(result.rating).toBe('Needs Improvement')
  })

  it('is not merely completed/total — priority changes the result', () => {
    const base = {
      metDeadlines: 0,
      missedDeadlines: 0,
      focusMinutes: 0,
      focusTarget: 0,
      activeDaysInWindow: 0,
      consistencyWindow: 0,
    }
    const criticalDone = computeScore(
      input({ ...base, tasks: [scored({ priority: 'critical', completed: true }), scored({ priority: 'low' })] }),
    ).score
    const lowDone = computeScore(
      input({ ...base, tasks: [scored({ priority: 'critical' }), scored({ priority: 'low', completed: true })] }),
    ).score
    // Same 1-of-2 completion rate, materially different scores.
    expect(criticalDone).toBeGreaterThan(lowDone)
  })

  it('attaches an explanation to every component', () => {
    const result = computeScore(input({ tasks: [scored({ completed: true })] }))
    expect(result.components).toHaveLength(6)
    for (const component of result.components) {
      expect(component.explanation.length).toBeGreaterThan(0)
      expect(component.label.length).toBeGreaterThan(0)
    }
  })

  it('stays within 0–100 for extreme inputs', () => {
    const result = computeScore(
      input({
        tasks: Array.from({ length: 50 }, () => scored({ completed: true, priority: 'critical', scoreWeight: 4 })),
        metDeadlines: 100,
        focusMinutes: 10_000,
        activeDaysInWindow: 99,
      }),
    )
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

describe('ratingFor', () => {
  it('maps scores onto the configured bands', () => {
    const t = DEFAULT_RATING_THRESHOLDS
    expect(ratingFor(95, t)).toBe('Excellent')
    expect(ratingFor(90, t)).toBe('Excellent')
    expect(ratingFor(85, t)).toBe('Very Good')
    expect(ratingFor(75, t)).toBe('Good')
    expect(ratingFor(65, t)).toBe('Fair')
    expect(ratingFor(20, t)).toBe('Needs Improvement')
  })

  it('respects custom thresholds', () => {
    expect(ratingFor(75, { excellent: 70, veryGood: 60, good: 50, fair: 40 })).toBe('Excellent')
  })
})

describe('normalizeWeights', () => {
  it('scales weights to sum to exactly 100', () => {
    const result = normalizeWeights({
      taskCompletion: 60,
      priorityCompletion: 50,
      deadlineDiscipline: 30,
      timeEfficiency: 20,
      focusTime: 20,
      consistency: 20,
    })
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('falls back to defaults when all weights are zero', () => {
    const result = normalizeWeights({
      taskCompletion: 0,
      priorityCompletion: 0,
      deadlineDiscipline: 0,
      timeEfficiency: 0,
      focusTime: 0,
      consistency: 0,
    })
    expect(result).toEqual(DEFAULT_SCORING_WEIGHTS)
  })

  it('preserves an already-normalised set', () => {
    expect(Object.values(normalizeWeights(DEFAULT_SCORING_WEIGHTS)).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('bestAndWeakest', () => {
  it('ignores days with no data', () => {
    const { best, weakest } = bestAndWeakest([
      { day: '2026-06-01', score: 0, noData: true },
      { day: '2026-06-02', score: 80, noData: false },
      { day: '2026-06-03', score: 40, noData: false },
    ])
    expect(best?.day).toBe('2026-06-02')
    expect(weakest?.day).toBe('2026-06-03')
  })

  it('returns nulls when nothing was scored', () => {
    const { best, weakest } = bestAndWeakest([{ day: '2026-06-01', score: 0, noData: true }])
    expect(best).toBeNull()
    expect(weakest).toBeNull()
  })
})
