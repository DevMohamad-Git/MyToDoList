import { differenceInCalendarDays, startOfWeek, subDays } from 'date-fns'
import { intlLocale } from '@/i18n'
import { db } from '@/database/db'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { goalStats, projectStats, type ProjectStats } from '@/services/progress'
import {
  bestAndWeakest,
  computeScore,
  ratingFor,
  type Rating,
  type ScoreResult,
  type ScoredTask,
  type ScoringInput,
} from '@/services/scoring'
import { activityStreak, habitStreak } from '@/services/streaks'
import type {
  DailyReview,
  DayKey,
  FocusSession,
  Goal,
  Habit,
  HabitEntry,
  ID,
  Project,
  Task,
  TimeEntry,
  WeekDay,
  Workspace,
  WorkspaceSettings,
} from '@/types'
import { fromDayKey, toDayKey } from '@/utils/date'
import { average, groupBy, ratio, round, sum, toPercent } from '@/utils/math'

/**
 * Analytics layer.
 *
 * Strategy: load the workspace **once** into an in-memory snapshot, then derive
 * everything from pure functions over it. Computing a 30-day trend by issuing 30×N
 * IndexedDB queries is what makes local-first dashboards feel slow; one indexed
 * read plus in-memory grouping stays fast into the tens of thousands of records
 * and keeps every derivation unit-testable without a database.
 */

export interface WorkspaceSnapshot {
  workspaceId: ID
  settings: WorkspaceSettings
  tasks: Task[]
  projects: Project[]
  goals: Goal[]
  habits: Habit[]
  habitEntries: HabitEntry[]
  timeEntries: TimeEntry[]
  focusSessions: FocusSession[]
  dailyReviews: DailyReview[]
  loadedAt: number
}

export async function loadSnapshot(workspace: Workspace): Promise<WorkspaceSnapshot> {
  const id = workspace.id
  const [tasks, projects, goals, habits, habitEntries, timeEntries, focusSessions, dailyReviews] =
    await Promise.all([
      db.tasks.where('workspaceId').equals(id).toArray(),
      db.projects.where('workspaceId').equals(id).toArray(),
      db.goals.where('workspaceId').equals(id).toArray(),
      db.habits.where('workspaceId').equals(id).toArray(),
      db.habitEntries.where('workspaceId').equals(id).toArray(),
      db.timeEntries.where('workspaceId').equals(id).toArray(),
      db.focusSessions.where('workspaceId').equals(id).toArray(),
      db.dailyReviews.where('workspaceId').equals(id).toArray(),
    ])
  return {
    workspaceId: id,
    settings: workspace.settings,
    tasks,
    projects,
    goals,
    habits,
    habitEntries,
    timeEntries,
    focusSessions,
    dailyReviews,
    loadedAt: Date.now(),
  }
}

/* ------------------------------------------------------------------ day -- */

export interface DayStats {
  day: DayKey
  /** Tasks scheduled for, due on, or completed on the day. */
  workload: Task[]
  completed: Task[]
  open: Task[]
  scheduledMinutes: number
  plannedMinutes: number
  actualMinutes: number
  focusMinutes: number
  focusSessions: number
  metDeadlines: number
  missedDeadlines: number
  score: ScoreResult
  rating: Rating
}

/** Everything the day owes attention to: scheduled here, due here, or closed here. */
export function dayWorkload(snapshot: WorkspaceSnapshot, day: DayKey): Task[] {
  const seen = new Set<ID>()
  const out: Task[] = []
  for (const task of snapshot.tasks) {
    if (task.archived || task.parentTaskId) continue
    const scheduledHere = task.startDate && toDayKey(task.startDate) === day
    const dueHere = task.dueDate && toDayKey(task.dueDate) === day
    const completedHere = task.completedAt && toDayKey(task.completedAt) === day
    if ((scheduledHere || dueHere || completedHere) && !seen.has(task.id)) {
      seen.add(task.id)
      out.push(task)
    }
  }
  return out
}

function toScoredTask(task: Task): ScoredTask {
  return {
    priority: task.priority,
    scoreWeight: task.scoreWeight,
    completed: task.status === 'completed',
    onTime: task.dueDate ? Boolean(task.completedAt && task.completedAt <= task.dueDate) : null,
    estimatedMinutes: task.estimatedDuration,
    actualMinutes: task.actualDuration,
  }
}

