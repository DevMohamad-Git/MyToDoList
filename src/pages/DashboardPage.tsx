import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  FileText,
  Flame,
  FolderKanban,
  Inbox,
  Pause,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Square,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, subDays } from 'date-fns'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import { groupTaskList } from '@/components/tasks/taskGrouping'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingState,
  Menu,
  PageHeader,
  ProgressBar,
  ScoreRing,
  StatTile,
  toast,
  type MenuItem,
} from '@/components/ui'
import { CreateProjectModal } from '@/pages/ProjectsPage'
import { CreateGoalModal } from '@/pages/GoalsPage'
import { HabitModal } from '@/pages/HabitsPage'
import { intlLocale, ratingLabel, useT } from '@/i18n'
import { buildDashboardSummary, dayScoreSeries, scoreTrend } from '@/services/analytics'
import { SEVERITY_CLASS, SEVERITY_TEXT, buildRecommendations } from '@/services/recommendations'
import { habitRepo } from '@/storage/habitRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { getPhaseMinutes, useFocusStore } from '@/stores/focusStore'
import { useWorkspace } from '@/stores/workspace'
import type { ID, Task } from '@/types'
import { cn } from '@/utils/cn'
import {
  dayKeysBetween,
  formatDuration,
  formatTimer,
  todayKey,
  toDayKey,
  toPersianDigits,
} from '@/utils/date'
import { formatJalali, toJalaliParts } from '@/utils/jalali'

/**
 * Dashboard — the answer to "what should I do right now, and how am I doing?".
 *
 * Everything on the page derives from one workspace snapshot, so the numbers can
 * never disagree with each other. All heavy analytics computations are memoized.
 */

