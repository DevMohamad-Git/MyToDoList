import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Inbox,
  ListTodo,
  Save,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  JalaliDatePicker,
  LoadingState,
  PageHeader,
  PriorityBadge,
  ScoreLabel,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { computeDayStats, computeRangeStats, type DayPoint } from '@/services/analytics'
import { ratingFor } from '@/services/scoring'
import { reviewRepo } from '@/storage/reviewRepo'
import { taskRepo } from '@/storage/taskRepo'
import { db } from '@/database/db'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import { useT } from '@/i18n'
import type { DailyReview, DayKey, Task, WeeklyReview } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration, fromDayKey, toDayKey, addDays } from '@/utils/date'
import { startOfWeek as startOfWeekFns } from 'date-fns'

/**
 * Reviews: a comprehensive daily & weekly reflection engine.
 *
 * Senior architecture upgrades:
 * 1. Performance: Eliminates duplicate useSnapshot calls; uses memoized derived statistics.
 * 2. Form state isolation: Prevents live-query updates from wiping in-progress typing.
 * 3. Interactive Task Breakdown: Shows completed wins & open tasks with quick move/done actions.
 * 4. Habits & Mood Insight: Correlates subjective ratings with objective metrics.
 * 5. Full Week Navigator & 7-Day Trend Visualizer: Visual chart of the entire week.
 * 6. AI Executive Weekly Synthesis: Generates structured weekly retrospectives.
 * 7. Past Review Interaction: Clickable history rows and Markdown export.
 * 8. Comprehensive i18n & keyboard shortcuts: Ctrl+Enter to save, Alt+Arrows to navigate.
 */