/** Days on which the user completed a task or logged focus time. */
export function activeDayKeys(snapshot: WorkspaceSnapshot): Set<DayKey> {
  const set = new Set<DayKey>()
  for (const task of snapshot.tasks) {
    if (task.completedAt) set.add(toDayKey(task.completedAt))
  }
  for (const session of snapshot.focusSessions) {
    if (session.duration > 0) set.add(session.day)
  }
  for (const entry of snapshot.timeEntries) {
    if (entry.duration > 0) set.add(entry.day)
  }
  return set
}

export function computeDayStats(
  snapshot: WorkspaceSnapshot,
  day: DayKey,
  now: Date = new Date(),
): DayStats {
  const workload = dayWorkload(snapshot, day)
  const completed = workload.filter((t) => t.status === 'completed')
  const open = workload.filter((t) => !CLOSED_TASK_STATUSES.includes(t.status))

  const settings = snapshot.settings
  const scheduledMinutes = workload
    .filter((t) => t.startDate && toDayKey(t.startDate) === day)
    .reduce((acc, t) => acc + (t.estimatedDuration ?? settings.planning.defaultTaskDuration), 0)
  const plannedMinutes = workload.reduce((acc, t) => acc + (t.estimatedDuration ?? 0), 0)

  const dayEntries = snapshot.timeEntries.filter((e) => e.day === day)
  const actualMinutes = sum(dayEntries.map((e) => e.duration))
  const daySessions = snapshot.focusSessions.filter((s) => s.day === day)
  const focusMinutes = sum(daySessions.map((s) => s.duration))

  // Deadline discipline is judged on deadlines that actually fell due this day.
  const dueToday = snapshot.tasks.filter(
    (t) => !t.archived && t.dueDate && toDayKey(t.dueDate) === day && t.status !== 'cancelled',
  )
  const metDeadlines = dueToday.filter((t) => t.completedAt && t.completedAt <= t.dueDate!).length
  // An open task is only a *missed* deadline once the deadline has actually
  // passed. Counting work still due later today as missed would deflate today's
  // score all morning; those deadlines are simply not judged yet.
  const missedDeadlines = dueToday.filter((t) =>
    t.completedAt ? t.completedAt > t.dueDate! : new Date(t.dueDate!) < now,
  ).length

  const consistencyWindow = 7
  const active = activeDayKeys(snapshot)
  const windowEnd = fromDayKey(day)
  let activeDaysInWindow = 0
  for (let i = 0; i < consistencyWindow; i++) {
    if (active.has(toDayKey(subDays(windowEnd, i)))) activeDaysInWindow++
  }

  const input: ScoringInput = {
    tasks: workload.map(toScoredTask),
    metDeadlines,
    missedDeadlines,
    focusMinutes,
    focusTarget: settings.planning.dailyFocusTarget,
    plannedMinutes,
    actualMinutes,
    activeDaysInWindow,
    consistencyWindow,
    weights: settings.scoring.weights,
  }

  const score = computeScore(input)
  return {
    day,
    workload,
    completed,
    open,
    scheduledMinutes,
    plannedMinutes,
    actualMinutes,
    focusMinutes,
    focusSessions: daySessions.length,
    metDeadlines,
    missedDeadlines,
    score,
    rating: score.noData ? 'No Data' : ratingFor(score.score, settings.scoring.thresholds),
  }
}

/* ----------------------------------------------------------------- range -- */

export interface DayPoint {
  day: DayKey
  label: string
  score: number
  noData: boolean
  completed: number
  planned: number
  focusMinutes: number
  actualMinutes: number
}

export function dayScoreSeries(
  snapshot: WorkspaceSnapshot,
  days: DayKey[],
  now: Date = new Date(),
): DayPoint[] {
  return days.map((day) => {
    const stats = computeDayStats(snapshot, day, now)
    return {
      day,
      label: fromDayKey(day).toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric' }),
      score: stats.score.score,
      noData: stats.score.noData,
      completed: stats.completed.length,
      planned: stats.workload.length,
      focusMinutes: stats.focusMinutes,
      actualMinutes: stats.actualMinutes,
    }
  })
}

export interface RangeStats {
  startDay: DayKey
  endDay: DayKey
  days: DayPoint[]
  /** Mean of days that had data. */
  score: number
  rating: Rating
  plannedTasks: number
  completedTasks: number
  completionRate: number
  focusMinutes: number
  actualMinutes: number
  estimatedMinutes: number
  metDeadlines: number
  missedDeadlines: number
  deadlineDiscipline: number
  /** Mean `actual / estimated` on completed work; 1 = perfect estimates. */
  estimateAccuracy: number | null
  bestDay: DayPoint | null
  weakestDay: DayPoint | null
  activeDays: number
  consistency: number
  focusSessions: number
}

