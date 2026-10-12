import { CLOSED_TASK_STATUSES } from '@/config/constants'
import type { AchievementTier } from '@/types'
import {
  buildAnalyticsIndex,
  computeDayStats,
  type DayComputeContext,
  type WorkspaceSnapshot,
} from '@/services/analytics'
import { activityStreak, habitStreak } from '@/services/streaks'
import type { TranslationKey } from '@/i18n'
import { sum } from '@/utils/math'

/**
 * Achievement catalogue & high-performance evaluation engine.
 *
 * Every achievement is derived from the workspace snapshot with O(1) indexed
 * lookups and precomputed aggregates. No redundant array sweeps, no sequential
 * bottlenecks, and fully typed for internationalization & XP gamification.
 */

export const TIER_XP: Record<AchievementTier, number> = {
  bronze: 50,
  silver: 100,
  gold: 250,
  platinum: 500,
}

export interface AchievementDefinition {
  key: string
  titleKey: TranslationKey
  descKey: TranslationKey
  title: string
  description: string
  tier: AchievementTier
  xp: number
  icon: string
  category: 'tasks' | 'focus' | 'consistency' | 'planning' | 'goals'
  /** Current value and the target needed to unlock using pre-indexed aggregates. */
  measure: (
    snapshot: WorkspaceSnapshot,
    now: Date,
    ctx: AchievementEvaluationContext,
  ) => { value: number; target: number }
}

export interface AchievementEvaluationContext {
  analyticsIndex: DayComputeContext
  completedTasksCount: number
  totalTasksCount: number
  totalFocusMinutes: number
  pomodoroCyclesCount: number
  completedProjectsCount: number
  onTimeDeadlinesCount: number
  perfectDaysCount: number
  longestActivityStreak: number
  longestHabitStreak: number
  achievedGoalsCount: number
  isInboxZero: boolean
}

