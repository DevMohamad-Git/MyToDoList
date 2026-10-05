import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, ClipboardCheck, Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  ScoreLabel,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { computeDayStats, computeRangeStats } from '@/services/analytics'
import { ratingFor } from '@/services/scoring'
import { reviewRepo } from '@/storage/reviewRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { DayKey } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration, fromDayKey, toDayKey, addDays } from '@/utils/date'
import { startOfWeek as startOfWeekFns } from 'date-fns'

/**
 * Reviews: a daily reflection pre-filled from the day's real numbers, and a
 * weekly review pre-filled from the week's range stats. Saving upserts, so
 * re-opening a day edits the existing review rather than duplicating it.
 */
export function ReviewsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()
  const settings = useSettings()

  const [tab, setTab] = useState<'daily' | 'weekly'>('daily')
  const [day, setDay] = useState(() => toDayKey(new Date()))

  const allDaily =
    useLiveQuery(() => reviewRepo.allDaily(workspaceId), [workspaceId]) ?? []
  const allWeekly =
    useLiveQuery(() => reviewRepo.allWeekly(workspaceId), [workspaceId]) ?? []

  const existingDaily = useMemo(
    () => allDaily.find((r) => r.day === day),
    [allDaily, day],
  )

  const weekStartDay = toDayKey(
    startOfWeekFns(fromDayKey(day), { weekStartsOn: settings.planning.weekStartsOn }),
  )
  const existingWeekly = useMemo(
    () => allWeekly.find((r) => r.weekStart === weekStartDay),
    [allWeekly, weekStartDay],
  )

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Close the loop: compare what you planned against what happened, then write down what to change."
        actions={
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            {(['daily', 'weekly'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        }
      />

      {!snapshot ? (
        <LoadingState label="Loading…" />
      ) : tab === 'daily' ? (
        <DailyReviewPanel
          day={day}
          setDay={setDay}
          existing={existingDaily}
          recent={allDaily}
        />
      ) : (
        <WeeklyReviewPanel weekStartDay={weekStartDay} existing={existingWeekly} recent={allWeekly} />
      )}
    </>
  )
}

function DayNav({ day, setDay }: { day: DayKey; setDay: (d: DayKey) => void }) {
  function shift(delta: number) {
    setDay(toDayKey(addDays(fromDayKey(day), delta)))
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => shift(-1)}>
        <ArrowLeft className="size-4" />
      </Button>
      <JalaliDatePicker
        value={day}
        max={toDayKey(new Date())}
        onChange={(v) => v && setDay(v)}
        className="w-44"
      />
      <Button variant="outline" size="icon" aria-label="Next day" onClick={() => shift(1)}>
        <ArrowRight className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDay(toDayKey(new Date()))}>
        Today
      </Button>
    </div>
  )
}