export function computeRangeStats(
  snapshot: WorkspaceSnapshot,
  dayKeys: DayKey[],
  now: Date = new Date(),
): RangeStats {
  const days = dayScoreSeries(snapshot, dayKeys, now)
  const withData = days.filter((d) => !d.noData)

  const startDay = dayKeys[0] ?? toDayKey(now)
  const endDay = dayKeys[dayKeys.length - 1] ?? startDay
  const inRange = (day: DayKey) => day >= startDay && day <= endDay

  const workloadIds = new Set<ID>()
  for (const day of dayKeys) {
    for (const task of dayWorkload(snapshot, day)) workloadIds.add(task.id)
  }
  const workload = snapshot.tasks.filter((t) => workloadIds.has(t.id))
  const completedTasks = workload.filter((t) => t.status === 'completed').length

  const dueInRange = snapshot.tasks.filter(
    (t) => !t.archived && t.dueDate && inRange(toDayKey(t.dueDate)) && t.status !== 'cancelled',
  )
  const metDeadlines = dueInRange.filter((t) => t.completedAt && t.completedAt <= t.dueDate!).length
  // Same rule as `computeDayStats`: a deadline that has not yet arrived is not a miss.
  const missedDeadlines = dueInRange.filter((t) =>
    t.completedAt ? t.completedAt > t.dueDate! : new Date(t.dueDate!) < now,
  ).length

  const focusMinutes = sum(snapshot.focusSessions.filter((s) => inRange(s.day)).map((s) => s.duration))
  const focusSessions = snapshot.focusSessions.filter((s) => inRange(s.day) && s.duration > 0).length
  const actualMinutes = sum(snapshot.timeEntries.filter((e) => inRange(e.day)).map((e) => e.duration))
  const estimatedMinutes = sum(workload.map((t) => t.estimatedDuration ?? 0))

  const comparable = workload.filter(
    (t) => t.status === 'completed' && (t.estimatedDuration ?? 0) > 0 && t.actualDuration > 0,
  )
  const estimateAccuracy = comparable.length
    ? round(average(comparable.map((t) => t.actualDuration / (t.estimatedDuration as number))), 2)
    : null

  const active = activeDayKeys(snapshot)
  const activeDays = dayKeys.filter((d) => active.has(d)).length

  const { best, weakest } = bestAndWeakest(
    days.map((d) => ({ day: d.day, score: d.score, noData: d.noData })),
  )
  const score = withData.length ? toPercent(average(withData.map((d) => d.score))) : 0

  return {
    startDay,
    endDay,
    days,
    score,
    rating: withData.length ? ratingFor(score, snapshot.settings.scoring.thresholds) : 'No Data',
    plannedTasks: workload.length,
    completedTasks,
    completionRate: toPercent(ratio(completedTasks, workload.length) * 100),
    focusMinutes,
    actualMinutes,
    estimatedMinutes,
    metDeadlines,
    missedDeadlines,
    deadlineDiscipline: toPercent(ratio(metDeadlines, metDeadlines + missedDeadlines) * 100),
    estimateAccuracy,
    bestDay: best ? (days.find((d) => d.day === best.day) ?? null) : null,
    weakestDay: weakest ? (days.find((d) => d.day === weakest.day) ?? null) : null,
    activeDays,
    consistency: toPercent(ratio(activeDays, dayKeys.length) * 100),
    focusSessions,
  }
}

/* ------------------------------------------------------------ distribution -- */

export interface TimeSlice {
  id: ID | 'unassigned'
  name: string
  color: string
  minutes: number
  percent: number
}

/** Where tracked time went, grouped by project. Feeds the analytics donut. */
export function timeByProject(
  snapshot: WorkspaceSnapshot,
  startDay: DayKey,
  endDay: DayKey,
): TimeSlice[] {
  const entries = snapshot.timeEntries.filter((e) => e.day >= startDay && e.day <= endDay)
  const total = sum(entries.map((e) => e.duration))
  if (total === 0) return []

  const grouped = groupBy(entries, (e) => e.projectId ?? 'unassigned')
  const projectById = new Map(snapshot.projects.map((p) => [p.id, p]))

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const minutes = sum(group.map((g) => g.duration))
      const project = key === 'unassigned' ? null : projectById.get(key as ID)
      return {
        id: (key as ID) ?? 'unassigned',
        name: project?.name ?? 'No project',
        color: project?.color ?? '#64748b',
        minutes,
        percent: toPercent(ratio(minutes, total) * 100),
      }
    })
    .sort((a, b) => b.minutes - a.minutes)
}

