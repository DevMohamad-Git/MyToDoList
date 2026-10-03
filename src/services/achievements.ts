import { CLOSED_TASK_STATUSES } from '@/config/constants'
import type { AchievementTier } from '@/types'
import { activeDayKeys, computeDayStats, type WorkspaceSnapshot } from '@/services/analytics'
import { activityStreak, habitStreak } from '@/services/streaks'
import { toDayKey } from '@/utils/date'
import { sum } from '@/utils/math'

/**
 * Achievement catalogue.
 *
 * Every achievement is a pure predicate over a workspace snapshot returning
 * `{ value, target }`. Nothing is hand-awarded and nothing is faked: progress is
 * recomputed from stored records, so importing a workspace re-derives the same
 * achievements, and deleting data revokes progress rather than leaving a
 * dangling trophy.
 */

export interface AchievementDefinition {
  key: string
  title: string
  description: string
  tier: AchievementTier
  icon: string
  category: 'tasks' | 'focus' | 'consistency' | 'planning' | 'goals'
  /** Current value and the target needed to unlock. */
  measure: (snapshot: WorkspaceSnapshot, now: Date) => { value: number; target: number }
}

function completedTasks(snapshot: WorkspaceSnapshot): number {
  return snapshot.tasks.filter((t) => t.status === 'completed').length
}

function totalFocusMinutes(snapshot: WorkspaceSnapshot): number {
  return sum(snapshot.focusSessions.map((s) => s.duration))
}

