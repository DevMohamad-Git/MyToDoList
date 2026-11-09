import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, HelpCircle, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  ScoreLabel,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { computeDayStats } from '@/services/analytics'
import { ratingFor } from '@/services/scoring'
import { reviewRepo } from '@/storage/reviewRepo'
import { db } from '@/database/db'
import type { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import { useT } from '@/i18n'
import type { DailyReview, DayKey } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration } from '@/utils/date'
import { DayNav } from './DayNav'
import { MoodInsightCard } from './MoodInsightCard'
import { ScoreBreakdownModal } from './ScoreBreakdownModal'
import { StatInspectModal, type InspectTab } from './StatInspectModal'
import { TaskBreakdownCard } from './TaskBreakdownCard'

interface DailyReviewPanelProps {
  day: DayKey
  setDay: (d: DayKey) => void
  existing: DailyReview | undefined
  snapshot: NonNullable<ReturnType<typeof useSnapshot>>
}

export function DailyReviewPanel({
  day,
  setDay,
  existing,
  snapshot,
}: DailyReviewPanelProps) {
  const t = useT()
  const workspaceId = useWorkspaceId()

  const [currentTime, setCurrentTime] = useState(() => new Date())
  useEffect(() => {
    // Keep reference time fresh if page stays open
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const dayStats = useMemo(
    () => computeDayStats(snapshot, day, currentTime),
    [snapshot, day, currentTime],
  )

  // Interactive Inspection Modals state
  const [inspectTab, setInspectTab] = useState<InspectTab | null>(null)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)

  // Local form state
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

  // References to safely flush uncommitted changes on day switch or unmount
  const formRef = useRef({ selfRating, wentWell, blockers, improve, notes })
  formRef.current = { selfRating, wentWell, blockers, improve, notes }
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const currentDayRef = useRef(day)
  currentDayRef.current = day

  // Core save function
  const save = useCallback(
    async (targetDay = day, overrideData = formRef.current) => {
      if (!dayStats) return
      setBusy(true)
      setSaveStatus('saving')
      try {
        await reviewRepo.saveDaily(workspaceId, targetDay, {
          score: dayStats.score.noData ? 0 : Math.round(dayStats.score.score),
          completedTaskIds: dayStats.completed.map((t) => t.id),
          incompleteTaskIds: dayStats.open.map((t) => t.id),
          selfRating: overrideData.selfRating,
          wentWell: overrideData.wentWell,
          blockers: overrideData.blockers,
          improve: overrideData.improve,
          notes: overrideData.notes,
        })
        setIsDirty(false)
        setSaveStatus('saved')
        toast.success(t('reviewsToastSaved', { day: formatDayLabel(targetDay) }))
      } catch (error) {
        setSaveStatus('unsaved')
        toast.error((error as Error).message || 'Could not save the review')
      } finally {
        setBusy(false)
      }
    },
    [dayStats, workspaceId, day, t],
  )

  // Safe day changer: flush dirty changes for current day before switching
  const handleSafeSetDay = useCallback(
    (nextDay: DayKey) => {
      if (nextDay === day) return
      if (isDirtyRef.current) {
        void save(currentDayRef.current, formRef.current)
      }
      setDay(nextDay)
    },
    [day, save, setDay],
  )

  // Reset form when active day changes
  useEffect(() => {
    setSelfRating(existing?.selfRating ?? null)
    setWentWell(existing?.wentWell ?? '')
    setBlockers(existing?.blockers ?? '')
    setImprove(existing?.improve ?? '')
    setNotes(existing?.notes ?? '')
    setIsDirty(false)
    setSaveStatus(existing ? 'saved' : 'idle')
  }, [day, existing])

  // Flush on browser tab close / refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirtyRef.current) {
        void save(currentDayRef.current, formRef.current)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [save])

  // Debounced auto-save (2.5s)
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

  // Habits performance optimization: use snapshot.habits directly (no duplicate DB query)
  const activeHabits = useMemo(
    () => (snapshot.habits ?? []).filter((h) => !h.archived),
    [snapshot.habits],
  )

  const habitEntries = useLiveQuery(
    () => db.habitEntries.where('[workspaceId+day]').equals([workspaceId, day]).toArray(),
    [workspaceId, day],
  ) ?? []

  const completedHabitIds = useMemo(
    () => new Set(habitEntries.filter((e) => e.count > 0).map((e) => e.habitId)),
    [habitEntries],
  )

  // Focus sessions for the day
  const dayFocusSessions = useMemo(
    () => (snapshot.focusSessions ?? []).filter((s) => s.day === day),
    [snapshot.focusSessions, day],
  )

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

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      {/* Date Navigation & Status Bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DayNav day={day} setDay={handleSafeSetDay} />
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
              <button
                type="button"
                onClick={() => setScoreModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs hover:border-accent hover:bg-accent/5 hover:text-foreground transition-all cursor-pointer shadow-sm group"
                title="کلیک برای مشاهده جزئیات، فرمول و مؤلفه‌های رتبه عملکرد"
              >
                <ScoreLabel
                  score={dayStats.score.score}
                  rating={ratingFor(dayStats.score.score, snapshot.settings.scoring.thresholds)}
                />
                <span className="text-[11px] text-muted-foreground group-hover:text-accent border-s border-border ps-2 hidden sm:inline">
                  تحلیل رتبه
                </span>
                <HelpCircle className="size-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
              </button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportMarkdown}
              title={t('reviewsExportMarkdown')}
            >
              <Copy className="size-3.5 me-1" />
              {t('reviewsExportMarkdown')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Interactive Stats Grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label={t('reviewsStatPlanned')}
          value={dayStats.workload.length}
          onClick={() => setInspectTab('planned')}
          title="کلیک برای مشاهده لیست کامل کارهای برنامه‌ریزی‌شده و دارای موعد"
          hint="کلیک برای مشاهده لیست کارها"
        />
        <StatTile
          label={t('reviewsStatCompleted')}
          value={dayStats.completed.length}
          tone="positive"
          hint={t('reviewsStatOpenHint', { count: dayStats.open.length })}
          onClick={() => setInspectTab('completed')}
          title="کلیک برای مشاهده کارهای تکمیل‌شده امروز"
        />
        <StatTile
          label={t('reviewsStatDeadlines')}
          value={`${dayStats.metDeadlines} / ${dayStats.metDeadlines + dayStats.missedDeadlines}`}
          hint={t('reviewsStatDeadlinesHint', {
            met: dayStats.metDeadlines,
            total: dayStats.metDeadlines + dayStats.missedDeadlines,
          })}
          tone={dayStats.missedDeadlines > 0 ? 'warning' : 'positive'}
          onClick={() => setInspectTab('deadlines')}
          title="کلیک برای بررسی وضعیت مهلت‌ها و ددلاین‌ها"
        />
        <StatTile
          label={t('reviewsStatFocus')}
          value={formatDuration(dayStats.focusMinutes)}
          hint={t('reviewsStatFocusHint', { sessions: dayStats.focusSessions })}
          tone="accent"
          onClick={() => setInspectTab('focus')}
          title="کلیک برای مشاهده نشست‌های ثبت‌شده کار عمیق"
        />
      </div>

      {/* Mood vs Reality Psychological Insight */}
      <MoodInsightCard
        selfRating={selfRating}
        score={dayStats && !dayStats.score.noData ? dayStats.score.score : null}
      />

      {/* Interactive Task Breakdown & Interactive Habits */}
      <TaskBreakdownCard
        workspaceId={workspaceId}
        day={day}
        completed={dayStats.completed}
        open={dayStats.open}
        workloadCount={dayStats.workload.length}
        activeHabits={activeHabits}
        completedHabitIds={completedHabitIds}
      />

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

      {/* Task & Stat Details Inspection Modal */}
      <StatInspectModal
        open={inspectTab !== null}
        onClose={() => setInspectTab(null)}
        initialTab={inspectTab ?? 'planned'}
        day={day}
        workload={dayStats.workload}
        completed={dayStats.completed}
        openTasks={dayStats.open}
        focusSessions={dayFocusSessions}
        projects={snapshot.projects ?? []}
      />

      {/* Score Breakdown Analysis Modal */}
      <ScoreBreakdownModal
        open={scoreModalOpen}
        onClose={() => setScoreModalOpen(false)}
        scoreResult={dayStats.score}
        title={`تحلیل و جزئیات امتیاز روز ${formatDayLabel(day)}`}
        subtitle="بررسی نحوه محاسبه ۶ مؤلفه بهره‌وری و دلایل رتبه اختصاص‌یافته"
      />
    </div>
  )
}
