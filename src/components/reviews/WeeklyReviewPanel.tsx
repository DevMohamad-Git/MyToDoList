import { Bot, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { computeRangeStats } from '@/services/analytics'
import type { ScoreResult } from '@/services/scoring'
import { reviewRepo } from '@/storage/reviewRepo'
import type { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import { useT } from '@/i18n'
import type { DayKey, WeeklyReview } from '@/types'
import { addDays, formatDayLabel, formatDuration, fromDayKey, toDayKey } from '@/utils/date'
import { ScoreBreakdownModal } from './ScoreBreakdownModal'
import { StatInspectModal, type InspectTab } from './StatInspectModal'
import { WeeklyTrendChart } from './WeeklyTrendChart'
import { WeekNav } from './WeekNav'

interface WeeklyReviewPanelProps {
  weekStartDay: DayKey
  setWeekStartDay: (d: DayKey) => void
  currentWeekStart: DayKey
  existing: WeeklyReview | undefined
  allWeekly: WeeklyReview[]
  snapshot: NonNullable<ReturnType<typeof useSnapshot>>
}

export function WeeklyReviewPanel({
  weekStartDay,
  setWeekStartDay,
  currentWeekStart,
  existing,
  allWeekly,
  snapshot,
}: WeeklyReviewPanelProps) {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const todayStr = toDayKey(new Date())

  // Modals state
  const [inspectTab, setInspectTab] = useState<InspectTab | null>(null)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)

  // Generate full 7 days for the week to keep grid layout intact
  const all7DayKeys = useMemo<DayKey[]>(() => {
    const start = fromDayKey(weekStartDay)
    return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i)))
  }, [weekStartDay])

  const weekEndDay = all7DayKeys[6] ?? weekStartDay

  // Only pass days up to today to compute realistic past metrics
  const activeDayKeys = useMemo<DayKey[]>(() => {
    return all7DayKeys.filter((d) => d <= todayStr)
  }, [all7DayKeys, todayStr])

  const weekStats = useMemo(
    () => computeRangeStats(snapshot, activeDayKeys.length > 0 ? activeDayKeys : [weekStartDay]),
    [snapshot, activeDayKeys, weekStartDay],
  )

  // Delta comparisons with previous week
  const prevWeekStart = useMemo(
    () => toDayKey(addDays(fromDayKey(weekStartDay), -7)),
    [weekStartDay],
  )
  const existingPrevWeekly = useMemo(
    () => allWeekly.find((r) => r.weekStart === prevWeekStart),
    [allWeekly, prevWeekStart],
  )

  // Extract weekly tasks & sessions for inspection modal
  const allWeekTasks = useMemo(() => {
    const dayKeySet = new Set(all7DayKeys)
    return (snapshot.tasks ?? []).filter(
      (t) =>
        !t.archived &&
        ((t.startDate && dayKeySet.has(toDayKey(t.startDate))) ||
          (t.dueDate && dayKeySet.has(toDayKey(t.dueDate))) ||
          (t.completedAt && dayKeySet.has(toDayKey(t.completedAt)))),
    )
  }, [snapshot.tasks, all7DayKeys])

  const allWeekCompleted = useMemo(
    () => allWeekTasks.filter((t) => t.status === 'completed'),
    [allWeekTasks],
  )

  const allWeekOpen = useMemo(
    () => allWeekTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [allWeekTasks],
  )

  const allWeekFocusSessions = useMemo(() => {
    const dayKeySet = new Set(all7DayKeys)
    return (snapshot.focusSessions ?? []).filter((s) => dayKeySet.has(s.day))
  }, [snapshot.focusSessions, all7DayKeys])

  // Weekly Score Breakdown Synthesis
  const weeklyScoreResult = useMemo<ScoreResult>(() => {
    const noData = weekStats.days.every((d) => d.noData)
    const targetMinutes = (snapshot.settings.planning.dailyFocusTarget || 120) * all7DayKeys.length
    const focusRatio = Math.min(100, Math.round((weekStats.focusMinutes / targetMinutes) * 100))

    return {
      score: weekStats.score,
      rating: weekStats.rating,
      noData,
      components: [
        {
          key: 'taskCompletion',
          label: 'Task completion',
          value: weekStats.completionRate,
          weight: 25,
          effectiveWeight: 25,
          explanation: `${weekStats.completedTasks} از ${weekStats.plannedTasks} کار برنامه‌ریزی‌شده در طول هفته انجام شد.`,
        },
        {
          key: 'deadlineDiscipline',
          label: 'Deadline discipline',
          value: weekStats.deadlineDiscipline,
          weight: 20,
          effectiveWeight: 20,
          explanation: `${weekStats.metDeadlines} سررسید رعایت شد و ${weekStats.missedDeadlines} مورد موعد گذشته بود.`,
        },
        {
          key: 'focusTime',
          label: 'Focus time',
          value: focusRatio,
          weight: 20,
          effectiveWeight: 20,
          explanation: `${formatDuration(weekStats.focusMinutes)} کار عمیق در قالب ${weekStats.focusSessions} جلسه تمرکز.`,
        },
        {
          key: 'consistency',
          label: 'Consistency',
          value: weekStats.consistency,
          weight: 15,
          effectiveWeight: 15,
          explanation: `${weekStats.activeDays} روز کاری فعال از مجموع ایام هفته.`,
        },
        {
          key: 'priorityCompletion',
          label: 'Priority-weighted completion',
          value: weekStats.completionRate,
          weight: 10,
          effectiveWeight: 10,
          explanation: 'ضریب تحقق اولویت‌های کلیدی پروژه‌های هفته.',
        },
        {
          key: 'timeEfficiency',
          label: 'Time efficiency',
          value: weekStats.actualMinutes > 0 ? 80 : null,
          weight: 10,
          effectiveWeight: 10,
          explanation: 'دقت تخمین زمانی در کارهای انجام‌شده.',
        },
      ],
    }
  }, [weekStats, all7DayKeys.length, snapshot.settings.planning.dailyFocusTarget])

  // Form states
  const [highlights, setHighlights] = useState(existing?.highlights ?? '')
  const [challenges, setChallenges] = useState(existing?.challenges ?? '')
  const [nextWeekFocus, setNextWeekFocus] = useState(existing?.nextWeekFocus ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [aiAnalysis, setAiAnalysis] = useState(existing?.aiAnalysis ?? null)
  const [isDirty, setIsDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'idle'>(
    existing ? 'saved' : 'idle',
  )

  // Refs for zero-loss auto-save flush
  const formRef = useRef({ highlights, challenges, nextWeekFocus, notes, aiAnalysis })
  formRef.current = { highlights, challenges, nextWeekFocus, notes, aiAnalysis }
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const currentWeekStartRef = useRef(weekStartDay)
  currentWeekStartRef.current = weekStartDay

  // Core save function
  const save = useCallback(
    async (targetWeek = weekStartDay, overrideData = formRef.current) => {
      if (!weekStats) return
      setBusy(true)
      setSaveStatus('saving')
      try {
        await reviewRepo.saveWeekly(workspaceId, targetWeek, {
          score: Math.round(weekStats.score),
          completionRate: weekStats.completionRate,
          focusMinutes: weekStats.focusMinutes,
          bestDay: weekStats.bestDay?.day ?? null,
          weakestDay: weekStats.weakestDay?.day ?? null,
          highlights: overrideData.highlights,
          challenges: overrideData.challenges,
          nextWeekFocus: overrideData.nextWeekFocus,
          notes: overrideData.notes,
          aiAnalysis: overrideData.aiAnalysis,
        })
        setIsDirty(false)
        setSaveStatus('saved')
        toast.success(t('reviewsToastWeeklySaved', { day: formatDayLabel(targetWeek) }))
      } catch (error) {
        setSaveStatus('unsaved')
        toast.error((error as Error).message || 'Could not save the weekly review')
      } finally {
        setBusy(false)
      }
    },
    [weekStats, workspaceId, weekStartDay, t],
  )

  // Safe week shift: flushes unsaved data for previous week before switching
  const shiftWeek = useCallback(
    (deltaDays: number) => {
      if (isDirtyRef.current) {
        void save(currentWeekStartRef.current, formRef.current)
      }
      setWeekStartDay(toDayKey(addDays(fromDayKey(weekStartDay), deltaDays)))
    },
    [save, setWeekStartDay, weekStartDay],
  )

  // Safe setter for current week
  const handleSafeSetWeek = useCallback(
    (nextWeek: DayKey) => {
      if (nextWeek === weekStartDay) return
      if (isDirtyRef.current) {
        void save(currentWeekStartRef.current, formRef.current)
      }
      setWeekStartDay(nextWeek)
    },
    [save, setWeekStartDay, weekStartDay],
  )

  // Reset form when active week changes
  useEffect(() => {
    setHighlights(existing?.highlights ?? '')
    setChallenges(existing?.challenges ?? '')
    setNextWeekFocus(existing?.nextWeekFocus ?? '')
    setNotes(existing?.notes ?? '')
    setAiAnalysis(existing?.aiAnalysis ?? null)
    setIsDirty(false)
    setSaveStatus(existing ? 'saved' : 'idle')
  }, [weekStartDay, existing])

  // Flush on tab close / browser reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirtyRef.current) {
        void save(currentWeekStartRef.current, formRef.current)
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

  // Local smart analytical narrative generation
  const handleGenerateLocalAnalysis = () => {
    if (!weekStats) return
    setIsGeneratingAi(true)

    setTimeout(() => {
      const topDay = weekStats.bestDay ? formatDayLabel(weekStats.bestDay.day) : '—'
      const lowDay = weekStats.weakestDay ? formatDayLabel(weekStats.weakestDay.day) : '—'
      const focusHours = (weekStats.focusMinutes / 60).toFixed(1)
      const rate = weekStats.completionRate

      let performanceText = ''
      if (rate >= 80) {
        performanceText = `خروجی اجرایی این هفته بسیار قوی بود. نرخ تکمیل ${rate}٪ نشان می‌دهد برنامه‌ریزی واقع‌بینانه بوده و هماهنگی کم‌نظیری میان زمان‌های پیش‌بینی‌شده و توان تحویل وجود داشته است.`
      } else if (rate >= 55) {
        performanceText = `ریتم کاری باثبات با نرخ تکمیل ${rate}٪. بخش اصلی اهداف پوشش داده شده است، اما برای جلوگیری از انتقال تسک‌ها به هفته بعد، شکستن کارهای بزرگ به بخش‌های کوچکتر توصیه می‌شود.`
      } else {
        performanceText = `نرخ تکمیل ${rate}٪ نشان می‌دهد که حجم تعهدات ورودی فراتر از ظرفیت زمانی واقعی بوده یا چالش‌های پیش‌بینی‌نشده باعث وقفه در ریتم کار شده‌اند. بازبینی و اولویت‌بندی محدودتر برای هفته پیش‌رو ضروری است.`
      }

      let focusText = ''
      const avgSession =
        weekStats.focusSessions > 0
          ? Math.round(weekStats.focusMinutes / weekStats.focusSessions)
          : 0

      if (weekStats.focusMinutes >= 480) {
        focusText = `تمرکز پایدار و کار عمیق چشمگیر: ثبت ${focusHours} ساعت کار متمرکز در ${weekStats.focusSessions} جلسه (میانگین ${avgSession} دقیقه برای هر نشست). این پیوستگی ستون اصلی بهره‌وری شما بوده است.`
      } else if (weekStats.focusMinutes >= 120) {
        focusText = `تلاش‌های تمرکزی متوسط با ${focusHours} ساعت در قالب ${weekStats.focusSessions} نشست. برای بازدهی بیشتر، بلوک‌های تمرکز بدون وقفه را در روزهای اول هفته تثبیت کنید.`
      } else {
        focusText = `ساعات کار متمرکز ثبت‌شده (${focusHours} ساعت) محدود بوده است. پیشنهاد می‌شود جلسات Focus Timer را در آغاز روزهای کاری فعال کنید.`
      }

      const recs: string[] = []
      if (weekStats.deadlineDiscipline < 75) {
        recs.push(
          '۱. مهلت‌های شناور: برای تسک‌های دارای ددلاین حاشیه امن در نظر بگیرید تا فشار انتهای هفته کاهش یابد.',
        )
      } else {
        recs.push(
          '۱. استمرار انضباط زمانی: رعایت سررسیدها عالی بوده است؛ همین استاندارد را برای هفته بعد حفظ کنید.',
        )
      }

      if (weekStats.activeDays < 4) {
        recs.push(
          '۲. توزیع پیوسته بار کاری: پخش یکنواخت‌تر تسک‌ها در روزهای هفته از فرسودگی مقطعی جلوگیری می‌کند.',
        )
      } else {
        recs.push(
          '۲. بهره‌گیری از ثبات کاری: شما در اکثر روزهای هفته فعال بوده‌اید؛ از این مومنتوم برای پیشبرد پروژه‌های بلندمدت بهره ببرید.',
        )
      }

      recs.push(
        `۳. الگوبرداری از اوج عملکرد: بالاترین بازدهی شما در «${topDay}» ثبت شد. شرایط محیطی و برنامه‌ریزی آن روز را برای روزهای دیگر بازآفرینی کنید.`,
      )

      const narrative = [
        `### 🏆 گزارش تحلیلی مرور عملکرد هفتگی`,
        `• **نرخ تکمیل اهداف:** ${rate}٪ (${weekStats.completedTasks} از ${weekStats.plannedTasks} کار برنامه‌ریزی‌شده)`,
        `• **زمان کار عمیق:** ${focusHours} ساعت (${weekStats.focusSessions} جلسه نشست تمرکز)`,
        `• **انضباط مهلت‌ها:** ${weekStats.deadlineDiscipline}٪ (${weekStats.metDeadlines} سررسید رعایت‌شده)`,
        `• **تداوم کاری:** ${weekStats.activeDays} روز فعال از ${activeDayKeys.length} روز سپری‌شده`,
        `• **روز طلایی:** ${topDay} | **روز نیازمند توجه:** ${lowDay}`,
        '',
        `#### 💡 ارزیابی تحلیلی عملکرد:`,
        performanceText,
        '',
        `#### ⏱ وضعیت کار عمیق و تمرکز:`,
        focusText,
        '',
        `#### 🎯 ۳ راهکار راهبردی برای هفته آینده:`,
        ...recs,
      ].join('\n')

      setAiAnalysis(narrative)
      setIsDirty(true)
      setIsGeneratingAi(false)
      toast.success(t('reviewsWeeklyAiGeneratedAt'))
    }, 350)
  }

  // Ctrl+Enter shortcut to save
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }

  // Export to markdown
  const handleExportMarkdown = () => {
    const lines = [
      `# ${t('reviewsWeeklyReflectionTitle')} · ${formatDayLabel(weekStartDay)}`,
      `- **${t('reviewsStatCompletionRate')}:** ${weekStats.completionRate}%`,
      `- **${t('reviewsStatFocus')}:** ${formatDuration(weekStats.focusMinutes)}`,
      `- **${t('reviewsStatDeadlines')}:** ${weekStats.deadlineDiscipline}%`,
      `- **${t('reviewsStatActiveDays')}:** ${weekStats.activeDays}/${all7DayKeys.length}`,
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
      aiAnalysis ? `## تحلیل هفتگی\n${aiAnalysis}` : '',
    ].filter(Boolean)

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success(t('reviewsExportCopied'))
    })
  }

  // Calculation of weekly delta hints
  const completionDelta = existingPrevWeekly
    ? weekStats.completionRate - (existingPrevWeekly.completionRate ?? 0)
    : null
  const focusDeltaMinutes = existingPrevWeekly
    ? weekStats.focusMinutes - (existingPrevWeekly.focusMinutes ?? 0)
    : null

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      {/* Week Navigator */}
      <WeekNav
        weekStartDay={weekStartDay}
        setWeekStartDay={handleSafeSetWeek}
        currentWeekStart={currentWeekStart}
        weekEndDay={weekEndDay}
        saveStatus={saveStatus}
        weekStats={weekStats}
        onExportMarkdown={handleExportMarkdown}
        shiftWeek={shiftWeek}
        onScoreClick={() => setScoreModalOpen(true)}
      />

      {/* Interactive Week Key Metrics Grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label={t('reviewsStatCompletionRate')}
          value={`${weekStats.completionRate}%`}
          tone="positive"
          onClick={() => setInspectTab('completed')}
          title="کلیک برای مشاهده کارهای تکمیل‌شده این هفته"
          hint={
            completionDelta !== null
              ? `${completionDelta >= 0 ? '+' : ''}${completionDelta}٪ نسبت به هفته پیش`
              : `${weekStats.completedTasks} / ${weekStats.plannedTasks} ${t('navTasks')}`
          }
        />
        <StatTile
          label={t('reviewsStatFocus')}
          value={formatDuration(weekStats.focusMinutes)}
          tone="accent"
          onClick={() => setInspectTab('focus')}
          title="کلیک برای مشاهده نشست‌های تمرکز این هفته"
          hint={
            focusDeltaMinutes !== null
              ? `${focusDeltaMinutes >= 0 ? '+' : ''}${formatDuration(focusDeltaMinutes)} نسبت به هفته پیش`
              : t('reviewsStatFocusHint', { sessions: weekStats.focusSessions })
          }
        />
        <StatTile
          label={t('reviewsStatDeadlines')}
          value={`${weekStats.deadlineDiscipline}%`}
          onClick={() => setInspectTab('deadlines')}
          title="کلیک برای مشاهده مهلت‌ها و ددلاین‌های هفته"
          hint={`${weekStats.metDeadlines} ${t('stCompleted')} · ${weekStats.missedDeadlines} ${t('stBlocked')}`}
        />
        <StatTile
          label={t('reviewsStatActiveDays')}
          value={`${weekStats.activeDays}/${all7DayKeys.length}`}
          onClick={() => setInspectTab('planned')}
          title="کلیک برای مشاهده کل کارهای هفته"
          hint={t('reviewsStatActiveDaysHint', { consistency: weekStats.consistency })}
        />
      </div>

      {/* 7-Day Performance Trend Chart */}
      <WeeklyTrendChart
        days={weekStats.days}
        all7DayKeys={all7DayKeys}
        bestDay={weekStats.bestDay}
      />

      {/* Smart Analytical Summary */}
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
        <CardHeader
          title={t('reviewsWeeklyAiTitle')}
          icon={<Bot className="size-4 text-accent" />}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateLocalAnalysis}
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
          description={saveStatus === 'saved' ? t('reviewsSavedBadge') : t('reviewsUnsavedChanges')}
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

      {/* Task & Stat Details Inspection Modal */}
      <StatInspectModal
        open={inspectTab !== null}
        onClose={() => setInspectTab(null)}
        initialTab={inspectTab ?? 'completed'}
        day={weekStartDay}
        workload={allWeekTasks}
        completed={allWeekCompleted}
        openTasks={allWeekOpen}
        focusSessions={allWeekFocusSessions}
        projects={snapshot.projects ?? []}
      />

      {/* Weekly Score Breakdown Analysis Modal */}
      <ScoreBreakdownModal
        open={scoreModalOpen}
        onClose={() => setScoreModalOpen(false)}
        scoreResult={weeklyScoreResult}
        title={`تحلیل و جزئیات امتیاز هفته ${formatDayLabel(weekStartDay)}`}
        subtitle="بررسی شاخص‌های تجمیعی، دقت تخمین و ثبات عملکرد در طول هفته"
      />
    </div>
  )
}
