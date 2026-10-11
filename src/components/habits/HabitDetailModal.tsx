import {
  Award,
  Calendar,
  CheckCircle2,
  FileText,
  Flame,
  Percent,
  Sparkles,
} from 'lucide-react'
import { useMemo } from 'react'
import { Badge, Button, Modal } from '@/components/ui'
import { useI18n } from '@/i18n'
import type { DayKey, Habit, HabitEntry, WeekDay } from '@/types'
import { cn } from '@/utils/cn'
import { addDays, formatDayLabel, formatDayNumber, fromDayKey, toDayKey } from '@/utils/date'
import type { StreakResult } from '@/services/streaks'
import { HabitIcon } from './HabitIcon'

interface HabitDetailModalProps {
  open: boolean
  onClose: () => void
  habit: Habit | null
  stats?: StreakResult
  entries: HabitEntry[]
  onOpenNote?: (day: DayKey, currentNote: string, count: number) => void
}

export function HabitDetailModal({
  open,
  onClose,
  habit,
  stats,
  entries,
  onOpenNote,
}: HabitDetailModalProps) {
  const language = useI18n((s) => s.language)
  const isFa = language === 'fa'

  const ownEntries = useMemo(() => {
    if (!habit) return []
    return entries.filter((e) => e.habitId === habit.id)
  }, [entries, habit])

  const entryMap = useMemo(() => {
    const map = new Map<DayKey, HabitEntry>()
    for (const e of ownEntries) {
      map.set(e.day, e)
    }
    return map
  }, [ownEntries])

  // 35 days grid (5 weeks) for history heatmap
  const historyDays = useMemo(() => {
    const list: string[] = []
    for (let i = 34; i >= 0; i--) {
      list.push(toDayKey(addDays(new Date(), -i)))
    }
    return list
  }, [])

  // Day-of-week breakdown (0=Sun, 1=Mon, ..., 6=Sat)
  const dayStats = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0] // index corresponds to date.getDay()
    for (const e of ownEntries) {
      if (e.count > 0) {
        const d = fromDayKey(e.day).getDay()
        counts[d] += e.count
      }
    }
    const max = Math.max(1, ...counts)

    const weekDayOrder: { dayIndex: WeekDay; label: string }[] = isFa
      ? [
          { dayIndex: 6, label: 'شنبه' },
          { dayIndex: 0, label: 'یکشنبه' },
          { dayIndex: 1, label: 'دوشنبه' },
          { dayIndex: 2, label: 'سه‌شنبه' },
          { dayIndex: 3, label: 'چهارشنبه' },
          { dayIndex: 4, label: 'پنج‌شنبه' },
          { dayIndex: 5, label: 'جمعه' },
        ]
      : [
          { dayIndex: 1, label: 'Mon' },
          { dayIndex: 2, label: 'Tue' },
          { dayIndex: 3, label: 'Wed' },
          { dayIndex: 4, label: 'Thu' },
          { dayIndex: 5, label: 'Fri' },
          { dayIndex: 6, label: 'Sat' },
          { dayIndex: 0, label: 'Sun' },
        ]

    const result = weekDayOrder.map((w) => ({
      ...w,
      count: counts[w.dayIndex],
      percent: Math.round((counts[w.dayIndex] / max) * 100),
    }))

    const bestDay = [...result].sort((a, b) => b.count - a.count)[0]

    return { result, bestDay }
  }, [ownEntries, isFa])

  // Recent entries with notes
  const notesEntries = useMemo(() => {
    return ownEntries
      .filter((e) => e.note && e.note.trim().length > 0)
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, 8)
  }, [ownEntries])

  if (!habit) return null

  const target = Math.max(1, habit.target)
  const unitLabel = habit.unit ? ` ${habit.unit}` : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-7 items-center justify-center rounded-lg text-white shadow-sm"
            style={{ backgroundColor: habit.color }}
          >
            <HabitIcon icon={habit.icon} className="size-4" />
          </div>
          <span className="font-semibold">{habit.title}</span>
          <Badge className="ms-2">
            {habit.frequency === 'daily'
              ? isFa
                ? 'روزانه'
                : 'Daily'
              : habit.frequency === 'weekly'
                ? isFa
                  ? 'هفتگی'
                  : 'Weekly'
                : isFa
                  ? 'روزهای مشخص'
                  : 'Custom days'}
          </Badge>
        </div>
      }
      description={
        habit.description ||
        (isFa
          ? `هدف: ${target}${unitLabel} در هر دوره`
          : `Target: ${target}${unitLabel} per period`)
      }
      footer={
        <div className="flex w-full justify-end">
          <Button variant="primary" onClick={onClose}>
            {isFa ? 'بستن' : 'Close'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-500">
              <Flame className="size-4" />
              <span>{isFa ? 'زنجیره فعلی' : 'Current Streak'}</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {stats?.current ?? 0}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                {isFa ? 'روز' : 'days'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-indigo-500">
              <Award className="size-4" />
              <span>{isFa ? 'بهترین رکورد' : 'Best Streak'}</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {stats?.longest ?? 0}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                {isFa ? 'روز' : 'days'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-500">
              <Percent className="size-4" />
              <span>{isFa ? 'پیوستگی و ثبات' : 'Consistency'}</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {stats?.consistency ?? 0}%
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-sky-500">
              <CheckCircle2 className="size-4" />
              <span>{isFa ? 'مجموع ثبت‌ها' : 'Total Logs'}</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {stats?.totalCompletions ?? 0}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                {habit.unit ?? (isFa ? 'مرتبه' : 'times')}
              </span>
            </div>
          </div>
        </div>

        {/* 35-Day Heatmap */}
        <div className="rounded-xl border border-border/70 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Calendar className="size-4 text-muted-foreground" />
              <span>{isFa ? 'تاریخچه ۳۵ روز گذشته' : 'Last 35 Days Heatmap'}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {isFa ? 'برای مشاهده یا ثبت یادداشت کلیک کنید' : 'Click any cell to view note'}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-7">
            {historyDays.map((day) => {
              const entry = entryMap.get(day)
              const count = entry?.count ?? 0
              const hasNote = Boolean(entry?.note && entry.note.trim())
              return (
                <button
                  key={day}
                  type="button"
                  title={`${formatDayLabel(day)} — ${count}/${target}${unitLabel}${hasNote ? `\n📝 ${entry?.note}` : ''}`}
                  onClick={() => onOpenNote?.(day, entry?.note ?? '', count)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs font-medium transition-all hover:scale-105',
                    count >= target ? 'ring-1' : '',
                  )}
                  style={{
                    backgroundColor: count > 0 ? habit.color : undefined,
                    opacity: count > 0 ? 0.35 + (count / target) * 0.65 : 0.7,
                    borderColor: count >= target ? habit.color : 'var(--color-border)',
                  }}
                >
                  <span
                    className={cn(
                      'text-[10px] tabular-nums font-semibold',
                      count > 0 ? 'text-white drop-shadow' : 'text-muted-foreground/60',
                    )}
                  >
                    {formatDayNumber(day)}
                  </span>
                  {count > 0 ? (
                    <span className="text-[9px] font-bold text-white drop-shadow">
                      {count}
                    </span>
                  ) : null}
                  {hasNote ? (
                    <span className="absolute top-1 end-1 size-1.5 rounded-full bg-amber-400 ring-1 ring-background" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* Best Day of Week Breakdown */}
        <div className="rounded-xl border border-border/70 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="size-4 text-amber-400" />
              <span>{isFa ? 'بهترین روزهای هفته' : 'Day of Week Breakdown'}</span>
            </div>
            {dayStats.bestDay.count > 0 ? (
              <span className="text-[11px] font-medium text-accent">
                {isFa
                  ? `بهترین روز: ${dayStats.bestDay.label} با ${dayStats.bestDay.count} ثبت`
                  : `Peak day: ${dayStats.bestDay.label} (${dayStats.bestDay.count} logs)`}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {dayStats.result.map((d) => (
              <div key={d.label} className="flex flex-col items-center gap-1.5">
                <div className="h-16 w-full flex items-end justify-center rounded-md bg-muted/40 p-1">
                  <div
                    className="w-full rounded transition-all"
                    style={{
                      height: `${Math.max(8, d.percent)}%`,
                      backgroundColor: d.count > 0 ? habit.color : 'transparent',
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {d.label}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-foreground">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Journal Notes */}
        {notesEntries.length > 0 ? (
          <div className="rounded-xl border border-border/70 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              <span>{isFa ? 'یادداشت‌ها و خاطرات اخیر' : 'Recent Journal Notes'}</span>
            </div>
            <div className="mt-2.5 divide-y divide-border/50">
              {notesEntries.map((e) => (
                <div
                  key={e.id}
                  onClick={() => onOpenNote?.(e.day, e.note, e.count)}
                  className="group flex cursor-pointer items-start justify-between py-2 text-xs transition-colors hover:text-accent"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground group-hover:text-accent">
                      {e.note}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDayLabel(e.day)} · {e.count}/{target}{unitLabel}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {isFa ? 'ویرایش' : 'Edit'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
