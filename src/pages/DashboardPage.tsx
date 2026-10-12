import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flame,
  FolderKanban,
  Inbox,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { subDays } from 'date-fns'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingState,
  PageHeader,
  ProgressBar,
  ScoreRing,
  StatTile,
  toast,
} from '@/components/ui'
import { intlLocale, ratingLabel, useT, type TranslationKey } from '@/i18n'
import { buildDashboardSummary, dayScoreSeries, scoreTrend } from '@/services/analytics'
import { SEVERITY_TEXT, buildRecommendations } from '@/services/recommendations'
import { habitRepo } from '@/storage/habitRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { getPhaseMinutes, useFocusStore } from '@/stores/focusStore'
import { useWorkspace } from '@/stores/workspace'
import type { ID, Task } from '@/types'
import { cn } from '@/utils/cn'
import { dayKeysBetween, formatDuration, formatTimer, todayKey } from '@/utils/date'

/**
 * Dashboard — the answer to "what should I do right now, and how am I doing?".
 *
 * Everything on the page derives from one workspace snapshot, so the numbers can
 * never disagree with each other. All heavy analytics computations are memoized.
 */

const COMPONENT_KEY: Record<string, TranslationKey> = {
  taskCompletion: 'compTaskCompletion',
  priorityCompletion: 'compPriorityCompletion',
  deadlineDiscipline: 'compDeadlineDiscipline',
  timeEfficiency: 'compTimeEfficiency',
  focusTime: 'compFocusTime',
  consistency: 'compConsistency',
}