export function buildAchievementContext(
  snapshot: WorkspaceSnapshot,
  now: Date,
): AchievementEvaluationContext {
  const analyticsIndex = buildAnalyticsIndex(snapshot)

  // Single pass aggregations over tasks
  let completedTasksCount = 0
  let onTimeDeadlinesCount = 0
  let inboxTasksCount = 0

  for (const t of snapshot.tasks) {
    if (t.status === 'completed') {
      completedTasksCount++
    }
    if (t.dueDate && t.completedAt && t.completedAt <= t.dueDate) {
      onTimeDeadlinesCount++
    }
    if (!t.archived && !CLOSED_TASK_STATUSES.includes(t.status) && t.status === 'inbox') {
      inboxTasksCount++
    }
  }

  // Precompute perfect days efficiently via pre-indexed context (O(A) where A is active days)
  let perfectDaysCount = 0
  for (const day of analyticsIndex.active) {
    const stats = computeDayStats(snapshot, day, now, analyticsIndex)
    if (
      stats.workload.length >= 3 &&
      stats.open.length === 0 &&
      stats.focusMinutes > 0 &&
      stats.missedDeadlines === 0
    ) {
      perfectDaysCount++
    }
  }

  // Single pass over focus sessions
  let totalFocusMinutes = 0
  let pomodoroCyclesCount = 0
  for (const f of snapshot.focusSessions) {
    if (f.duration > 0) totalFocusMinutes += f.duration
    if (f.mode === 'pomodoro' && f.completed) pomodoroCyclesCount++
  }

  // Habits streak evaluated once
  const longestHabitStreak =
    snapshot.habits.length > 0
      ? Math.max(
          0,
          ...snapshot.habits.map(
            (h) =>
              habitStreak(h, snapshot.habitEntries, now, snapshot.settings.planning.weekStartsOn)
                .longest,
          ),
        )
      : 0

  // Activity streak evaluated once
  const longestActivityStreak = activityStreak(analyticsIndex.active, now).longest

  const completedProjectsCount = snapshot.projects.filter((p) => p.status === 'completed').length
  const achievedGoalsCount = snapshot.goals.filter((g) => g.status === 'achieved').length
  const isInboxZero = snapshot.tasks.length >= 15 && inboxTasksCount === 0

  return {
    analyticsIndex,
    completedTasksCount,
    totalTasksCount: snapshot.tasks.length,
    totalFocusMinutes,
    pomodoroCyclesCount,
    completedProjectsCount,
    onTimeDeadlinesCount,
    perfectDaysCount,
    longestActivityStreak,
    longestHabitStreak,
    achievedGoalsCount,
    isInboxZero,
  }
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: 'first_task',
    titleKey: 'ach_first_task_title',
    descKey: 'ach_first_task_desc',
    title: 'First Step',
    description: 'Complete your first task.',
    tier: 'bronze',
    xp: TIER_XP.bronze,
    icon: 'check-circle',
    category: 'tasks',
    measure: (_s, _now, ctx) => ({ value: ctx.completedTasksCount, target: 1 }),
  },
  {
    key: 'tasks_10',
    titleKey: 'ach_tasks_10_title',
    descKey: 'ach_tasks_10_desc',
    title: 'Getting Traction',
    description: 'Complete 10 tasks.',
    tier: 'bronze',
    xp: TIER_XP.bronze,
    icon: 'list-checks',
    category: 'tasks',
    measure: (_s, _now, ctx) => ({ value: ctx.completedTasksCount, target: 10 }),
  },
  {
    key: 'tasks_50',
    titleKey: 'ach_tasks_50_title',
    descKey: 'ach_tasks_50_desc',
    title: 'Momentum',
    description: 'Complete 50 tasks.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'trending-up',
    category: 'tasks',
    measure: (_s, _now, ctx) => ({ value: ctx.completedTasksCount, target: 50 }),
  },
  {
    key: 'tasks_100',
    titleKey: 'ach_tasks_100_title',
    descKey: 'ach_tasks_100_desc',
    title: 'Century',
    description: 'Complete 100 tasks.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'award',
    category: 'tasks',
    measure: (_s, _now, ctx) => ({ value: ctx.completedTasksCount, target: 100 }),
  },
  {
    key: 'tasks_500',
    titleKey: 'ach_tasks_500_title',
    descKey: 'ach_tasks_500_desc',
    title: 'Relentless',
    description: 'Complete 500 tasks.',
    tier: 'platinum',
    xp: TIER_XP.platinum,
    icon: 'crown',
    category: 'tasks',
    measure: (_s, _now, ctx) => ({ value: ctx.completedTasksCount, target: 500 }),
  },
  {
    key: 'first_project',
    titleKey: 'ach_first_project_title',
    descKey: 'ach_first_project_desc',
    title: 'Architect',
    description: 'Create your first project.',
    tier: 'bronze',
    xp: TIER_XP.bronze,
    icon: 'folder-plus',
    category: 'planning',
    measure: (s) => ({ value: s.projects.length, target: 1 }),
  },
  {
    key: 'project_completed',
    titleKey: 'ach_project_completed_title',
    descKey: 'ach_project_completed_desc',
    title: 'Shipped It',
    description: 'Complete a project from start to finish.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'package-check',
    category: 'planning',
    measure: (_s, _now, ctx) => ({ value: ctx.completedProjectsCount, target: 1 }),
  },
  {
    key: 'first_focus',
    titleKey: 'ach_first_focus_title',
    descKey: 'ach_first_focus_desc',
    title: 'In The Zone',
    description: 'Complete your first focus session.',
    tier: 'bronze',
    xp: TIER_XP.bronze,
    icon: 'timer',
    category: 'focus',
    measure: (s) => ({
      value: s.focusSessions.filter((f) => f.duration > 0).length,
      target: 1,
    }),
  },
  {
    key: 'focus_10h',
    titleKey: 'ach_focus_10h_title',
    descKey: 'ach_focus_10h_desc',
    title: 'Deep Worker',
    description: 'Log 10 hours of focused work.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'brain',
    category: 'focus',
    measure: (_s, _now, ctx) => ({ value: ctx.totalFocusMinutes, target: 600 }),
  },
  {
    key: 'focus_50h',
    titleKey: 'ach_focus_50h_title',
    descKey: 'ach_focus_50h_desc',
    title: 'Flow State',
    description: 'Log 50 hours of focused work.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'zap',
    category: 'focus',
    measure: (_s, _now, ctx) => ({ value: ctx.totalFocusMinutes, target: 3000 }),
  },
  {
    key: 'pomodoro_25',
    titleKey: 'ach_pomodoro_25_title',
    descKey: 'ach_pomodoro_25_desc',
    title: 'Tomato Farmer',
    description: 'Finish 25 Pomodoro cycles.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'circle-dot',
    category: 'focus',
    measure: (_s, _now, ctx) => ({ value: ctx.pomodoroCyclesCount, target: 25 }),
  },
  {
    key: 'streak_7',
    titleKey: 'ach_streak_7_title',
    descKey: 'ach_streak_7_desc',
    title: '7 Day Streak',
    description: 'Stay active for 7 consecutive days.',
    tier: 'bronze',
    xp: TIER_XP.bronze,
    icon: 'flame',
    category: 'consistency',
    measure: (_s, _now, ctx) => ({ value: ctx.longestActivityStreak, target: 7 }),
  },
  {
    key: 'streak_14',
    titleKey: 'ach_streak_14_title',
    descKey: 'ach_streak_14_desc',
    title: '14 Day Streak',
    description: 'Stay active for 14 consecutive days.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'flame',
    category: 'consistency',
    measure: (_s, _now, ctx) => ({ value: ctx.longestActivityStreak, target: 14 }),
  },
  {
    key: 'streak_30',
    titleKey: 'ach_streak_30_title',
    descKey: 'ach_streak_30_desc',
    title: '30 Day Streak',
    description: 'Stay active for 30 consecutive days.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'flame',
    category: 'consistency',
    measure: (_s, _now, ctx) => ({ value: ctx.longestActivityStreak, target: 30 }),
  },
  {
    key: 'deadline_master',
    titleKey: 'ach_deadline_master_title',
    descKey: 'ach_deadline_master_desc',
    title: 'Deadline Master',
    description: 'Meet 25 deadlines on time.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'calendar-check',
    category: 'planning',
    measure: (_s, _now, ctx) => ({ value: ctx.onTimeDeadlinesCount, target: 25 }),
  },
  {
    key: 'perfect_day',
    titleKey: 'ach_perfect_day_title',
    descKey: 'ach_perfect_day_desc',
    title: 'Perfect Day',
    description:
      'Close every task on a day with 3+ tasks, no missed deadlines, and focus time logged.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'sparkles',
    category: 'consistency',
    measure: (_s, _now, ctx) => ({ value: ctx.perfectDaysCount, target: 1 }),
  },
  {
    key: 'reviewer_7',
    titleKey: 'ach_reviewer_7_title',
    descKey: 'ach_reviewer_7_desc',
    title: 'Reflective Practitioner',
    description: 'Complete 7 daily reviews.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'notebook-pen',
    category: 'consistency',
    measure: (s) => ({ value: s.dailyReviews.length, target: 7 }),
  },
  {
    key: 'habit_streak_21',
    titleKey: 'ach_habit_streak_21_title',
    descKey: 'ach_habit_streak_21_desc',
    title: 'Habit Formed',
    description: 'Reach a 21 day streak on any habit.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'repeat',
    category: 'consistency',
    measure: (_s, _now, ctx) => ({ value: ctx.longestHabitStreak, target: 21 }),
  },
  {
    key: 'goal_achieved',
    titleKey: 'ach_goal_achieved_title',
    descKey: 'ach_goal_achieved_desc',
    title: 'Goal Getter',
    description: 'Achieve a long-term goal.',
    tier: 'gold',
    xp: TIER_XP.gold,
    icon: 'target',
    category: 'goals',
    measure: (_s, _now, ctx) => ({ value: ctx.achievedGoalsCount, target: 1 }),
  },
  {
    key: 'inbox_zero',
    titleKey: 'ach_inbox_zero_title',
    descKey: 'ach_inbox_zero_desc',
    title: 'Inbox Zero',
    description: 'Have at least 15 tasks and none left sitting in the Inbox.',
    tier: 'silver',
    xp: TIER_XP.silver,
    icon: 'inbox',
    category: 'planning',
    measure: (_s, _now, ctx) => ({ value: ctx.isInboxZero ? 1 : 0, target: 1 }),
  },
]