function DailyReviewPanel({
  day,
  setDay,
  existing,
  recent,
}: {
  day: DayKey
  setDay: (d: DayKey) => void
  existing: { id: string; score: number; selfRating: number | null; wentWell: string; blockers: string; improve: string; notes: string } | undefined
  recent: Parameters<typeof ReviewHistory>[0]['daily']
}) {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()
  const now = new Date()

  const dayStats = useMemo(
    () => (snapshot ? computeDayStats(snapshot, day, now) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, day],
  )

  const [selfRating, setSelfRating] = useState(existing?.selfRating ?? null)
  const [wentWell, setWentWell] = useState(existing?.wentWell ?? '')
  const [blockers, setBlockers] = useState(existing?.blockers ?? '')
  const [improve, setImprove] = useState(existing?.improve ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSelfRating(existing?.selfRating ?? null)
    setWentWell(existing?.wentWell ?? '')
    setBlockers(existing?.blockers ?? '')
    setImprove(existing?.improve ?? '')
    setNotes(existing?.notes ?? '')
  }, [existing])

  async function save() {
    if (!dayStats) return
    setBusy(true)
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
      toast.success(`Review saved for ${formatDayLabel(day)}`)
    } catch (error) {
      toast.error((error as Error).message || 'Could not save the review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <DayNav day={day} setDay={setDay} />
          <span className="text-sm font-medium">{formatDayLabel(day)}</span>
          {existing ? <Badge>Saved</Badge> : null}
          {dayStats && !dayStats.score.noData ? (
            <ScoreLabel
              score={dayStats.score.score}
              rating={ratingFor(dayStats.score.score, snapshot!.settings.scoring.thresholds)}
            />
          ) : null}
        </div>
      </Card>

      {dayStats ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Tasks due / planned" value={dayStats.workload.length} />
          <StatTile
            label="Completed"
            value={dayStats.completed.length}
            tone="positive"
            hint={`${dayStats.open.length} still open`}
          />
          <StatTile
            label="Deadlines"
            value={`${dayStats.metDeadlines} / ${dayStats.metDeadlines + dayStats.missedDeadlines}`}
            hint="met of due"
            tone={dayStats.missedDeadlines > 0 ? 'warning' : 'positive'}
          />
          <StatTile
            label="Focus"
            value={formatDuration(dayStats.focusMinutes)}
            hint={`${dayStats.focusSessions} session(s)`}
            tone="accent"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Daily reflection"
          description={existing ? 'Editing the saved review' : 'Not saved yet'}
          icon={<ClipboardCheck className="size-4" />}
          actions={
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !dayStats}>
              <Save className="size-3.5" />
              {busy ? 'Saving…' : 'Save review'}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Field label="How did the day feel? (1–5)">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n}`}
                  aria-pressed={selfRating === n}
                  onClick={() => setSelfRating(n === selfRating ? null : n)}
                  className={cn(
                    'size-9 rounded-lg border text-sm font-semibold transition-colors',
                    selfRating === n
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="What went well?">
            <Textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blockers">
              <Textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} />
            </Field>
            <Field label="What to improve tomorrow">
              <Textarea value={improve} onChange={(e) => setImprove(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <ReviewHistory daily={recent} />
    </div>
  )
}

function WeeklyReviewPanel({
  weekStartDay,
  existing,
  recent,
}: {
  weekStartDay: DayKey
  existing:
    | {
        score: number
        completionRate: number
        focusMinutes: number
        bestDay: string | null
        weakestDay: string | null
        highlights: string
        challenges: string
        nextWeekFocus: string
        notes: string
        aiAnalysis: string | null
      }
    | undefined
  recent: Parameters<typeof ReviewHistory>[0]['weekly']
}) {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const dayKeys = useMemo<DayKey[]>(() => {
    const start = fromDayKey(weekStartDay)
    return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i))).filter(
      (d) => d <= toDayKey(new Date()),
    )
  }, [weekStartDay])

  const weekStats = useMemo(
    () => (snapshot ? computeRangeStats(snapshot, dayKeys) : null),
    [snapshot, dayKeys],
  )

  const [highlights, setHighlights] = useState(existing?.highlights ?? '')
  const [challenges, setChallenges] = useState(existing?.challenges ?? '')
  const [nextWeekFocus, setNextWeekFocus] = useState(existing?.nextWeekFocus ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setHighlights(existing?.highlights ?? '')
    setChallenges(existing?.challenges ?? '')
    setNextWeekFocus(existing?.nextWeekFocus ?? '')
    setNotes(existing?.notes ?? '')
  }, [existing])

  async function save() {
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
        aiAnalysis: existing?.aiAnalysis ?? null,
      })
      toast.success(`Weekly review saved for week of ${formatDayLabel(weekStartDay)}`)
    } catch (error) {
      toast.error((error as Error).message || 'Could not save the weekly review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">
            Week of {formatDayLabel(weekStartDay)}
          </span>
          {existing ? <Badge>Saved</Badge> : null}
          {weekStats && !weekStats.rating.includes('No') ? (
            <ScoreLabel score={weekStats.score} rating={weekStats.rating} />
          ) : null}
        </div>
      </Card>

      {weekStats ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Completion" value={`${weekStats.completionRate}%`} tone="positive" />
          <StatTile label="Focus" value={formatDuration(weekStats.focusMinutes)} tone="accent" />
          <StatTile
            label="Deadlines"
            value={`${weekStats.deadlineDiscipline}%`}
            hint={`${weekStats.metDeadlines} met · ${weekStats.missedDeadlines} missed`}
          />
          <StatTile
            label="Active days"
            value={`${weekStats.activeDays}/${dayKeys.length}`}
            hint={`${weekStats.consistency}% consistency`}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Weekly reflection"
          description={existing ? 'Editing the saved review' : 'Not saved yet'}
          icon={<Sparkles className="size-4" />}
          actions={
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !weekStats}>
              <Save className="size-3.5" />
              {busy ? 'Saving…' : 'Save review'}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Field label="Highlights">
            <Textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} />
          </Field>
          <Field label="Challenges">
            <Textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} />
          </Field>
          <Field label="Focus for next week">
            <Textarea value={nextWeekFocus} onChange={(e) => setNextWeekFocus(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <ReviewHistory weekly={recent} />
    </div>
  )
}

function ReviewHistory({ daily = [], weekly = [] }: { daily?: { id: string; day: string; score: number; selfRating: number | null; wentWell: string }[]; weekly?: { id: string; weekStart: string; score: number; highlights: string }[] }) {
  if (daily.length === 0 && weekly.length === 0) return null
  const rows = [
    ...daily.map((r) => ({ key: r.id, when: r.day, title: `Daily review · ${formatDayLabel(r.day)}`, score: r.score, excerpt: r.wentWell })),
    ...weekly.map((r) => ({ key: r.id, when: r.weekStart, title: `Weekly review · w/c ${formatDayLabel(r.weekStart)}`, score: r.score, excerpt: r.highlights })),
  ].sort((a, b) => b.when.localeCompare(a.when))

  return (
    <Card>
      <CardHeader title="Past reviews" description={`${rows.length} saved`} />
      <div className="divide-y divide-border">
        {rows.slice(0, 10).map((row) => (
          <div key={row.key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{row.title}</div>
              {row.excerpt ? (
                <p className="truncate text-xs text-muted-foreground">{row.excerpt}</p>
              ) : null}
            </div>
            {row.score > 0 ? <Badge>{row.score}</Badge> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