export interface TagSlice {
  tag: string
  count: number
  completed: number
}

export function tasksByTag(snapshot: WorkspaceSnapshot): TagSlice[] {
  const map = new Map<string, { count: number; completed: number }>()
  for (const task of snapshot.tasks) {
    if (task.archived) continue
    for (const tag of task.tags) {
      const entry = map.get(tag) ?? { count: 0, completed: 0 }
      entry.count++
      if (task.status === 'completed') entry.completed++
      map.set(tag, entry)
    }
  }
  return Array.from(map.entries())
    .map(([tag, v]) => ({ tag, ...v }))
    .sort((a, b) => b.count - a.count)
}

/** Focus minutes by hour of day — reveals when the user actually does deep work. */
export function focusByHour(snapshot: WorkspaceSnapshot, startDay: DayKey, endDay: DayKey) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, minutes: 0 }))
  for (const session of snapshot.focusSessions) {
    if (session.day < startDay || session.day > endDay) continue
    const hour = new Date(session.startTime).getHours()
    buckets[hour].minutes += session.duration
  }
  return buckets
}

/** Completion counts by weekday — reveals the user's strongest days. */
export function completionByWeekday(snapshot: WorkspaceSnapshot) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const buckets = names.map((label, index) => ({ index, label, completed: 0, focusMinutes: 0 }))
  for (const task of snapshot.tasks) {
    if (!task.completedAt) continue
    buckets[new Date(task.completedAt).getDay()].completed++
  }
  for (const session of snapshot.focusSessions) {
    buckets[fromDayKey(session.day).getDay()].focusMinutes += session.duration
  }
  return buckets
}

/* --------------------------------------------------------- entity rollups -- */

export function projectStatsMap(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date(),
): Map<ID, ProjectStats> {
  const minutesByProject = new Map<ID, number>()
  for (const entry of snapshot.timeEntries) {
    if (!entry.projectId) continue
    minutesByProject.set(entry.projectId, (minutesByProject.get(entry.projectId) ?? 0) + entry.duration)
  }
  const map = new Map<ID, ProjectStats>()
  for (const project of snapshot.projects) {
    map.set(project.id, projectStats(project, snapshot.tasks, minutesByProject.get(project.id) ?? 0, now))
  }
  return map
}

export function goalStatsMap(snapshot: WorkspaceSnapshot, now: Date = new Date()) {
  const projectProgress = new Map<ID, number>()
  for (const [id, stats] of projectStatsMap(snapshot, now)) projectProgress.set(id, stats.progress)
  const map = new Map<ID, ReturnType<typeof goalStats>>()
  for (const goal of snapshot.goals) {
    map.set(goal.id, goalStats(goal, snapshot.projects, snapshot.tasks, projectProgress, now))
  }
  return map
}

export function habitStatsMap(snapshot: WorkspaceSnapshot, now: Date = new Date()) {
  const map = new Map<ID, ReturnType<typeof habitStreak>>()
  for (const habit of snapshot.habits) {
    map.set(
      habit.id,
      habitStreak(habit, snapshot.habitEntries, now, snapshot.settings.planning.weekStartsOn),
    )
  }
  return map
}

/* --------------------------------------------------------------- overview -- */

export interface DashboardSummary {
  today: DayStats
  streak: { current: number; longest: number }
  overdue: Task[]
  upcoming: Task[]
  todayScheduled: Task[]
  activeProjects: { project: Project; stats: ProjectStats }[]
  activeGoals: { goal: Goal; stats: ReturnType<typeof goalStats> }[]
  habitsToday: { habit: Habit; count: number; target: number; streak: number }[]
  weekFocusMinutes: number
  weekScore: number
  weekRating: Rating
  yesterdayScore: number | null
  taskTotals: { open: number; completed: number; overdue: number; blocked: number; inbox: number }
}