export interface AchievementProgress {
  definition: AchievementDefinition
  value: number
  target: number
  percent: number
  unlocked: boolean
  xp: number
}

export function evaluateAchievements(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date(),
): AchievementProgress[] {
  const ctx = buildAchievementContext(snapshot, now)
  return ACHIEVEMENTS.map((definition) => {
    const { value, target } = definition.measure(snapshot, now, ctx)
    const safeTarget = target || 1
    const unlocked = value >= safeTarget
    return {
      definition,
      value,
      target: safeTarget,
      percent: Math.min(100, Math.round((value / safeTarget) * 100)),
      unlocked,
      xp: definition.xp,
    }
  })
}

/* ------------------------------------------------------------- level system -- */

export interface LevelThreshold {
  level: number
  minXp: number
  titleKey: TranslationKey
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, minXp: 0, titleKey: 'achievementsLevelTitle1' },
  { level: 2, minXp: 150, titleKey: 'achievementsLevelTitle2' },
  { level: 3, minXp: 400, titleKey: 'achievementsLevelTitle3' },
  { level: 4, minXp: 750, titleKey: 'achievementsLevelTitle4' },
  { level: 5, minXp: 1200, titleKey: 'achievementsLevelTitle5' },
  { level: 6, minXp: 1750, titleKey: 'achievementsLevelTitle6' },
  { level: 7, minXp: 2350, titleKey: 'achievementsLevelTitle7' },
  { level: 8, minXp: 2850, titleKey: 'achievementsLevelTitle8' },
  { level: 9, minXp: 3150, titleKey: 'achievementsLevelTitle9' },
]