export function DashboardPage() {
  const t = useT()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const snapshot = useSnapshot()
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

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

  const handleRescheduleAllOverdue = useCallback(async () => {
    if (!memoizedData?.summary.overdue.length) return
    const overdueTasks = memoizedData.summary.overdue
    const today = todayKey()
    await Promise.all(
      overdueTasks.map((task) =>
        taskRepo.update(task.id, {
          startDate: today,
          dueDate: today,
        }),
      ),
    )
    toast.success(t('dashRescheduledSuccess', { n: overdueTasks.length }))
  }, [memoizedData?.summary.overdue, t])

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

  return (
    <>
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
            <Button variant="primary" size="sm" onClick={() => setQuickAddOpen(true)}>
              <Plus className="size-3.5" />
              {t('shellNewTask')}
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------- active focus banner -- */}
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

      {/* ------------------------------------------------------------ score -- */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
        <Card className="flex min-w-0 items-start gap-5 p-5 sm:items-center">
          <ScoreRing
            score={summary.today.score.score}
            rating={summary.today.rating}
            size={112}
            label={t('dashToday')}
          />
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('dashTodaysScore')}
            </div>
            <div className="mt-1 text-lg font-semibold">{ratingLabel(summary.today.rating)}</div>

            {yesterdayDelta != null ? (
              <div
                className={cn(
                  'mt-1 flex items-center gap-1 text-xs',
                  yesterdayDelta > 0
                    ? 'text-emerald-400'
                    : yesterdayDelta < 0
                      ? 'text-rose-400'
                      : 'text-muted-foreground',
                )}
              >
                {yesterdayDelta > 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : yesterdayDelta < 0 ? (
                  <TrendingDown className="size-3.5" />
                ) : null}
                <span>
                  {t('dashVsYesterday', {
                    n: `${yesterdayDelta > 0 ? '+' : ''}${yesterdayDelta}`,
                  })}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">{t('dashNoYesterday')}</div>
            )}

            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="size-3.5 text-amber-400" />
              {t('dashDayStreak', { n: summary.streak.current })}
              <span className="opacity-60">{t('dashStreakBest', { n: summary.streak.longest })}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{t('dashScoreComponents')}</h2>
            <Link
              to="/analytics"
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-accent"
            >
              {t('dashTrend14')}{' '}
              {trend.direction === 'up'
                ? t('trendImproving')
                : trend.direction === 'down'
                  ? t('trendDeclining')
                  : t('trendFlat')}
              <ArrowRight className="size-3 rtl:rotate-180" />
            </Link>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {summary.today.score.components.map((component) => (
              <div key={component.key} className="min-w-0" title={component.explanation}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {t(COMPONENT_KEY[component.key] ?? 'compTaskCompletion')}
                  </span>
                  <span
                    className="inline-flex shrink-0 items-baseline gap-1.5 font-medium tabular-nums"
                    dir="ltr"
                  >
                    <span>{component.value == null ? '—' : Math.round(component.value)}</span>
                    <span className="text-[10px] font-normal text-muted-foreground/70">
                      {component.value == null ? t('dashNa') : `${component.effectiveWeight}%`}
                    </span>
                  </span>
                </div>
                <ProgressBar
                  className="mt-1"
                  height="sm"
                  value={component.value ?? 0}
                  barClassName={component.value == null ? 'bg-muted-foreground/30' : undefined}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ tiles -- */}
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
        <StatTile
          label={t('dashFocusWeek')}
          value={formatDuration(summary.weekFocusMinutes)}
          hint={t('dashWeekScore', { r: ratingLabel(summary.weekRating) })}
          icon={<CalendarDays className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* --------------------------------------------------------- today -- */}
        <Card className="xl:col-span-2">
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
            <div>
              {summary.todayScheduled.map((task) => (
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
          )}
        </Card>

        {/* ----------------------------------------------- recommendations -- */}
        <Card>
          <CardHeader
            title={t('dashRecommendations')}
            description={t('dashFromYourData')}
            icon={<Sparkles className="size-4" />}
          />
          {recommendations.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashAllClear')}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-border">
              {recommendations.map((rec) => (
                <div key={rec.id} className="min-w-0 overflow-hidden p-3.5">
                  <h3 className={cn('break-words text-sm font-medium', SEVERITY_TEXT[rec.severity])}>
                    {rec.title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed break-words text-muted-foreground">
                    {rec.detail}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed break-words text-muted-foreground/70">
                    {rec.evidence}
                  </p>
                  {rec.action ? (
                    <Link
                      to={rec.action.to}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      {rec.action.label}
                      <ArrowRight className="size-3 rtl:rotate-180" />
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- overdue -- */}
        <Card>
          <CardHeader
            title={t('dashOverdue')}
            description={
              summary.overdue.length === 0
                ? t('dashNothingLate')
                : t('dashPastDeadlineN', { n: summary.overdue.length })
            }
            icon={<AlertTriangle className="size-4" />}
            actions={
              summary.overdue.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRescheduleAllOverdue}
                  className="h-7 text-xs"
                >
                  <CalendarDays className="size-3" />
                  {t('dashRescheduleAllToday')}
                </Button>
              ) : undefined
            }
          />
          {summary.overdue.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashDeadlinesAhead')}</p>
            </CardBody>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {summary.overdue.slice(0, 8).map((task) => (
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
          )}
        </Card>

        {/* ------------------------------------------------------ upcoming -- */}
        <Card>
          <CardHeader
            title={t('dashNext7')}
            description={
              summary.upcoming.length === 1
                ? t('dashDeadline1', { n: summary.upcoming.length })
                : t('dashDeadlineN', { n: summary.upcoming.length })
            }
            icon={<CalendarDays className="size-4" />}
          />
          {summary.upcoming.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashNoDeadlinesWeek')}</p>
            </CardBody>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {summary.upcoming.slice(0, 8).map((task) => (
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
          )}
        </Card>

        {/* -------------------------------------------------------- habits -- */}
        <Card>
          <CardHeader
            title={t('dashHabitsToday')}
            description={t('dashHabitsDone', {
              done: summary.habitsToday.filter((h) => h.count >= h.target).length,
              total: summary.habitsToday.length,
            })}
            icon={<Flame className="size-4" />}
            actions={
              <Link to="/habits">
                <Button size="sm" variant="outline">
                  {t('cAll')}
                </Button>
              </Link>
            }
          />
          {summary.habitsToday.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashNoHabits')}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-border">
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
                  <span className="min-w-0 flex-1 truncate text-sm">{habit.title}</span>
                  {target > 1 ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {count}/{target}
                    </span>
                  ) : null}
                  {streak > 0 ? (
                    <span className="shrink-0 text-xs text-muted-foreground">🔥 {streak}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------ projects -- */}
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('dashActiveProjects')}
            description={t('dashInFlight', { n: summary.activeProjects.length })}
            actions={
              <Link to="/projects">
                <Button size="sm" variant="outline">
                  {t('dashAllProjects')}
                </Button>
              </Link>
            }
          />
          {summary.activeProjects.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashNoActiveProjects')}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-border">
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
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="mt-1 block">
                      <ProgressBar value={stats.progress} height="sm" color={project.color} />
                    </span>
                  </span>
                  <span className="w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground" dir="ltr">
                    {Math.round(stats.progress)}%
                  </span>
                  <span className="hidden w-20 shrink-0 text-end text-xs text-muted-foreground sm:block">
                    {t('dashOpenN', { n: stats.openTasks })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* --------------------------------------------------------- goals -- */}
        <Card>
          <CardHeader
            title={t('dashGoals')}
            description={t('dashActiveN', { n: summary.activeGoals.length })}
            actions={
              <Link to="/goals">
                <Button size="sm" variant="outline">
                  {t('cAll')}
                </Button>
              </Link>
            }
          />
          {summary.activeGoals.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('dashNoActiveGoals')}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-border">
              {summary.activeGoals.slice(0, 5).map(({ goal, stats }) => (
                <div key={goal.id} className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: goal.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{goal.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
        </Card>

        {/* --------------------------------------------- daily scratchpad -- */}
        <Card className="xl:col-span-3">
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
      </div>

      <TaskEditorModal
        taskId={editingId}
        open={editingId != null}
        onClose={() => setEditingId(null)}
      />

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </>
  )
}