export function DashboardPage() {
  const t = useT()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const snapshot = useSnapshot()
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)
  const [createHabitOpen, setCreateHabitOpen] = useState(false)
  const [selectedUpcomingDay, setSelectedUpcomingDay] = useState<string | null>(null)

  // Focus store connection
  const focusRunning = useFocusStore((s) => s.running)
  const focusElapsed = useFocusStore((s) => s.elapsedSeconds)
  const focusMode = useFocusStore((s) => s.mode)
  const focusPhase = useFocusStore((s) => s.phase)
  const focusCycle = useFocusStore((s) => s.cycle)
  const focusCountdown = useFocusStore((s) => s.countdownMinutes)
  const focusTaskTitle = useFocusStore((s) => s.taskTitle)
  const startFocus = useFocusStore((s) => s.start)
  const pauseFocus = useFocusStore((s) => s.pause)
  const stopFocus = useFocusStore((s) => s.stop)

  const focusTotal = getPhaseMinutes(focusMode, focusPhase, focusCountdown, workspace.settings.pomodoro) * 60
  const focusRemaining = focusMode === 'stopwatch' ? focusElapsed : Math.max(0, focusTotal - focusElapsed)

  // Daily Scratchpad persisted in localStorage
  const currentTodayKey = todayKey()
  const scratchpadKey = `flowos_scratchpad_${workspace.id}_${currentTodayKey}`
  const [scratchpad, setScratchpad] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(scratchpadKey) ?? ''
  })

  const handleScratchpadChange = useCallback(
    (text: string) => {
      setScratchpad(text)
      if (typeof window !== 'undefined') {
        localStorage.setItem(scratchpadKey, text)
      }
    },
    [scratchpadKey],
  )

  const toggle = useCallback(
    async (task: Task) => {
      const next = await taskRepo.toggleComplete(task.id)
      if (next?.status === 'completed') toast.success(t('toastCompleted', { title: next.title }))
    },
    [t],
  )

  const openEditor = useCallback((task: Task) => setEditingId(task.id), [])

  // Memoized heavy analytics derivation — runs ONLY when snapshot changes
  const memoizedData = useMemo(() => {
    if (!snapshot || (snapshot.tasks.length === 0 && snapshot.projects.length === 0)) {
      return null
    }

    const now = new Date()
    const summary = buildDashboardSummary(snapshot, now)
    const recommendations = buildRecommendations(snapshot, now).slice(0, 4)
    const projectById = new Map(snapshot.projects.map((p) => [p.id, p]))
    const trend = scoreTrend(dayScoreSeries(snapshot, dayKeysBetween(subDays(now, 13), now), now))

    const yesterdayDelta =
      summary.yesterdayScore != null && !summary.today.score.noData
        ? Math.round(summary.today.score.score - summary.yesterdayScore)
        : null

    return {
      now,
      summary,
      recommendations,
      projectById,
      trend,
      yesterdayDelta,
    }
  }, [snapshot])

  // Group today's scheduled tasks by project
  const groupedScheduled = useMemo(() => {
    if (!memoizedData?.summary.todayScheduled || !snapshot?.projects) return []
    return groupTaskList(memoizedData.summary.todayScheduled, 'project', snapshot.projects, t)
  }, [memoizedData?.summary.todayScheduled, snapshot?.projects, t])

  // Enhanced next 7 days model for the calendar strip and grouping
  const upcomingDays = useMemo(() => {
    const list: {
      key: string
      date: Date
      dayName: string
      dayNumber: string
      count: number
      tasks: Task[]
      isTomorrow: boolean
    }[] = []

    const upcomingTasks = memoizedData?.summary.upcoming ?? []
    const baseNow = memoizedData?.now ?? new Date()

    for (let i = 1; i <= 7; i++) {
      const d = addDays(baseNow, i)
      const k = toDayKey(d)
      const dayTasks = upcomingTasks.filter((task) => task.dueDate && toDayKey(task.dueDate) === k)
      const parts = toJalaliParts(d)
      list.push({
        key: k,
        date: d,
        dayName: formatJalali(d, 'EEEE'),
        dayNumber: toPersianDigits(parts.day),
        count: dayTasks.length,
        tasks: dayTasks,
        isTomorrow: i === 1,
      })
    }
    return list
  }, [memoizedData?.summary.upcoming, memoizedData?.now])

  const displayedUpcomingGroups = useMemo(() => {
    if (selectedUpcomingDay) {
      return upcomingDays.filter((d) => d.key === selectedUpcomingDay)
    }
    return upcomingDays.filter((d) => d.tasks.length > 0)
  }, [upcomingDays, selectedUpcomingDay])

  if (!snapshot) return <LoadingState label={t('dashBuilding')} />

  if (snapshot.tasks.length === 0 && snapshot.projects.length === 0) {
    return (
      <>
        <PageHeader
          title={t('dashWelcomeTitle', { name: workspace.name })}
          description={t('dashWelcomeDesc')}
        />
        <EmptyState
          icon={<CheckCircle2 className="size-8 text-accent" />}
          title={t('dashEmptyTitle')}
          description={t('dashEmptyDesc')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
                <Plus className="size-4" />
                {t('shellNewTask')}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/projects')}>
                <FolderKanban className="size-4" />
                {t('dashAllProjects')}
              </Button>
            </div>
          }
        />
        <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      </>
    )
  }

  if (!memoizedData) return null

  const { now, summary, recommendations, projectById, trend, yesterdayDelta } = memoizedData

  const quickActions: MenuItem[] = [
    {
      label: (
        <span className="flex items-center gap-2">
          <CheckSquare className="size-4 text-accent" />
          <span>{t('dashNewTask')}</span>
          <kbd className="ms-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">N</kbd>
        </span>
      ),
      onSelect: () => setQuickAddOpen(true),
    },
    {
      label: (
        <span className="flex items-center gap-2">
          <FolderKanban className="size-4 text-accent" />
          <span>{t('dashNewProject')}</span>
        </span>
      ),
      onSelect: () => setCreateProjectOpen(true),
    },
    {
      label: (
        <span className="flex items-center gap-2">
          <Target className="size-4 text-accent" />
          <span>{t('dashNewGoal')}</span>
        </span>
      ),
      onSelect: () => setCreateGoalOpen(true),
    },
    {
      label: (
        <span className="flex items-center gap-2">
          <Repeat className="size-4 text-accent" />
          <span>{t('dashNewHabit')}</span>
        </span>
      ),
      onSelect: () => setCreateHabitOpen(true),
    },
    {
      separated: true,
      label: (
        <span className="flex items-center gap-2">
          <Timer className="size-4 text-accent" />
          <span>{t('dashStartFocusSession')}</span>
        </span>
      ),
      onSelect: () => {
        if (!focusRunning) {
          startFocus(workspace.id, workspace.settings)
        }
      },
    },
  ]

  return (
    <>
      {/* ----------------------------------------------------------- 1. header -- */}
      <PageHeader
        title={t('dashTitle')}
        description={now.toLocaleDateString(intlLocale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        actions={
          <div className="flex items-center gap-2">
            {!focusRunning && focusElapsed === 0 && (
              <Link to="/focus">
                <Button variant="outline" size="sm">
                  <Timer className="size-3.5" />
                  {t('dashStartFocus')}
                </Button>
              </Link>
            )}
            <Menu
              align="right"
              trigger={
                <Button variant="primary" size="sm" className="gap-1.5 shadow-xs">
                  <Plus className="size-3.5" />
                  <span>{t('dashQuickActions')}</span>
                  <ChevronDown className="size-3 opacity-70" />
                </Button>
              }
              items={quickActions}
            />
          </div>
        }
      />

      {/* ------------------------------------------- 2. active focus banner -- */}
      {(focusRunning || focusElapsed > 0) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 p-4 shadow-sm backdrop-blur transition-all">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm',
                focusRunning ? 'bg-accent animate-pulse' : 'bg-muted-foreground/40',
              )}
            >
              <Timer className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {t('dashActiveFocusSession')}
                </span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {focusPhase === 'work'
                    ? t('focusPhaseWork', { cycle: focusCycle })
                    : focusPhase === 'short_break'
                      ? t('focusPhaseShortBreak')
                      : t('focusPhaseLongBreak')}
                </span>
              </div>
              <div className="mt-0.5 truncate text-sm font-medium">
                {focusTaskTitle || t('focusGeneralSession')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums text-foreground" dir="ltr">
              {formatTimer(focusRemaining)}
            </div>
            <div className="flex items-center gap-1.5">
              {focusRunning ? (
                <Button variant="outline" size="sm" onClick={() => pauseFocus()}>
                  <Pause className="size-3.5" />
                  {t('dashPauseFocus')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => startFocus(workspace.id, workspace.settings)}
                >
                  <Play className="size-3.5" />
                  {t('dashResumeFocus')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void stopFocus(workspace.id, workspace.settings)}
                title={t('dashStopFocus')}
              >
                <Square className="size-3.5" />
                {t('dashStopFocus')}
              </Button>
              <Link to="/focus">
                <Button variant="secondary" size="sm">
                  {t('focusTitle')}
                  <ArrowRight className="size-3.5 rtl:rotate-180" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ 3. tiles -- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label={t('dashOpenTasks')}
          value={summary.taskTotals.open}
          hint={t('dashInInbox', { n: summary.taskTotals.inbox })}
          icon={<Inbox className="size-4" />}
        />
        <StatTile
          label={t('dashOverdue')}
          value={summary.taskTotals.overdue}
          tone={summary.taskTotals.overdue > 0 ? 'danger' : 'default'}
          hint={
            summary.taskTotals.blocked > 0
              ? t('dashBlockedN', { n: summary.taskTotals.blocked })
              : t('dashNothingLate')
          }
          icon={<AlertTriangle className="size-4" />}
        />
        <StatTile
          label={t('dashCompletedToday')}
          value={summary.today.completed.length}
          hint={t('dashOfWorkload', { n: summary.today.workload.length })}
          tone="positive"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatTile
          label={t('dashFocusToday')}
          value={formatDuration(summary.today.focusMinutes)}
          hint={t('dashTarget', { d: formatDuration(workspace.settings.planning.dailyFocusTarget) })}
          tone="accent"
          icon={<Timer className="size-4" />}
        />
        {/* Today's Score Tile - Proportional & Prominent */}
        <Card className="min-w-0 overflow-hidden p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground truncate">
              {t('dashTodaysScore')}
            </span>
            <Link
              to="/analytics"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="size-2.5 text-emerald-500" />
              ) : trend.direction === 'down' ? (
                <TrendingDown className="size-2.5 text-rose-500" />
              ) : null}
              <span>{t('dashTrend14')}</span>
              <ArrowRight className="size-2.5 rtl:rotate-180" />
            </Link>
          </div>

          <div className="my-1 flex items-center gap-3">
            <ScoreRing
              score={summary.today.score.score}
              rating={summary.today.rating}
              size={58}
              strokeWidth={5.5}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-bold text-foreground leading-snug truncate">
                {ratingLabel(summary.today.rating)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {yesterdayDelta != null ? (
                  <span
                    className={cn(
                      'font-medium',
                      yesterdayDelta > 0
                        ? 'text-emerald-500'
                        : yesterdayDelta < 0
                          ? 'text-rose-500'
                          : '',
                    )}
                  >
                    {yesterdayDelta > 0 ? '+' : ''}
                    {toPersianDigits(yesterdayDelta)}{' '}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      نسبت به دیروز
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px]">
                    {t('dashDayStreak', { n: toPersianDigits(summary.streak.current) })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------- 4. quick overview (habits, goals, projects) -- */}
      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title={t('dashQuickOverview')}
          icon={<Sparkles className="size-4" />}
        />
        <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-3 lg:divide-y-0 lg:divide-x lg:rtl:divide-x-reverse">
          {/* Column 1: Habits Today */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="size-4 text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">{t('dashHabitsToday')}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {t('dashHabitsDone', {
                    done: summary.habitsToday.filter((h) => h.count >= h.target).length,
                    total: summary.habitsToday.length,
                  })}
                </span>
              </div>
              <Link to="/habits">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground">
                  {t('cAll')}
                </Button>
              </Link>
            </div>
            {summary.habitsToday.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{t('dashNoHabits')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {summary.habitsToday.map(({ habit, count, target, streak }) => (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => void habitRepo.cycle(workspace.id, habit.id, todayKey(), target)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start transition-colors hover:bg-muted/40 active:scale-[0.99]"
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-transform',
                        count >= target
                          ? 'border-transparent text-white'
                          : 'border-muted-foreground/40',
                      )}
                      style={count >= target ? { backgroundColor: habit.color } : undefined}
                    >
                      {count >= target ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{habit.title}</span>
                    {target > 1 ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {count}/{target}
                      </span>
                    ) : null}
                    {streak > 0 ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">🔥 {streak}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Goals */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Target className="size-4 text-indigo-500 shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">{t('dashGoals')}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {t('dashActiveN', { n: summary.activeGoals.length })}
                </span>
              </div>
              <Link to="/goals">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground">
                  {t('cAll')}
                </Button>
              </Link>
            </div>
            {summary.activeGoals.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{t('dashNoActiveGoals')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {summary.activeGoals.slice(0, 6).map(({ goal, stats }) => (
                  <div key={goal.id} className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: goal.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{goal.title}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                        {Math.round(stats.progress)}%
                      </span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      value={stats.progress}
                      height="sm"
                      color={goal.color}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Active Projects */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban className="size-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">{t('dashActiveProjects')}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {t('dashInFlight', { n: summary.activeProjects.length })}
                </span>
              </div>
              <Link to="/projects">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground">
                  {t('dashAllProjects')}
                </Button>
              </Link>
            </div>
            {summary.activeProjects.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{t('dashNoActiveProjects')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {summary.activeProjects.slice(0, 6).map(({ project, stats }) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{project.name}</span>
                      <span className="mt-1 block">
                        <ProgressBar value={stats.progress} height="sm" color={project.color} />
                      </span>
                    </span>
                    <span className="w-9 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                      {Math.round(stats.progress)}%
                    </span>
                    <span className="hidden w-16 shrink-0 text-end text-[11px] text-muted-foreground sm:block">
                      {t('dashOpenN', { n: stats.openTasks })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ---------------- 5. today's plan [PLACED RIGHT UNDER QUICK OVERVIEW] -- */}
      <Card className="mb-4">
        <CardHeader
          title={t('dashTodaysPlan')}
          description={
            summary.todayScheduled.length === 0
              ? t('dashNothingScheduled')
              : t('dashScheduledN', {
                  n: summary.todayScheduled.length,
                  d: formatDuration(summary.today.scheduledMinutes),
                })
          }
          icon={<CalendarDays className="size-4" />}
          actions={
            <Link to="/planner">
              <Button size="sm" variant="outline">
                {t('dashPlanner')}
              </Button>
            </Link>
          }
        />
        {summary.todayScheduled.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted-foreground">{t('dashNothingOnCalendar')}</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-border/60 max-h-80 sm:max-h-96 overflow-y-auto">
            {groupedScheduled.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/40 backdrop-blur-xs px-3.5 py-2 text-xs font-semibold text-muted-foreground border-b border-border/50">
                  <div className="flex items-center gap-2">
                    {group.color ? (
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                    ) : (
                      <FolderKanban className="size-3.5 text-muted-foreground/70" />
                    )}
                    <span>{group.label}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                    {toPersianDigits(group.count)}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={task.projectId ? projectById.get(task.projectId) : null}
                      onToggle={toggle}
                      onOpen={openEditor}
                      onEdit={openEditor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- 6. recommendations [FULL WIDTH & CLEAN TYPOGRAPHY] -- */}
      <Card className="mb-4">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <span className="font-semibold">{t('dashRecommendations')}</span>
              {recommendations.length > 0 && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent tabular-nums">
                  {toPersianDigits(recommendations.length)}
                </span>
              )}
            </div>
          }
          description={t('dashFromYourData')}
          icon={<Sparkles className="size-4 text-accent" />}
        />
        {recommendations.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted-foreground">{t('dashAllClear')}</p>
          </CardBody>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={cn(
                  'min-w-0 overflow-hidden rounded-xl border p-3.5 transition-colors',
                  SEVERITY_CLASS[rec.severity],
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={cn('break-words text-sm font-semibold', SEVERITY_TEXT[rec.severity])}>
                    {rec.title}
                  </h3>
                  <div className="shrink-0 mt-0.5">
                    {rec.severity === 'critical' ? (
                      <AlertTriangle className="size-3.5 text-rose-400" />
                    ) : rec.severity === 'warning' ? (
                      <AlertTriangle className="size-3.5 text-amber-400" />
                    ) : rec.severity === 'positive' ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <Sparkles className="size-3.5 text-sky-400" />
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs leading-relaxed break-words text-muted-foreground">
                  {rec.detail}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed break-words text-muted-foreground/70">
                  {rec.evidence}
                </p>
                {rec.action && (
                  <Link
                    to={rec.action.to}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    <span>{rec.action.label}</span>
                    <ArrowRight className="size-3 rtl:rotate-180" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- 7. next 7 days [VISUALLY ENHANCED & OVERDUE REMOVED] -- */}
      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title={t('dashNext7')}
          description={
            summary.upcoming.length === 0
              ? t('dashNoDeadlinesWeek')
              : summary.upcoming.length === 1
                ? t('dashDeadline1', { n: toPersianDigits(1) })
                : t('dashDeadlineN', { n: toPersianDigits(summary.upcoming.length) })
          }
          icon={<CalendarDays className="size-4" />}
          actions={
            selectedUpcomingDay && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedUpcomingDay(null)}
              >
                {t('cAll')}
              </Button>
            )
          }
        />

        {/* 7-Day interactive calendar strip */}
        <div className="border-b border-border/70 bg-muted/15 p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {upcomingDays.map((day) => {
              const isSelected = selectedUpcomingDay === day.key
              const hasTasks = day.count > 0
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedUpcomingDay(isSelected ? null : day.key)}
                  className={cn(
                    'group relative flex flex-col items-center justify-center rounded-xl p-2 sm:py-2.5 transition-all text-center',
                    isSelected
                      ? 'bg-accent text-accent-foreground shadow-sm ring-2 ring-accent/30'
                      : hasTasks
                        ? 'bg-card border border-border/80 hover:border-accent/50 hover:bg-muted/40 shadow-2xs'
                        : 'bg-card/40 border border-transparent hover:bg-muted/20 opacity-70 hover:opacity-100',
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] sm:text-[11px] font-medium leading-none',
                      isSelected ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {day.isTomorrow ? t('dTomorrow') : day.dayName}
                  </span>
                  <span
                    className={cn(
                      'mt-1 text-sm sm:text-base font-bold tabular-nums leading-none',
                      isSelected
                        ? 'text-accent-foreground'
                        : hasTasks
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {day.dayNumber}
                  </span>

                  {hasTasks ? (
                    <span
                      className={cn(
                        'mt-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[9px] font-semibold tabular-nums',
                        isSelected
                          ? 'bg-white/20 text-accent-foreground'
                          : 'bg-accent/15 text-accent',
                      )}
                    >
                      {day.dayNumber && toPersianDigits(day.count)}
                    </span>
                  ) : (
                    <span className="mt-1 h-3.5" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Task list grouped by day */}
        {summary.upcoming.length === 0 ? (
          <CardBody className="py-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent mb-3">
              <CalendarDays className="size-6" />
            </div>
            <p className="text-sm font-medium text-foreground">{t('dashNoDeadlinesWeek')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('dashDeadlinesAhead')}</p>
          </CardBody>
        ) : displayedUpcomingGroups.length === 0 ? (
          <CardBody className="py-8 text-center">
            <p className="text-xs text-muted-foreground">{t('dashNothingScheduled')}</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-border/60 max-h-96 overflow-y-auto">
            {displayedUpcomingGroups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/40 backdrop-blur-xs px-3.5 py-2 text-xs font-semibold text-muted-foreground border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-3.5 text-accent" />
                    <span className="text-foreground">{formatJalali(group.date, 'EEEE d MMMM')}</span>
                    {group.isTomorrow && (
                      <span className="rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 text-[10px] font-medium">
                        {t('dTomorrow')}
                      </span>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                    {toPersianDigits(group.count)} {t('dashDeadlineN', { n: '' }).trim()}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={task.projectId ? projectById.get(task.projectId) : null}
                      onToggle={toggle}
                      onOpen={openEditor}
                      onEdit={openEditor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --------------------------------------------- 8. daily scratchpad -- */}
      <Card className="mb-4">
        <CardHeader
          title={t('dashQuickNotes')}
          description={now.toLocaleDateString(intlLocale(), {
            month: 'short',
            day: 'numeric',
          })}
          icon={<FileText className="size-4" />}
        />
        <CardBody className="p-3.5">
          <textarea
            value={scratchpad}
            onChange={(e) => handleScratchpadChange(e.target.value)}
            placeholder={t('dashQuickNotesPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-accent focus:bg-background focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </CardBody>
      </Card>

      <TaskEditorModal
        taskId={editingId}
        open={editingId != null}
        onClose={() => setEditingId(null)}
      />

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
      />

      <CreateGoalModal
        open={createGoalOpen}
        onClose={() => setCreateGoalOpen(false)}
        projects={snapshot?.projects.map((p) => ({ id: p.id, name: p.name })) ?? []}
      />

      <HabitModal
        open={createHabitOpen}
        onClose={() => setCreateHabitOpen(false)}
        habit={null}
      />
    </>
  )
}