export interface LevelInfo {
  level: number
  titleKey: TranslationKey
  currentLevelXp: number
  xpForNextLevel: number
  progressPercent: number
  totalEarnedXp: number
  totalCatalogueXp: number
  isMaxLevel: boolean
}

export function computeLevelInfo(progress: AchievementProgress[]): LevelInfo {
  const totalCatalogueXp = sum(ACHIEVEMENTS.map((a) => a.xp))
  const totalEarnedXp = sum(progress.filter((p) => p.unlocked).map((p) => p.xp))

  let currentTierIndex = 0
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalEarnedXp >= LEVEL_THRESHOLDS[i].minXp) {
      currentTierIndex = i
    } else {
      break
    }
  }

  const currentThresh = LEVEL_THRESHOLDS[currentTierIndex]
  const isMaxLevel = currentTierIndex === LEVEL_THRESHOLDS.length - 1

  if (isMaxLevel) {
    return {
      level: currentThresh.level,
      titleKey: currentThresh.titleKey,
      currentLevelXp: totalEarnedXp - currentThresh.minXp,
      xpForNextLevel: 0,
      progressPercent: 100,
      totalEarnedXp,
      totalCatalogueXp,
      isMaxLevel: true,
    }
  }

  const nextThresh = LEVEL_THRESHOLDS[currentTierIndex + 1]
  const span = nextThresh.minXp - currentThresh.minXp
  const currentLevelXp = totalEarnedXp - currentThresh.minXp
  const xpForNextLevel = nextThresh.minXp - totalEarnedXp
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentLevelXp / span) * 100)))

  return {
    level: currentThresh.level,
    titleKey: currentThresh.titleKey,
    currentLevelXp,
    xpForNextLevel,
    progressPercent,
    totalEarnedXp,
    totalCatalogueXp,
    isMaxLevel: false,
  }
}

export const TIER_CLASS: Record<AchievementTier, string> = {
  bronze: 'text-amber-600 border-amber-600/30 bg-amber-600/10 dark:text-amber-400 dark:border-amber-400/30 dark:bg-amber-400/10',
  silver: 'text-slate-500 border-slate-400/30 bg-slate-400/10 dark:text-slate-300 dark:border-slate-300/30 dark:bg-slate-300/10',
  gold: 'text-amber-500 border-yellow-400/30 bg-yellow-400/10 dark:text-yellow-300 dark:border-yellow-400/30 dark:bg-yellow-400/10',
  platinum: 'text-cyan-600 border-cyan-400/30 bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-300/30 dark:bg-cyan-300/10',
}
