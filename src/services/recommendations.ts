import { subDays } from 'date-fns'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { intlLocale, t } from '@/i18n'
import {
  buildDayPlan,
  effectiveDuration,
} from '@/services/planner'
import {
  computeRangeStats,
  dayWorkload,
  estimationInsights,
  goalStatsMap,
  projectStatsMap,
  scoreTrend,
  type WorkspaceSnapshot,
} from '@/services/analytics'
import type { DayKey } from '@/types'
import { formatDuration, toDayKey } from '@/utils/date'
import { sum } from '@/utils/math'

/**
 * Local recommendation engine.
 *
 * These are computed **entirely offline** from stored data — no AI required — so
 * the app still tells the user what needs attention with no provider configured.
 * The AI layer consumes the same recommendations as context rather than inventing
 * its own statistics.
 *
 * Every recommendation carries an `evidence` string: the concrete numbers it was
 * derived from. A suggestion the user cannot audit is just noise.
 */

export type RecommendationSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface Recommendation {
  id: string
  severity: RecommendationSeverity
  title: string
  detail: string
  /** The specific data this conclusion came from. */
  evidence: string
  /** Where the user should go to act on it. */
  action?: { label: string; to: string }
}

export function buildRecommendations(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date(),
): Recommendation[] {
  const out: Recommendation[] = []
  const today = toDayKey(now)
  const settings = snapshot.settings
  const open = snapshot.tasks.filter((t) => !t.archived && !CLOSED_TASK_STATUSES.includes(t.status))

  /* -------------------------------------------------------- overdue work -- */
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < now)
  if (overdue.length > 0) {
    const oldest = overdue.reduce((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? a : b))
    const daysLate = Math.max(
      1,
      Math.ceil((now.getTime() - new Date(oldest.dueDate!).getTime()) / 86_400_000),
    )
    out.push({
      id: 'overdue',
      severity: overdue.length >= 5 || daysLate >= 7 ? 'critical' : 'warning',
      title: overdue.length === 1 ? t('recOverdueTitle1') : t('recOverdueTitleN', { n: overdue.length }),
      detail:
        overdue.length === 1
          ? t('recOverdueDetail1', { title: oldest.title, n: daysLate })
          : t('recOverdueDetailN', { title: oldest.title, n: daysLate }),
      evidence: t('evOverdue', {
        n: overdue.length,
        when: now.toLocaleString(intlLocale()),
      }),
      action: { label: t('recReviewOverdue'), to: '/tasks?filter=overdue' },
    })
  }

  /* ----------------------------------------------------- today's capacity -- */
  const scheduledToday = snapshot.tasks.filter(
    (t) => !t.archived && t.startDate && toDayKey(t.startDate) === today,
  )
  const plan = buildDayPlan(today, scheduledToday, [], settings.planning)
  if (plan.overbooked) {
    out.push({
      id: 'overbooked',
      severity: plan.loadPercent > 150 ? 'critical' : 'warning',
      title: t('recOverbookedTitle', { n: plan.loadPercent }),
      detail: t('recOverbookedDetail', {
        sched: formatDuration(plan.scheduledMinutes),
        cap: formatDuration(plan.capacityMinutes),
      }),
      evidence: t('evOverbooked', {
        n: plan.blocks.length,
        sched: formatDuration(plan.scheduledMinutes),
        cap: formatDuration(plan.capacityMinutes),
      }),
      action: { label: t('recOpenPlanner'), to: '/planner' },
    })
  }
  if (plan.conflictCount > 0) {
    out.push({
      id: 'conflicts',
      severity: 'warning',
      title:
        plan.conflictCount === 1
          ? t('recConflictsTitle1')
          : t('recConflictsTitleN', { n: plan.conflictCount }),
      detail: t('recConflictsDetail'),
      evidence: t('evConflicts', { n: plan.blocks.length }),
      action: { label: t('recResolveConflicts'), to: '/planner' },
    })
  }

  /* --------------------------------------------------- unscheduled backlog -- */
  const dueSoonUnscheduled = open.filter(
    (t) =>
      !t.startDate &&
      t.dueDate &&
      new Date(t.dueDate) >= now &&
      new Date(t.dueDate).getTime() - now.getTime() <= 3 * 86_400_000,
  )
  if (dueSoonUnscheduled.length > 0) {
    out.push({
      id: 'unscheduled_due_soon',
      severity: 'warning',
      title:
        dueSoonUnscheduled.length === 1
          ? t('recDueSoonTitle1')
          : t('recDueSoonTitleN', { n: dueSoonUnscheduled.length }),
      detail: t('recDueSoonDetail'),
      evidence: t('evDueSoon', {
        titles:
          dueSoonUnscheduled.length > 3
            ? t('evDueSoonMore', {
                titles: dueSoonUnscheduled
                  .slice(0, 3)
                  .map((task) => `«${task.title}»`)
                  .join(', '),
                n: dueSoonUnscheduled.length - 3,
              })
            : dueSoonUnscheduled.map((task) => `«${task.title}»`).join(', '),
      }),
      action: { label: t('recPlanThem'), to: '/planner' },
    })
  }

  /* -------------------------------------------------------- estimate bias -- */
  const insights = estimationInsights(snapshot)
  const worst = insights.find((i) => Math.abs(i.biasPercent) >= 25)
  if (worst) {
    const over = worst.biasPercent > 0
    out.push({
      id: `estimation_${worst.projectId}`,
      severity: 'info',
      title: over
        ? t('recBiasUnderTitle', { project: worst.projectName })
        : t('recBiasOverTitle', { project: worst.projectName }),
      detail: over
        ? t('recBiasUnderDetail', { n: worst.biasPercent })
        : t('recBiasOverDetail', { n: Math.abs(worst.biasPercent) }),
      evidence: t('evBias', { ratio: worst.meanRatio, n: worst.samples }),
      action: { label: t('recSeeAnalytics'), to: '/analytics' },
    })
  }

  /* --------------------------------------------------------- consistency -- */
  const last14: DayKey[] = Array.from({ length: 14 }, (_, i) => toDayKey(subDays(now, 13 - i)))
  const range = computeRangeStats(snapshot, last14, now)
  const trend = scoreTrend(range.days)

  if (trend.direction === 'down') {
    out.push({
      id: 'declining_trend',
      severity: 'warning',
      title: t('recDecliningTitle'),
      detail: t('recDecliningDetail'),
      evidence: t('evDeclining', {
        slope: trend.slope,
        n: range.days.filter((d) => !d.noData).length,
        score: range.score,
      }),
      action: { label: t('recOpenAnalytics'), to: '/analytics' },
    })
  } else if (trend.direction === 'up' && range.score >= 70) {
    out.push({
      id: 'improving_trend',
      severity: 'positive',
      title: t('recImprovingTitle'),
      detail: t('recImprovingDetail', { n: range.score }),
      evidence: t('evImproving', { slope: trend.slope, n: range.activeDays }),
    })
  }

  if (range.activeDays <= 7 && range.activeDays > 0) {
    out.push({
      id: 'low_consistency',
      severity: 'info',
      title: t('recLowConsistencyTitle', { n: range.activeDays }),
      detail: t('recLowConsistencyDetail'),
      evidence: t('evLowConsistency', { n: range.activeDays }),
    })
  }

  /* ------------------------------------------------------------ focus gap -- */
  const last7: DayKey[] = Array.from({ length: 7 }, (_, i) => toDayKey(subDays(now, 6 - i)))
  const weekFocus = sum(snapshot.focusSessions.filter((s) => last7.includes(s.day)).map((s) => s.duration))
  const weekTarget = settings.planning.dailyFocusTarget * 7
  if (weekTarget > 0 && weekFocus < weekTarget * 0.4) {
    out.push({
      id: 'focus_gap',
      severity: 'info',
      title: t('recFocusGapTitle'),
      detail: t('recFocusGapDetail', {
        logged: formatDuration(weekFocus),
        target: formatDuration(weekTarget),
      }),
      evidence: t('evFocusGap', {
        logged: formatDuration(weekFocus),
        target: formatDuration(weekTarget),
      }),
      action: { label: t('recStartSession'), to: '/focus' },
    })
  }

  /* --------------------------------------------------------- project risk -- */
  const pStats = projectStatsMap(snapshot, now)
  for (const project of snapshot.projects) {
    const stats = pStats.get(project.id)
    if (!stats || stats.health !== 'off_track') continue
    out.push({
      id: `project_risk_${project.id}`,
      severity: 'critical',
      title: t('recProjectRiskTitle', { project: project.name }),
      detail: project.deadline
        ? t('recProjectRiskDeadline', {
            p: stats.progress,
            date: new Date(project.deadline).toLocaleDateString(intlLocale()),
            rem: formatDuration(stats.remainingEstimateMinutes),
          })
        : t('recProjectRiskPlain', { p: stats.progress, n: stats.overdueTasks }),
      evidence: t('evProjectRisk', {
        done: stats.completedTasks,
        total: stats.totalTasks,
        overdue: stats.overdueTasks,
        rem: formatDuration(stats.remainingEstimateMinutes),
      }),
      action: { label: t('recOpenProject'), to: `/projects/${project.id}` },
    })
  }

  /* ------------------------------------------------------ neglected goals -- */
  const gStats = goalStatsMap(snapshot, now)
  for (const goal of snapshot.goals) {
    if (goal.status !== 'active') continue
    const stats = gStats.get(goal.id)
    if (!stats) continue
    const linkedTaskIds = snapshot.tasks.filter((t) => t.goalId === goal.id).map((t) => t.id)
    const recentActivity = snapshot.tasks.some(
      (t) =>
        linkedTaskIds.includes(t.id) &&
        t.updatedAt &&
        new Date(t.updatedAt).getTime() > now.getTime() - 21 * 86_400_000,
    )
    if (stats.linkedTasks === 0 && stats.linkedProjects === 0) {
      out.push({
        id: `goal_unlinked_${goal.id}`,
        severity: 'info',
        title: t('recGoalUnlinkedTitle', { title: goal.title }),
        detail: t('recGoalUnlinkedDetail'),
        evidence: t('evGoalUnlinked'),
        action: { label: t('recOpenGoal'), to: '/goals' },
      })
    } else if (!recentActivity && !stats.onTrack) {
      out.push({
        id: `goal_neglected_${goal.id}`,
        severity: 'warning',
        title: t('recGoalNeglectedTitle', { title: goal.title }),
        detail:
          stats.daysRemaining != null
            ? t('recGoalNeglectedDays', { p: stats.progress, n: stats.daysRemaining })
            : t('recGoalNeglected', { p: stats.progress }),
        evidence: t('evGoalNeglected', {
          done: stats.completedLinkedTasks,
          total: stats.linkedTasks,
          mdone: stats.completedMilestones,
          mtotal: stats.totalMilestones,
        }),
        action: { label: t('recOpenGoal'), to: '/goals' },
      })
    }
  }

  /* ---------------------------------------------------------- task load -- */
  const workload = dayWorkload(snapshot, today)
  const workloadMinutes = sum(workload.map((t) => effectiveDuration(t, settings.planning)))
  if (workload.length >= 12 || workloadMinutes > settings.planning.dailyCapacityMinutes * 1.5) {
    out.push({
      id: 'excessive_load',
      severity: 'warning',
      title: t('recLoadTitle', { n: workload.length }),
      detail: t('recLoadDetail', {
        work: formatDuration(workloadMinutes),
        cap: formatDuration(settings.planning.dailyCapacityMinutes),
      }),
      evidence: t('evLoad', {
        n: workload.length,
        work: formatDuration(workloadMinutes),
      }),
      action: { label: t('recOpenPlanner'), to: '/planner' },
    })
  }

  /* --------------------------------------------------------- blocked work -- */
  const blocked = open.filter((t) => t.status === 'blocked')
  if (blocked.length >= 3) {
    out.push({
      id: 'blocked_pileup',
      severity: 'info',
      title: t('recBlockedTitle', { n: blocked.length }),
      detail: t('recBlockedDetail'),
      evidence: t('evBlocked', { n: blocked.length }),
      action: { label: t('recViewBlocked'), to: '/tasks?status=blocked' },
    })
  }

  /* ----------------------------------------------------- review cadence -- */
  const yesterday = toDayKey(subDays(now, 1))
  const hasYesterdayReview = snapshot.dailyReviews.some((r) => r.day === yesterday)
  const yesterdayHadWork = dayWorkload(snapshot, yesterday).length > 0
  if (yesterdayHadWork && !hasYesterdayReview) {
    out.push({
      id: 'missing_review',
      severity: 'info',
      title: t('recMissingReviewTitle'),
      detail: t('recMissingReviewDetail'),
      evidence: t('evMissingReview', { n: dayWorkload(snapshot, yesterday).length }),
      action: { label: t('recReviewYesterday'), to: '/reviews' },
    })
  }

  const severityRank: Record<RecommendationSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    positive: 3,
  }
  return out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
}

export const SEVERITY_CLASS: Record<RecommendationSeverity, string> = {
  critical: 'border-rose-500/30 bg-rose-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  info: 'border-sky-500/25 bg-sky-500/5',
  positive: 'border-emerald-500/30 bg-emerald-500/5',
}

export const SEVERITY_TEXT: Record<RecommendationSeverity, string> = {
  critical: 'text-rose-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
  positive: 'text-emerald-400',
}