export function buildDashboardSummary(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date(),
): DashboardSummary {
  const today = toDayKey(now)
  const todayStats = computeDayStats(snapshot, today, now)

  const open = snapshot.tasks.filter((t) => !t.archived && !CLOSED_TASK_STATUSES.includes(t.status))
  const overdue = open
    .filter((t) => t.dueDate && new Date(t.dueDate) < now)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

  const horizon = new Date(now.getTime() + 7 * 86_400_000)
  const upcoming = open
    .filter((t) => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= horizon)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

  const todayScheduled = snapshot.tasks
    .filter((t) => !t.archived && t.startDate && toDayKey(t.startDate) === today)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))

  const pStats = projectStatsMap(snapshot, now)
  const activeProjects = snapshot.projects
    .filter((p) => p.status === 'active' || p.status === 'planning')
    .map((project) => ({ project, stats: pStats.get(project.id)! }))
    .sort((a, b) => b.stats.progress - a.stats.progress)

  const gStats = goalStatsMap(snapshot, now)
  const activeGoals = snapshot.goals
    .filter((g) => g.status === 'active')
    .map((goal) => ({ goal, stats: gStats.get(goal.id)! }))

  const hStats = habitStatsMap(snapshot, now)
  const habitsToday = snapshot.habits
    .filter((h) => !h.archived)
    .map((habit) => ({
      habit,
      count: sum(
        snapshot.habitEntries.filter((e) => e.habitId === habit.id && e.day === today).map((e) => e.count),
      ),
      target: habit.target,
      streak: hStats.get(habit.id)?.current ?? 0,
    }))

  const weekStart = startOfWeek(now, { weekStartsOn: snapshot.settings.planning.weekStartsOn as WeekDay })
  const weekDayKeys: DayKey[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    if (d > now) break
    weekDayKeys.push(toDayKey(d))
  }
  const weekStats = computeRangeStats(snapshot, weekDayKeys.length ? weekDayKeys : [today], now)

  const yesterday = toDayKey(subDays(now, 1))
  const yesterdayStats = computeDayStats(snapshot, yesterday, now)

  return {
    today: todayStats,
    streak: activityStreak(activeDayKeys(snapshot), now),
    overdue,
    upcoming,
    todayScheduled,
    activeProjects,
    activeGoals,
    habitsToday,
    weekFocusMinutes: weekStats.focusMinutes,
    weekScore: weekStats.score,
    weekRating: weekStats.rating,
    yesterdayScore: yesterdayStats.score.noData ? null : yesterdayStats.score.score,
    taskTotals: {
      open: open.filter((t) => !t.parentTaskId).length,
      completed: snapshot.tasks.filter((t) => t.status === 'completed').length,
      overdue: overdue.length,
      blocked: open.filter((t) => t.status === 'blocked').length,
      inbox: open.filter((t) => t.status === 'inbox' && !t.parentTaskId).length,
    },
  }
}

/** Where the user consistently mis-estimates, grouped by project. */
export interface EstimationInsight {
  projectId: ID | 'unassigned'
  projectName: string
  samples: number
  meanRatio: number
  /** Positive = takes longer than estimated. */
  biasPercent: number
}

export function estimationInsights(snapshot: WorkspaceSnapshot): EstimationInsight[] {
  const comparable = snapshot.tasks.filter(
    (t) => t.status === 'completed' && (t.estimatedDuration ?? 0) > 0 && t.actualDuration > 0,
  )
  const grouped = groupBy(comparable, (t) => t.projectId ?? 'unassigned')
  const projectById = new Map(snapshot.projects.map((p) => [p.id, p]))

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const meanRatio = average(group.map((t) => t.actualDuration / (t.estimatedDuration as number)))
      return {
        projectId: key as ID | 'unassigned',
        projectName: key === 'unassigned' ? 'No project' : (projectById.get(key as ID)?.name ?? 'Deleted project'),
        samples: group.length,
        meanRatio: round(meanRatio, 2),
        biasPercent: Math.round((meanRatio - 1) * 100),
      }
    })
    .filter((i) => i.samples >= 2)
    .sort((a, b) => Math.abs(b.biasPercent) - Math.abs(a.biasPercent))
}

/** Simple linear trend over a score series: positive = improving. */
export function scoreTrend(points: DayPoint[]): { slope: number; direction: 'up' | 'down' | 'flat' } {
  const scored = points.filter((p) => !p.noData)
  if (scored.length < 3) return { slope: 0, direction: 'flat' }
  const xs = scored.map((_, i) => i)
  const ys = scored.map((p) => p.score)
  const meanX = average(xs)
  const meanY = average(ys)
  const numerator = sum(xs.map((x, i) => (x - meanX) * (ys[i] - meanY)))
  const denominator = sum(xs.map((x) => (x - meanX) ** 2))
  const slope = denominator === 0 ? 0 : numerator / denominator
  return {
    slope: round(slope, 2),
    direction: slope > 0.4 ? 'up' : slope < -0.4 ? 'down' : 'flat',
  }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return differenceInCalendarDays(now, new Date(iso))
}