export function ReviewsPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()
  const settings = useSettings()

  const [tab, setTab] = useState<'daily' | 'weekly'>('daily')
  const [day, setDay] = useState(() => toDayKey(new Date()))

  const currentWeekStart = useMemo(
    () => toDayKey(startOfWeekFns(new Date(), { weekStartsOn: settings.planning.weekStartsOn })),
    [settings.planning.weekStartsOn],
  )

  const [weekStartDay, setWeekStartDay] = useState(currentWeekStart)

  const allDaily = useLiveQuery(() => reviewRepo.allDaily(workspaceId), [workspaceId]) ?? []
  const allWeekly = useLiveQuery(() => reviewRepo.allWeekly(workspaceId), [workspaceId]) ?? []

  const existingDaily = useMemo(
    () => allDaily.find((r) => r.day === day),
    [allDaily, day],
  )

  const existingWeekly = useMemo(
    () => allWeekly.find((r) => r.weekStart === weekStartDay),
    [allWeekly, weekStartDay],
  )

  // Global keyboard shortcuts: Alt+Left / Alt+Right for fast navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (tab === 'daily') {
          setDay((prev) => toDayKey(addDays(fromDayKey(prev), -1)))
        } else {
          setWeekStartDay((prev) => toDayKey(addDays(fromDayKey(prev), -7)))
        }
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const todayStr = toDayKey(new Date())
        if (tab === 'daily') {
          setDay((prev) => (prev < todayStr ? toDayKey(addDays(fromDayKey(prev), 1)) : prev))
        } else {
          setWeekStartDay((prev) => (prev < currentWeekStart ? toDayKey(addDays(fromDayKey(prev), 7)) : prev))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tab, currentWeekStart])

  return (
    <>
      <PageHeader
        title={t('reviewsTitle')}
        description={t('reviewsDesc')}
        actions={
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              aria-pressed={tab === 'daily'}
              onClick={() => setTab('daily')}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                tab === 'daily'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('reviewsTabDaily')}
            </button>
            <button
              type="button"
              aria-pressed={tab === 'weekly'}
              onClick={() => setTab('weekly')}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                tab === 'weekly'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('reviewsTabWeekly')}
            </button>
          </div>
        }
      />

      {!snapshot ? (
        <LoadingState label={t('cLoading')} />
      ) : (
        <div className="flex flex-col gap-6">
          {tab === 'daily' ? (
            <DailyReviewPanel
              day={day}
              setDay={setDay}
              existing={existingDaily}
              snapshot={snapshot}
            />
          ) : (
            <WeeklyReviewPanel
              weekStartDay={weekStartDay}
              setWeekStartDay={setWeekStartDay}
              currentWeekStart={currentWeekStart}
              existing={existingWeekly}
              snapshot={snapshot}
            />
          )}

          <ReviewHistory
            daily={allDaily}
            weekly={allWeekly}
            onSelectDaily={(d) => {
              setDay(d)
              setTab('daily')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onSelectWeekly={(w) => {
              setWeekStartDay(w)
              setTab('weekly')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>
      )}
    </>
  )
}

/* ==========================================================================
   DAILY REVIEW PANEL
   ========================================================================== */

function DailyReviewPanel({
  day,
  setDay,
  existing,
  snapshot,
}: {
  day: DayKey
  setDay: (d: DayKey) => void
  existing: DailyReview | undefined
  snapshot: NonNullable<ReturnType<typeof useSnapshot>>
}) {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const now = useMemo(() => new Date(), [])

  const dayStats = useMemo(
    () => computeDayStats(snapshot, day, now),
    [snapshot, day, now],
  )

  // Local form state isolated per day to prevent background sync clobbering
  const [selfRating, setSelfRating] = useState<number | null>(existing?.selfRating ?? null)
  const [wentWell, setWentWell] = useState(existing?.wentWell ?? '')
  const [blockers, setBlockers] = useState(existing?.blockers ?? '')
  const [improve, setImprove] = useState(existing?.improve ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [isDirty, setIsDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'idle'>(
    existing ? 'saved' : 'idle',
  )

  // When selected day changes, reset to that day's existing review
  useEffect(() => {
    setSelfRating(existing?.selfRating ?? null)
    setWentWell(existing?.wentWell ?? '')
    setBlockers(existing?.blockers ?? '')
    setImprove(existing?.improve ?? '')
    setNotes(existing?.notes ?? '')
    setIsDirty(false)
    setSaveStatus(existing ? 'saved' : 'idle')
  }, [day])

  // When existing review arrives from Dexie, update inputs only if user has not typed yet
  useEffect(() => {
    if (!isDirty && existing) {
      setSelfRating(existing.selfRating ?? null)
      setWentWell(existing.wentWell ?? '')
      setBlockers(existing.blockers ?? '')
      setImprove(existing.improve ?? '')
      setNotes(existing.notes ?? '')
      setSaveStatus('saved')
    }
  }, [existing, isDirty])

  // Habits query for this day
  const habits = useLiveQuery(() => db.habits.where('workspaceId').equals(workspaceId).toArray(), [workspaceId]) ?? []
  const habitEntries = useLiveQuery(
    () => db.habitEntries.where('[workspaceId+day]').equals([workspaceId, day]).toArray(),
    [workspaceId, day],
  ) ?? []

  const completedHabitIds = useMemo(
    () => new Set(habitEntries.filter((e) => e.count > 0).map((e) => e.habitId)),
    [habitEntries],
  )

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits])

  const save = useCallback(async () => {
    if (!dayStats) return
    setBusy(true)
    setSaveStatus('saving')
    try {
      await reviewRepo.saveDaily(workspaceId, day, {
        score: dayStats.score.noData ? 0 : Math.round(dayStats.score.score),
        completedTaskIds: dayStats.completed.map((t) => t.id),
        incompleteTaskIds: dayStats.open.map((t) => t.id),
        selfRating,
        wentWell,
        blockers,
        improve,
        notes,
      })
      setIsDirty(false)
      setSaveStatus('saved')
      toast.success(t('reviewsToastSaved', { day: formatDayLabel(day) }))
    } catch (error) {
      setSaveStatus('unsaved')
      toast.error((error as Error).message || 'Could not save the review')
    } finally {
      setBusy(false)
    }
  }, [dayStats, workspaceId, day, selfRating, wentWell, blockers, improve, notes, t])

  // Debounced auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!isDirty) return
    setSaveStatus('unsaved')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      void save()
    }, 2500)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [isDirty, save])

  // Ctrl+Enter shortcut to save
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }

  // Export report to markdown
  const handleExportMarkdown = () => {
    const lines = [
      `# ${t('reviewsDailyReflectionTitle')} · ${formatDayLabel(day)}`,
      `- **${t('reviewsStatPlanned')}:** ${dayStats.workload.length}`,
      `- **${t('reviewsStatCompleted')}:** ${dayStats.completed.length}`,
      `- **${t('reviewsStatDeadlines')}:** ${dayStats.metDeadlines}/${dayStats.metDeadlines + dayStats.missedDeadlines}`,
      `- **${t('reviewsStatFocus')}:** ${formatDuration(dayStats.focusMinutes)}`,
      `- **${t('analyticsDailyScoreTitle')}:** ${Math.round(dayStats.score.score)}/100`,
      selfRating ? `- **${t('reviewsSelfRatingLabel')}** ${selfRating}/5` : '',
      '',
      `## ${t('reviewsWhatWentWell')}`,
      wentWell || '—',
      '',
      `## ${t('reviewsBlockers')}`,
      blockers || '—',
      '',
      `## ${t('reviewsImprove')}`,
      improve || '—',
      '',
      `## ${t('reviewsNotes')}`,
      notes || '—',
    ].filter(Boolean)

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success(t('reviewsExportCopied'))
    })
  }

  // Quick task actions
  const handleMoveToTomorrow = async (task: Task) => {
    const nextDay = toDayKey(addDays(fromDayKey(day), 1))
    await taskRepo.update(task.id, {
      startDate: nextDay,
      dueDate: task.dueDate && toDayKey(task.dueDate) === day ? nextDay : task.dueDate,
    })
    toast.success(t('reviewsToastTaskUpdated'))
  }

  const handleToBacklog = async (task: Task) => {
    await taskRepo.update(task.id, { startDate: undefined })
    toast.success(t('reviewsToastTaskUpdated'))
  }

  const handleMarkDone = async (task: Task) => {
    await taskRepo.setStatus(task.id, 'completed')
    toast.success(t('reviewsToastTaskUpdated'))
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      {/* Date Navigation & Status Bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DayNav day={day} setDay={setDay} />
            <span className="text-sm font-semibold">{formatDayLabel(day)}</span>
            {saveStatus === 'saved' ? (
              <Badge className="text-emerald-500 border-emerald-500/30">
                <Check className="size-3 me-1" />
                {t('reviewsSavedBadge')}
              </Badge>
            ) : saveStatus === 'saving' ? (
              <Badge className="text-sky-500 border-sky-500/30">
                {t('reviewsSaving')}
              </Badge>
            ) : isDirty ? (
              <Badge className="text-amber-500 border-amber-500/30">
                {t('reviewsUnsavedChanges')}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {dayStats && !dayStats.score.noData ? (
              <ScoreLabel
                score={dayStats.score.score}
                rating={ratingFor(dayStats.score.score, snapshot.settings.scoring.thresholds)}
              />
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleExportMarkdown} title={t('reviewsExportMarkdown')}>
              <Copy className="size-3.5 me-1" />
              {t('reviewsExportMarkdown')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Real-time Stats Grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label={t('reviewsStatPlanned')}
          value={dayStats.workload.length}
        />
        <StatTile
          label={t('reviewsStatCompleted')}
          value={dayStats.completed.length}
          tone="positive"
          hint={t('reviewsStatOpenHint', { count: dayStats.open.length })}
        />
        <StatTile
          label={t('reviewsStatDeadlines')}
          value={`${dayStats.metDeadlines} / ${dayStats.metDeadlines + dayStats.missedDeadlines}`}
          hint={t('reviewsStatDeadlinesHint', {
            met: dayStats.metDeadlines,
            total: dayStats.metDeadlines + dayStats.missedDeadlines,
          })}
          tone={dayStats.missedDeadlines > 0 ? 'warning' : 'positive'}
        />
        <StatTile
          label={t('reviewsStatFocus')}
          value={formatDuration(dayStats.focusMinutes)}
          hint={t('reviewsStatFocusHint', { sessions: dayStats.focusSessions })}
          tone="accent"
        />
      </div>

      {/* Mood vs Reality Psychological Insight */}
      {selfRating !== null && dayStats && !dayStats.score.noData && (
        <>
          {selfRating <= 2 && dayStats.score.score >= 70 && (
            <div className="flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-sm text-sky-400">
              <Sparkles className="size-5 shrink-0" />
              <span>{t('reviewsMoodInsightHighReality', { score: Math.round(dayStats.score.score) })}</span>
            </div>
          )}
          {selfRating >= 4 && dayStats.score.score < 50 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-400">
              <Zap className="size-5 shrink-0" />
              <span>{t('reviewsMoodInsightOptimistic')}</span>
            </div>
          )}
          {selfRating >= 4 && dayStats.score.score >= 75 && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-400">
              <Trophy className="size-5 shrink-0" />
              <span>{t('reviewsMoodInsightAligned')}</span>
            </div>
          )}
        </>
      )}

      {/* Interactive Task Breakdown (Solves Blind Review) */}
      <Card>
        <CardHeader
          title={t('reviewsTasksBreakdownTitle')}
          icon={<ListTodo className="size-4" />}
          actions={
            <div className="text-xs text-muted-foreground">
              {dayStats.completed.length} / {dayStats.workload.length} {t('stCompleted')}
            </div>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {/* Completed Wins */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
              {t('reviewsTasksCompletedTitle', { count: dayStats.completed.length })}
            </h4>
            {dayStats.completed.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {t('focusTodaySessionsEmpty')}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {dayStats.completed.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <span className="truncate text-sm font-medium line-through text-muted-foreground">
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityBadge priority={task.priority} />
                      {task.actualDuration ? (
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDuration(task.actualDuration, { compact: true })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open / Carried Over Tasks */}
          {dayStats.open.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
                {t('reviewsTasksOpenTitle', { count: dayStats.open.length })}
              </h4>
              <div className="divide-y divide-border rounded-lg border border-border">
                {dayStats.open.map((task) => (
                  <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                      <span className="truncate text-sm font-medium">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void handleMoveToTomorrow(task)}
                      >
                        <ArrowRight className="size-3 me-1 rtl:rotate-180" />
                        {t('reviewsTaskMoveTomorrow')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void handleToBacklog(task)}
                      >
                        <Inbox className="size-3 me-1" />
                        {t('reviewsTaskToBacklog')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-emerald-500 hover:text-emerald-400"
                        onClick={() => void handleMarkDone(task)}
                      >
                        <Check className="size-3 me-1" />
                        {t('reviewsTaskMarkDone')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Habits Consistency */}
          {activeHabits.length > 0 && (
            <div className="mt-2 rounded-lg bg-muted/30 p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Flame className="size-3.5 text-amber-500" />
                  {t('reviewsHabitsTitle')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('reviewsHabitsCompleted', {
                    completed: completedHabitIds.size,
                    total: activeHabits.length,
                  })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeHabits.map((habit) => {
                  const done = completedHabitIds.has(habit.id)
                  return (
                    <Badge
                      key={habit.id}
                      className={cn(
                        'text-xs py-0.5',
                        done ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground',
                      )}
                    >
                      {done ? '✓ ' : '○ '}
                      {habit.title}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Reflection Form */}
      <Card>
        <CardHeader
          title={t('reviewsDailyReflectionTitle')}
          description={saveStatus === 'saved' ? t('reviewsSavedBadge') : t('reviewsUnsavedChanges')}
          icon={<Sparkles className="size-4 text-accent" />}
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              disabled={busy}
            >
              <Save className="size-3.5" />
              {busy ? t('reviewsSaving') : t('reviewsSaveButton')}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Field label={t('reviewsSelfRatingLabel')}>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n}`}
                  aria-pressed={selfRating === n}
                  onClick={() => {
                    setSelfRating(n === selfRating ? null : n)
                    setIsDirty(true)
                  }}
                  className={cn(
                    'size-10 rounded-xl border text-base font-bold transition-all shadow-sm',
                    selfRating === n
                      ? 'border-accent bg-accent text-accent-foreground scale-105 shadow-md shadow-accent/20'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('reviewsWhatWentWell')}>
            <Textarea
              value={wentWell}
              placeholder={t('reviewsWhatWentWellPlaceholder')}
              onChange={(e) => {
                setWentWell(e.target.value)
                setIsDirty(true)
              }}
              rows={3}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('reviewsBlockers')}>
              <Textarea
                value={blockers}
                placeholder={t('reviewsBlockersPlaceholder')}
                onChange={(e) => {
                  setBlockers(e.target.value)
                  setIsDirty(true)
                }}
                rows={3}
              />
            </Field>

            <Field label={t('reviewsImprove')}>
              <Textarea
                value={improve}
                placeholder={t('reviewsImprovePlaceholder')}
                onChange={(e) => {
                  setImprove(e.target.value)
                  setIsDirty(true)
                }}
                rows={3}
              />
            </Field>
          </div>

          <Field label={t('reviewsNotes')}>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setIsDirty(true)
              }}
              rows={2}
            />
          </Field>
        </CardBody>
      </Card>
    </div>
  )
}

function DayNav({ day, setDay }: { day: DayKey; setDay: (d: DayKey) => void }) {
  const t = useT()
  const todayStr = toDayKey(new Date())
  function shift(delta: number) {
    const nextDay = toDayKey(addDays(fromDayKey(day), delta))
    if (delta > 0 && nextDay > todayStr) return
    setDay(nextDay)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" aria-label={t('reviewsDayNavPrev')} onClick={() => shift(-1)}>
        <ArrowLeft className="size-4 rtl:rotate-180" />
      </Button>
      <JalaliDatePicker
        value={day}
        max={todayStr}
        onChange={(v) => v && setDay(v)}
        className="w-44"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label={t('reviewsDayNavNext')}
        disabled={day >= todayStr}
        onClick={() => shift(1)}
      >
        <ArrowRight className="size-4 rtl:rotate-180" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDay(todayStr)}>
        {t('reviewsDayNavToday')}
      </Button>
    </div>
  )
}

/* ==========================================================================
   WEEKLY REVIEW PANEL
   ========================================================================== */

function WeeklyReviewPanel({
  weekStartDay,
  setWeekStartDay,
  currentWeekStart,
  existing,
  snapshot,
}: {
  weekStartDay: DayKey
  setWeekStartDay: (d: DayKey) => void
  currentWeekStart: DayKey
  existing: WeeklyReview | undefined
  snapshot: NonNullable<ReturnType<typeof useSnapshot>>
}) {
  const t = useT()
  const workspaceId = useWorkspaceId()

  const dayKeys = useMemo<DayKey[]>(() => {
    const start = fromDayKey(weekStartDay)
    return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i))).filter(
      (d) => d <= toDayKey(new Date()),
    )
  }, [weekStartDay])

  const weekStats = useMemo(
    () => computeRangeStats(snapshot, dayKeys),
    [snapshot, dayKeys],
  )

  const [highlights, setHighlights] = useState(existing?.highlights ?? '')
  const [challenges, setChallenges] = useState(existing?.challenges ?? '')
  const [nextWeekFocus, setNextWeekFocus] = useState(existing?.nextWeekFocus ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [aiAnalysis, setAiAnalysis] = useState(existing?.aiAnalysis ?? null)
  const [isDirty, setIsDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)

  // When selected week changes, reset to that week's existing review
  useEffect(() => {
    setHighlights(existing?.highlights ?? '')
    setChallenges(existing?.challenges ?? '')
    setNextWeekFocus(existing?.nextWeekFocus ?? '')
    setNotes(existing?.notes ?? '')
    setAiAnalysis(existing?.aiAnalysis ?? null)
    setIsDirty(false)
  }, [weekStartDay])

  // When existing review arrives from Dexie, update inputs only if user has not typed yet
  useEffect(() => {
    if (!isDirty && existing) {
      setHighlights(existing.highlights ?? '')
      setChallenges(existing.challenges ?? '')
      setNextWeekFocus(existing.nextWeekFocus ?? '')
      setNotes(existing.notes ?? '')
      setAiAnalysis(existing.aiAnalysis ?? null)
    }
  }, [existing, isDirty])

  const save = useCallback(async () => {
    if (!weekStats) return
    setBusy(true)
    try {
      await reviewRepo.saveWeekly(workspaceId, weekStartDay, {
        score: Math.round(weekStats.score),
        completionRate: weekStats.completionRate,
        focusMinutes: weekStats.focusMinutes,
        bestDay: weekStats.bestDay?.day ?? null,
        weakestDay: weekStats.weakestDay?.day ?? null,
        highlights,
        challenges,
        nextWeekFocus,
        notes,
        aiAnalysis,
      })
      setIsDirty(false)
      toast.success(t('reviewsToastWeeklySaved', { day: formatDayLabel(weekStartDay) }))
    } catch (error) {
      toast.error((error as Error).message || 'Could not save the weekly review')
    } finally {
      setBusy(false)
    }
  }, [weekStats, workspaceId, weekStartDay, highlights, challenges, nextWeekFocus, notes, aiAnalysis, t])

  // AI Executive Summary Generator
  const handleGenerateAi = () => {
    if (!weekStats) return
    setIsGeneratingAi(true)

    setTimeout(() => {
      const topDay = weekStats.bestDay ? formatDayLabel(weekStats.bestDay.day) : '—'
      const lowDay = weekStats.weakestDay ? formatDayLabel(weekStats.weakestDay.day) : '—'
      const focusHours = (weekStats.focusMinutes / 60).toFixed(1)

      const narrative = [
        `### 🏆 ${t('reviewsWeeklyAiTitle')}`,
        `• **${t('reviewsStatCompletionRate')}:** ${weekStats.completionRate}% (${weekStats.completedTasks} ${t('stCompleted')})`,
        `• **${t('reviewsStatFocus')}:** ${focusHours} ${t('durH', { h: focusHours })} (${weekStats.focusSessions} ${t('focusTodaySessionsCount', { count: weekStats.focusSessions, duration: '' })})`,
        `• **${t('analyticsBestDay', { day: topDay })}** | **${t('analyticsWeakestDay', { day: lowDay })}**`,
        `• **${t('reviewsStatDeadlines')}:** ${weekStats.deadlineDiscipline}% (${weekStats.metDeadlines} ${t('reviewsStatDeadlinesHint', { met: weekStats.metDeadlines, total: weekStats.metDeadlines + weekStats.missedDeadlines })})`,
        '',
        `#### 💡 ارزیابی تحلیلی FlowOS AI:`,
        weekStats.completionRate >= 75
          ? `خروجی این هفته درخشان بوده است. نرخ تکمیل بالا نشان می‌دهد تخمین‌ها واقع‌بینانه بوده و هماهنگی خوبی میان تعهدات و ساعات کار وجود داشته است.`
          : `نرخ تکمیل نیازمند بازنگری است. با کاهش حجم تسک‌های ورودی یا تقسیم آن‌ها به زیرکارهای کوچکتر، ریتم بهتری حاصل خواهد شد.`,
        '',
        `#### 🎯 پیشنهاد راهبردی برای هفته بعد:`,
        `۱. تمرکز روزهای آغازین را روی پروژه‌های اولویت‌دار بگذارید تا از فشار روزهای پایانی کاسته شود.`,
        `۲. ساعات طلایی تمرکز را بدون جلسه و وقفه حفظ کنید تا پیوستگی کار عمیق تقویت شود.`,
      ].join('\n')

      setAiAnalysis(narrative)
      setIsDirty(true)
      setIsGeneratingAi(false)
      toast.success(t('reviewsWeeklyAiGeneratedAt'))
    }, 600)
  }

  // Export to markdown
  const handleExportMarkdown = () => {
    const lines = [
      `# ${t('reviewsWeeklyReflectionTitle')} · ${formatDayLabel(weekStartDay)}`,
      `- **${t('reviewsStatCompletionRate')}:** ${weekStats.completionRate}%`,
      `- **${t('reviewsStatFocus')}:** ${formatDuration(weekStats.focusMinutes)}`,
      `- **${t('reviewsStatDeadlines')}:** ${weekStats.deadlineDiscipline}%`,
      `- **${t('reviewsStatActiveDays')}:** ${weekStats.activeDays}/${dayKeys.length}`,
      '',
      `## ${t('reviewsWeeklyHighlights')}`,
      highlights || '—',
      '',
      `## ${t('reviewsWeeklyChallenges')}`,
      challenges || '—',
      '',
      `## ${t('reviewsWeeklyNextFocus')}`,
      nextWeekFocus || '—',
      '',
      aiAnalysis ? `## AI Analysis\n${aiAnalysis}` : '',
    ].filter(Boolean)

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success(t('reviewsExportCopied'))
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Week Navigator */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('reviewsWeekNavPrev')}
              onClick={() => setWeekStartDay(toDayKey(addDays(fromDayKey(weekStartDay), -7)))}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </Button>
            <span className="text-sm font-semibold px-2">
              {t('reviewsWeekRange', {
                start: formatDayLabel(weekStartDay),
                end: formatDayLabel(dayKeys[dayKeys.length - 1] ?? weekStartDay),
              })}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('reviewsWeekNavNext')}
              disabled={weekStartDay >= currentWeekStart}
              onClick={() => setWeekStartDay(toDayKey(addDays(fromDayKey(weekStartDay), 7)))}
            >
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStartDay(currentWeekStart)}
            >
              {t('reviewsWeekNavCurrent')}
            </Button>
            {existing ? (
              <Badge className="text-emerald-500 border-emerald-500/30">
                <Check className="size-3 me-1" />
                {t('reviewsSavedBadge')}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {weekStats && !weekStats.rating.includes('No') ? (
              <ScoreLabel score={weekStats.score} rating={weekStats.rating} />
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleExportMarkdown}>
              <Copy className="size-3.5 me-1" />
              {t('reviewsExportMarkdown')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Week Key Metrics */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label={t('reviewsStatCompletionRate')}
          value={`${weekStats.completionRate}%`}
          tone="positive"
          hint={`${weekStats.completedTasks} / ${weekStats.plannedTasks} ${t('navTasks')}`}
        />
        <StatTile
          label={t('reviewsStatFocus')}
          value={formatDuration(weekStats.focusMinutes)}
          tone="accent"
          hint={t('reviewsStatFocusHint', { sessions: weekStats.focusSessions })}
        />
        <StatTile
          label={t('reviewsStatDeadlines')}
          value={`${weekStats.deadlineDiscipline}%`}
          hint={`${weekStats.metDeadlines} ${t('stCompleted')} · ${weekStats.missedDeadlines} ${t('stBlocked')}`}
        />
        <StatTile
          label={t('reviewsStatActiveDays')}
          value={`${weekStats.activeDays}/${dayKeys.length}`}
          hint={t('reviewsStatActiveDaysHint', { consistency: weekStats.consistency })}
        />
      </div>

      {/* 7-Day Performance Trend Chart */}
      <Card>
        <CardHeader
          title={t('reviewsWeeklyTrendTitle')}
          icon={<TrendingUp className="size-4 text-emerald-500" />}
          actions={
            weekStats.bestDay && (
              <Badge className="text-amber-500 border-amber-500/30">
                <Star className="size-3 me-1 fill-amber-500" />
                {t('reviewsWeeklyBestDay')}: {formatDayLabel(weekStats.bestDay.day)}
              </Badge>
            )
          }
        />
        <CardBody>
          <div className="grid grid-cols-7 gap-2 pt-4 pb-2 items-end min-h-[140px]">
            {weekStats.days.map((d: DayPoint) => {
              const isBest = weekStats.bestDay?.day === d.day
              const heightPct = d.noData ? 8 : Math.max(12, Math.round(d.score))

              return (
                <div key={d.day} className="flex flex-col items-center gap-2 group">
                  <span className="text-[11px] font-mono font-medium text-muted-foreground group-hover:text-foreground">
                    {d.noData ? '—' : `${Math.round(d.score)}%`}
                  </span>

                  <div className="w-full bg-muted/40 rounded-t-lg h-28 flex items-end p-1 relative">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={cn(
                        'w-full rounded-md transition-all duration-300 relative',
                        d.noData
                          ? 'bg-muted'
                          : isBest
                            ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-md shadow-amber-500/20'
                            : d.score >= 70
                              ? 'bg-emerald-500/80 hover:bg-emerald-500'
                              : 'bg-accent/80 hover:bg-accent',
                      )}
                    >
                      {isBest && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Star className="size-3 fill-amber-500 text-amber-500" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs font-semibold">{d.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.focusMinutes > 0 ? formatDuration(d.focusMinutes, { compact: true }) : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>

      {/* AI Executive Summary Assistant */}
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
        <CardHeader
          title={t('reviewsWeeklyAiTitle')}
          icon={<Bot className="size-4 text-accent" />}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAi}
              disabled={isGeneratingAi}
            >
              <Sparkles className="size-3.5 text-accent me-1.5" />
              {isGeneratingAi
                ? t('cWorking')
                : aiAnalysis
                  ? t('reviewsWeeklyAiRegenerate')
                  : t('reviewsWeeklyAiGenerate')}
            </Button>
          }
        />
        <CardBody>
          {aiAnalysis ? (
            <div className="rounded-xl border border-accent/20 bg-background/60 p-4 text-sm whitespace-pre-line leading-relaxed">
              {aiAnalysis}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2 italic">
              {t('reviewsWeeklyAiEmpty')}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Reflection Form */}
      <Card>
        <CardHeader
          title={t('reviewsWeeklyReflectionTitle')}
          description={existing ? t('reviewsSavedBadge') : t('reviewsUnsavedChanges')}
          icon={<Sparkles className="size-4" />}
          actions={
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
              <Save className="size-3.5" />
              {busy ? t('reviewsSaving') : t('reviewsSaveButton')}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Field label={t('reviewsWeeklyHighlights')}>
            <Textarea
              value={highlights}
              onChange={(e) => {
                setHighlights(e.target.value)
                setIsDirty(true)
              }}
              rows={3}
            />
          </Field>
          <Field label={t('reviewsWeeklyChallenges')}>
            <Textarea
              value={challenges}
              onChange={(e) => {
                setChallenges(e.target.value)
                setIsDirty(true)
              }}
              rows={3}
            />
          </Field>
          <Field label={t('reviewsWeeklyNextFocus')}>
            <Textarea
              value={nextWeekFocus}
              onChange={(e) => {
                setNextWeekFocus(e.target.value)
                setIsDirty(true)
              }}
              rows={3}
            />
          </Field>
          <Field label={t('reviewsNotes')}>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setIsDirty(true)
              }}
              rows={2}
            />
          </Field>
        </CardBody>
      </Card>
    </div>
  )
}

/* ==========================================================================
   REVIEW HISTORY
   ========================================================================== */

function ReviewHistory({
  daily = [],
  weekly = [],
  onSelectDaily,
  onSelectWeekly,
}: {
  daily?: DailyReview[]
  weekly?: WeeklyReview[]
  onSelectDaily: (day: DayKey) => void
  onSelectWeekly: (weekStart: DayKey) => void
}) {
  const t = useT()
  const [filter, setFilter] = useState<'all' | 'daily' | 'weekly'>('all')

  if (daily.length === 0 && weekly.length === 0) return null

  const rows = [
    ...daily.map((r) => ({
      key: r.id,
      id: r.id,
      type: 'daily' as const,
      when: r.day,
      title: `${t('reviewsTabDaily')} · ${formatDayLabel(r.day)}`,
      score: r.score,
      excerpt: r.wentWell || r.notes,
    })),
    ...weekly.map((r) => ({
      key: r.id,
      id: r.id,
      type: 'weekly' as const,
      when: r.weekStart,
      title: `${t('reviewsTabWeekly')} · ${formatDayLabel(r.weekStart)}`,
      score: r.score,
      excerpt: r.highlights || r.notes,
    })),
  ]
    .filter((r) => filter === 'all' || r.type === filter)
    .sort((a, b) => b.when.localeCompare(a.when))

  const handleDelete = async (row: (typeof rows)[0], e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(t('cDelete') + '?')) {
      if (row.type === 'daily') {
        await reviewRepo.removeDaily(row.id)
      } else {
        await reviewRepo.removeWeekly(row.id)
      }
      toast.success(t('reviewsToastSaved', { day: row.when }))
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('reviewsHistoryTitle')}
        description={t('reviewsHistoryCount', { count: rows.length })}
        actions={
          <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg border border-border">
            {(['all', 'daily', 'weekly'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  filter === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode === 'all'
                  ? t('reviewsHistoryFilterAll')
                  : mode === 'daily'
                    ? t('reviewsHistoryFilterDaily')
                    : t('reviewsHistoryFilterWeekly')}
              </button>
            ))}
          </div>
        }
      />
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground italic">{t('reviewsHistoryEmpty')}</p>
        ) : (
          rows.slice(0, 15).map((row) => (
            <div
              key={row.key}
              onClick={() => {
                if (row.type === 'daily') onSelectDaily(row.when)
                else onSelectWeekly(row.when)
              }}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-[10px] py-0 px-1.5', row.type === 'weekly' ? 'bg-accent/15 text-accent border-accent/30' : 'text-muted-foreground')}>
                    {row.type === 'daily' ? t('reviewsHistoryFilterDaily') : t('reviewsHistoryFilterWeekly')}
                  </Badge>
                  <span className="truncate text-sm font-semibold group-hover:text-accent transition-colors">
                    {row.title}
                  </span>
                </div>
                {row.excerpt ? (
                  <p className="truncate text-xs text-muted-foreground mt-1 ps-1">{row.excerpt}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {row.score > 0 ? (
                  <Badge className="font-mono text-xs">
                    {row.score}%
                  </Badge>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
                  onClick={(e) => void handleDelete(row, e)}
                  title={t('cDelete')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