/** A "perfect day": every task in the day's workload closed, with focus logged. */
function perfectDays(snapshot: WorkspaceSnapshot, now: Date): number {
  const days = new Set<string>()
  for (const task of snapshot.tasks) {
    if (task.completedAt) days.add(toDayKey(task.completedAt))
  }
  let count = 0
  for (const day of days) {
    const stats = computeDayStats(snapshot, day, now)
    if (
      stats.workload.length >= 3 &&
      stats.open.length === 0 &&
      stats.focusMinutes > 0 &&
      stats.missedDeadlines === 0
    ) {
      count++
    }
  }
  return count
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: 'first_task',
    title: 'First Step',
    description: 'Complete your first task.',
    tier: 'bronze',
    icon: 'check-circle',
    category: 'tasks',
    measure: (s) => ({ value: completedTasks(s), target: 1 }),
  },
  {
    key: 'tasks_10',
    title: 'Getting Traction',
    description: 'Complete 10 tasks.',
    tier: 'bronze',
    icon: 'list-checks',
    category: 'tasks',
    measure: (s) => ({ value: completedTasks(s), target: 10 }),
  },
  {
    key: 'tasks_50',
    title: 'Momentum',
    description: 'Complete 50 tasks.',
    tier: 'silver',
    icon: 'trending-up',
    category: 'tasks',
    measure: (s) => ({ value: completedTasks(s), target: 50 }),
  },
  {
    key: 'tasks_100',
    title: 'Century',
    description: 'Complete 100 tasks.',
    tier: 'gold',
    icon: 'award',
    category: 'tasks',
    measure: (s) => ({ value: completedTasks(s), target: 100 }),
  },
  {
    key: 'tasks_500',
    title: 'Relentless',
    description: 'Complete 500 tasks.',
    tier: 'platinum',
    icon: 'crown',
    category: 'tasks',
    measure: (s) => ({ value: completedTasks(s), target: 500 }),
  },
  {
    key: 'first_project',
    title: 'Architect',
    description: 'Create your first project.',
    tier: 'bronze',
    icon: 'folder-plus',
    category: 'planning',
    measure: (s) => ({ value: s.projects.length, target: 1 }),
  },
  {
    key: 'project_completed',
    title: 'Shipped It',
    description: 'Complete a project from start to finish.',
    tier: 'silver',
    icon: 'package-check',
    category: 'planning',
    measure: (s) => ({ value: s.projects.filter((p) => p.status === 'completed').length, target: 1 }),
  },
  {
    key: 'first_focus',
    title: 'In The Zone',
    description: 'Complete your first focus session.',
    tier: 'bronze',
    icon: 'timer',
    category: 'focus',
    measure: (s) => ({ value: s.focusSessions.filter((f) => f.duration > 0).length, target: 1 }),
  },
  {
    key: 'focus_10h',
    title: 'Deep Worker',
    description: 'Log 10 hours of focused work.',
    tier: 'silver',
    icon: 'brain',
    category: 'focus',
    measure: (s) => ({ value: totalFocusMinutes(s), target: 600 }),
  },
  {
    key: 'focus_50h',
    title: 'Flow State',
    description: 'Log 50 hours of focused work.',
    tier: 'gold',
    icon: 'zap',
    category: 'focus',
    measure: (s) => ({ value: totalFocusMinutes(s), target: 3000 }),
  },
  {
    key: 'pomodoro_25',
    title: 'Tomato Farmer',
    description: 'Finish 25 Pomodoro cycles.',
    tier: 'silver',
    icon: 'circle-dot',
    category: 'focus',
    measure: (s) => ({
      value: s.focusSessions.filter((f) => f.mode === 'pomodoro' && f.completed).length,
      target: 25,
    }),
  },
  {
    key: 'streak_7',
    title: '7 Day Streak',
    description: 'Stay active for 7 consecutive days.',
    tier: 'bronze',
    icon: 'flame',
    category: 'consistency',
    measure: (s, now) => ({ value: activityStreak(activeDayKeys(s), now).longest, target: 7 }),
  },
  {
    key: 'streak_14',
    title: '14 Day Streak',
    description: 'Stay active for 14 consecutive days.',
    tier: 'silver',
    icon: 'flame',
    category: 'consistency',
    measure: (s, now) => ({ value: activityStreak(activeDayKeys(s), now).longest, target: 14 }),
  },
  {
    key: 'streak_30',
    title: '30 Day Streak',
    description: 'Stay active for 30 consecutive days.',
    tier: 'gold',
    icon: 'flame',
    category: 'consistency',
    measure: (s, now) => ({ value: activityStreak(activeDayKeys(s), now).longest, target: 30 }),
  },
  {
    key: 'deadline_master',
    title: 'Deadline Master',
    description: 'Meet 25 deadlines on time.',
    tier: 'gold',
    icon: 'calendar-check',
    category: 'planning',
    measure: (s) => ({
      value: s.tasks.filter((t) => t.dueDate && t.completedAt && t.completedAt <= t.dueDate).length,
      target: 25,
    }),
  },
  {
    key: 'perfect_day',
    title: 'Perfect Day',
    description: 'Close every task on a day with 3+ tasks, no missed deadlines, and focus time logged.',
    tier: 'gold',
    icon: 'sparkles',
    category: 'consistency',
    measure: (s, now) => ({ value: perfectDays(s, now), target: 1 }),
  },
  {
    key: 'reviewer_7',
    title: 'Reflective Practitioner',
    description: 'Complete 7 daily reviews.',
    tier: 'silver',
    icon: 'notebook-pen',
    category: 'consistency',
    measure: (s) => ({ value: s.dailyReviews.length, target: 7 }),
  },
  {
    key: 'habit_streak_21',
    title: 'Habit Formed',
    description: 'Reach a 21 day streak on any habit.',
    tier: 'gold',
    icon: 'repeat',
    category: 'consistency',
    measure: (s, now) => ({
      value: Math.max(
        0,
        ...s.habits.map((h) => habitStreak(h, s.habitEntries, now, s.settings.planning.weekStartsOn).longest),
      ),
      target: 21,
    }),
  },
  {
    key: 'goal_achieved',
    title: 'Goal Getter',
    description: 'Achieve a long-term goal.',
    tier: 'gold',
    icon: 'target',
    category: 'goals',
    measure: (s) => ({ value: s.goals.filter((g) => g.status === 'achieved').length, target: 1 }),
  },
  {
    key: 'inbox_zero',
    title: 'Inbox Zero',
    description: 'Have at least 15 tasks and none left sitting in the Inbox.',
    tier: 'silver',
    icon: 'inbox',
    category: 'planning',
    measure: (s) => {
      const open = s.tasks.filter((t) => !t.archived && !CLOSED_TASK_STATUSES.includes(t.status))
      const inbox = open.filter((t) => t.status === 'inbox').length
      return { value: s.tasks.length >= 15 && inbox === 0 ? 1 : 0, target: 1 }
    },
  },
]

export interface AchievementProgress {
  definition: AchievementDefinition
  value: number
  target: number
  percent: number
  unlocked: boolean
}

export function evaluateAchievements(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date(),
): AchievementProgress[] {
  return ACHIEVEMENTS.map((definition) => {
    const { value, target } = definition.measure(snapshot, now)
    const safeTarget = target || 1
    return {
      definition,
      value,
      target: safeTarget,
      percent: Math.min(100, Math.round((value / safeTarget) * 100)),
      unlocked: value >= safeTarget,
    }
  })
}

export const TIER_CLASS: Record<AchievementTier, string> = {
  bronze: 'text-amber-600 border-amber-600/30 bg-amber-600/10',
  silver: 'text-slate-300 border-slate-300/30 bg-slate-300/10',
  gold: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  platinum: 'text-cyan-300 border-cyan-300/30 bg-cyan-300/10',
}
