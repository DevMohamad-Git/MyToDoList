import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart2,
  Calendar,
  Check,
  FileText,
  Flame,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Menu,
  Modal,
  OptionSelect,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Textarea,
  toast,
} from '@/components/ui'
import { useI18n } from '@/i18n'
import { ENTITY_COLORS } from '@/config/constants'
import { habitStatsMap } from '@/services/analytics'
import { isHabitDue } from '@/services/streaks'
import { habitRepo } from '@/storage/habitRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import {
  HABIT_FREQUENCIES,
  type DayKey,
  type Habit,
  type HabitFrequency,
  type WeekDay,
} from '@/types'
import { cn } from '@/utils/cn'
import {
  addDays,
  dayKeysBetween,
  formatDayLabel,
  formatDayNumber,
  fromDayKey,
  monthRange,
  startOfDay,
  toDayKey,
  toPersianDigits,
} from '@/utils/date'
import { fireConfetti } from '@/utils/confetti'
import { HabitIcon, HabitIconPicker } from '@/components/habits/HabitIcon'
import { HabitDetailModal } from '@/components/habits/HabitDetailModal'
import { HabitNoteModal } from '@/components/habits/HabitNoteModal'

/** Helper for column headers: full weekday names ('چهارشنبه', 'پنج‌شنبه', ...) and dates */
function getDayColumnMeta(day: DayKey, today: DayKey, isFa: boolean) {
  const d = fromDayKey(day)
  const isToday = day === today
  const tomorrowKey = toDayKey(addDays(fromDayKey(today), 1))
  const isTomorrow = day === tomorrowKey
  const yesterdayKey = toDayKey(addDays(fromDayKey(today), -1))
  const isYesterday = day === yesterdayKey

  const dayIdx = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const faWeekdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه']
  const enFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const headerLabel = isFa ? faWeekdays[dayIdx] : enFull[dayIdx]

  const dayNum = formatDayNumber(day)
  const formattedDayNum = isFa ? toPersianDigits(String(dayNum)) : String(dayNum)

  return {
    isToday,
    isTomorrow,
    isYesterday,
    headerLabel,
    fullWeekday: isFa ? faWeekdays[dayIdx] : enFull[dayIdx],
    dayNum: formattedDayNum,
  }
}

/**
 * Enhanced Habit Tracking System (Phase 1 & Phase 2).
 *
 * Includes:
 * - 14-day interactive click-to-log grid with note indicators and right-click/double-click journaling
 * - Custom icons, colors, and target units (pages, glasses, mins, km, etc.)
 * - Top daily completion progress bar with motivational feedback
 * - Live search, status filters (All, Due Today, Done, Pending), and sorting options
 * - Manual reordering (Move Up / Move Down)
 * - Daily reflection & journaling modal (`HabitNoteModal`)
 * - Deep dive stats & 35-day heatmap modal (`HabitDetailModal`)
 * - Milestone celebration with confetti effects
 */
export function HabitsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()
  const language = useI18n((s) => s.language)
  const isFa = language === 'fa'

  const [view, setView] = useState<'active' | 'archived'>('active')
  const [filter, setFilter] = useState<'all' | 'due' | 'done' | 'pending'>('all')
  const [sortBy, setSortBy] = useState<'order' | 'streak' | 'consistency' | 'title'>('order')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [deleting, setDeleting] = useState<Habit | null>(null)
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null)

  const [noteState, setNoteState] = useState<{
    open: boolean
    habit: Habit | null
    day: DayKey
    note: string
    count: number
  }>({
    open: false,
    habit: null,
    day: toDayKey(new Date()),
    note: '',
    count: 0,
  })

  const [timeHorizon, setTimeHorizon] = useState<'endOfMonth' | 'week' | 'past'>('endOfMonth')

  const habits = useLiveQuery(() => habitRepo.list(workspaceId, true), [workspaceId]) ?? []
  const statsById = useMemo(() => (snapshot ? habitStatsMap(snapshot) : new Map()), [snapshot])

  const visible = view === 'active' ? habits.filter((h) => !h.archived) : habits.filter((h) => h.archived)
  const today = toDayKey(new Date())

  const gridDays = useMemo(() => {
    const now = new Date()
    if (timeHorizon === 'endOfMonth') {
      // Days from Today until the end of current month
      const { end: monthEnd } = monthRange(now)
      const days = dayKeysBetween(startOfDay(now), monthEnd)
      // If fewer than 7 days left in the month, keep at least 7 days ahead
      if (days.length < 7) {
        const extra = 7 - days.length
        const lastDay = days.length > 0 ? fromDayKey(days[days.length - 1]) : now
        for (let i = 1; i <= extra; i++) {
          days.push(toDayKey(addDays(lastDay, i)))
        }
      }
      return days
    } else if (timeHorizon === 'week') {
      const out: string[] = []
      for (let i = 0; i < 7; i++) {
        out.push(toDayKey(addDays(now, i)))
      }
      return out
    } else {
      // Past history: 14 days ending Today
      const out: string[] = []
      for (let i = 13; i >= 0; i--) {
        out.push(toDayKey(addDays(now, -i)))
      }
      return out
    }
  }, [timeHorizon])

  const entries = snapshot?.habitEntries ?? []
  const countFor = (habitId: string, day: string) =>
    entries.filter((e) => e.habitId === habitId && e.day === day).reduce((acc, e) => acc + e.count, 0)

  const entryFor = (habitId: string, day: string) =>
    entries.find((e) => e.habitId === habitId && e.day === day)

  // Today's summary progress
  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits])
  const dueTodayHabits = useMemo(
    () => activeHabits.filter((h) => isHabitDue(h, new Date())),
    [activeHabits],
  )
  const completedTodayHabits = useMemo(
    () => dueTodayHabits.filter((h) => countFor(h.id, today) >= Math.max(1, h.target)),
    [dueTodayHabits, entries, today],
  )
  const todayProgressPercent =
    dueTodayHabits.length > 0
      ? Math.round((completedTodayHabits.length / dueTodayHabits.length) * 100)
      : 0

  // Filter & Search & Sort
  const filteredHabits = useMemo(() => {
    let list = visible

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          (h.description && h.description.toLowerCase().includes(q)),
      )
    }

    if (view === 'active') {
      if (filter === 'due') {
        list = list.filter((h) => isHabitDue(h, new Date()))
      } else if (filter === 'done') {
        list = list.filter(
          (h) => isHabitDue(h, new Date()) && countFor(h.id, today) >= Math.max(1, h.target),
        )
      } else if (filter === 'pending') {
        list = list.filter(
          (h) => isHabitDue(h, new Date()) && countFor(h.id, today) < Math.max(1, h.target),
        )
      }
    }

    if (sortBy === 'streak') {
      list = [...list].sort(
        (a, b) => (statsById.get(b.id)?.current ?? 0) - (statsById.get(a.id)?.current ?? 0),
      )
    } else if (sortBy === 'consistency') {
      list = [...list].sort(
        (a, b) => (statsById.get(b.id)?.consistency ?? 0) - (statsById.get(a.id)?.consistency ?? 0),
      )
    } else if (sortBy === 'title') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    }

    return list
  }, [visible, search, filter, view, sortBy, statsById, entries, today])

  async function cycle(habit: Habit, day: string) {
    const target = Math.max(1, habit.target)
    const prevCount = countFor(habit.id, day)
    const next = await habitRepo.cycle(workspaceId, habit.id, day, target)
    const unitText = habit.unit ? ` ${habit.unit}` : ''

    if (next === target) {
      toast.success(
        isFa
          ? `عادت «${habit.title}» برای ${formatDayLabel(day)} ثبت شد (${next}/${target}${unitText})`
          : `“${habit.title}” logged for ${formatDayLabel(day)} (${next}/${target}${unitText})`,
      )

      if (day === today) {
        // Check if all today's due habits are completed!
        const willBeAllDone = dueTodayHabits.every((h) => {
          if (h.id === habit.id) return next >= target
          return countFor(h.id, today) >= Math.max(1, h.target)
        })

        if (willBeAllDone && dueTodayHabits.length > 0) {
          fireConfetti(120)
          toast.success(
            isFa
              ? '🎉 فوق‌العاده است! تمام عادت‌های امروز را با موفقیت تکمیل کردید!'
              : '🎉 Incredible! You completed all planned habits for today!',
          )
        } else {
          // Check milestone streak
          const stats = statsById.get(habit.id)
          const newStreak = (stats?.current ?? 0) + (prevCount < target ? 1 : 0)
          if ([7, 14, 21, 30, 50, 100, 365].includes(newStreak)) {
            fireConfetti(90)
            toast.success(
              isFa
                ? `🔥 تبریک! به رکورد زنجیره ${newStreak} روزه در «${habit.title}» رسیدید!`
                : `🔥 Outstanding! You hit a ${newStreak}-day streak in “${habit.title}”!`,
            )
          }
        }
      }
    }
  }

  function openNote(habit: Habit, day: DayKey) {
    const entry = entryFor(habit.id, day)
    setNoteState({
      open: true,
      habit,
      day,
      note: entry?.note ?? '',
      count: countFor(habit.id, day),
    })
  }

  async function saveNote(note: string) {
    if (!noteState.habit) return
    await habitRepo.setEntryNote(workspaceId, noteState.habit.id, noteState.day, note)
    toast.success(isFa ? 'یادداشت با موفقیت ذخیره شد' : 'Note saved successfully')
  }

  async function handleMove(habitId: string, direction: 'up' | 'down') {
    await habitRepo.move(workspaceId, habitId, direction)
    toast.success(isFa ? 'ترتیب عادت به‌روزرسانی شد' : 'Habit order updated')
  }

  async function confirmDelete() {
    if (!deleting) return
    await habitRepo.remove(deleting.id)
    toast.success(isFa ? `عادت «${deleting.title}» حذف شد` : `Deleted “${deleting.title}”`)
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title={isFa ? 'عادت‌ها' : 'Habits'}
        description={
          isFa
            ? 'اقدامات خُرد و مکرر؛ ردیابی روزانه با زنجیره‌هایی که هرگز امروز ناتمام را جریمه نمی‌کنند.'
            : 'Small repeated actions, tracked by day with streaks that never punish an unfinished today.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Link to="/assistant?prompt=%D9%85%DB%8C%E2%80%8C%D8%AE%D9%88%D8%A7%D9%85%20%DB%8C%DA%A9%20%D8%B9%D8%A7%D8%AF%D8%AA%20%D8%AC%D8%AF%DB%8C%D8%AF%20%D8%A8%D8%B3%D8%A7%D8%B2%D9%85">
              <Button variant="secondary" className="gap-1.5 text-accent">
                <Sparkles className="size-4" />
                <span>{isFa ? 'با دستیار' : 'With Assistant'}</span>
              </Button>
            </Link>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {isFa ? 'عادت جدید' : 'New habit'}
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------ Today's Progress Banner -- */}
      {view === 'active' && activeHabits.length > 0 ? (
        <Card className="mb-4 overflow-hidden border-accent/25 bg-linear-to-r from-accent/10 via-card to-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent ring-1 ring-accent/30">
                {todayProgressPercent === 100 ? (
                  <Trophy className="size-6 text-amber-400" />
                ) : (
                  <Sparkles className="size-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {isFa ? 'پیشرفت عادات امروز' : "Today's Habits Progress"}
                  </h2>
                  <Badge
                    className={
                      todayProgressPercent === 100
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-accent/30 bg-accent/10 text-accent'
                    }
                  >
                    {todayProgressPercent}%
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {todayProgressPercent === 100
                    ? isFa
                      ? 'عالیه! تمام عادت‌های موعد امروز با موفقیت کامل شدند 🎉'
                      : 'Phenomenal! All habits due today are completed 🎉'
                    : isFa
                      ? `${completedTodayHabits.length} از ${dueTodayHabits.length} عادت موعد امروز انجام شده است.`
                      : `${completedTodayHabits.length} of ${dueTodayHabits.length} habits due today completed.`}
                </p>
              </div>
            </div>

            <div className="flex w-full sm:w-56 flex-col gap-1.5">
              <div className="flex justify-between text-[11px] font-medium text-muted-foreground tabular-nums">
                <span>{isFa ? 'هدف روز' : 'Daily Goal'}</span>
                <span>
                  {completedTodayHabits.length} / {dueTodayHabits.length}
                </span>
              </div>
              <ProgressBar
                value={todayProgressPercent}
                barClassName={todayProgressPercent === 100 ? 'bg-emerald-500' : 'bg-accent'}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------- Filters & Search Toolbar -- */}
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        {/* Right side controls in RTL: Tabs, Filter Chips, Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            options={[
              { value: 'active', label: isFa ? 'فعال' : 'Active' },
              { value: 'archived', label: isFa ? 'بایگانی' : 'Archived' },
            ]}
            onChange={setView}
          />

          {view === 'active' ? (
            <>
              {/* Status Filter Chips */}
              <div className="flex items-center gap-1 text-xs">
                {(
                  [
                    { id: 'all', label: isFa ? 'همه' : 'All' },
                    { id: 'due', label: isFa ? 'موعد امروز' : 'Due Today' },
                    { id: 'done', label: isFa ? 'تکمیل‌شده' : 'Done' },
                    { id: 'pending', label: isFa ? 'باقی‌مانده' : 'Pending' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                      filter === f.id
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground outline-none cursor-pointer hover:border-accent hover:text-foreground"
              >
                <option value="order">{isFa ? 'ترتیب: پیش‌فرض' : 'Sort: Default'}</option>
                <option value="streak">{isFa ? 'ترتیب: بیشترین استریک' : 'Sort: Highest Streak'}</option>
                <option value="consistency">{isFa ? 'ترتیب: بالاترین پایداری' : 'Sort: Consistency'}</option>
                <option value="title">{isFa ? 'ترتیب: الفبا' : 'Sort: Name'}</option>
              </select>
            </>
          ) : null}
        </div>

        {/* Search Input: Fills all the remaining space */}
        <div className="relative flex-1 min-w-44">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isFa ? 'جستجوی عادت…' : 'Search habits…'}
            className="w-full rounded-lg border border-border bg-card ps-8 pe-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none transition-colors"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* ---------------------------------------------------------- Content -- */}
      {!snapshot ? (
        <LoadingState label={isFa ? 'در حال بارگذاری عادات…' : 'Loading habits…'} />
      ) : filteredHabits.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-8" />}
          title={
            view === 'archived'
              ? isFa
                ? 'موردی در بایگانی نیست'
                : 'Nothing archived'
              : search || filter !== 'all'
                ? isFa
                  ? 'عادت منطبقی یافت نشد'
                  : 'No matching habits found'
                : isFa
                  ? 'هنوز عادتی ثبت نشده'
                  : 'No habits yet'
          }
          description={
            isFa
              ? 'عادت‌ها شمارنده‌های ساده روزانه‌اند: هدف مشخص کنید، روی گرید کلیک کنید و رشد زنجیره خود را تماشا کنید.'
              : 'Habits are simple counters per day: set a target, click the grid, and watch the streak grow.'
          }
          action={
            view === 'active' && !search && filter === 'all' ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {isFa ? 'عادت جدید' : 'New habit'}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredHabits.map((habit) => {
            const stats = statsById.get(habit.id)
            const dueToday = isHabitDue(habit, new Date())
            const todayCount = countFor(habit.id, today)
            const target = Math.max(1, habit.target)
            const doneToday = todayCount >= target
            const unitLabel = habit.unit ? ` ${habit.unit}` : ''
            const todayEntry = entryFor(habit.id, today)
            const hasTodayNote = Boolean(todayEntry?.note && todayEntry.note.trim())

            return (
              <Card key={habit.id} className="transition-all hover:border-border/90">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2.5">
                      <div
                        className="flex size-7 items-center justify-center rounded-lg text-white shadow-xs"
                        style={{ backgroundColor: habit.color }}
                      >
                        <HabitIcon icon={habit.icon} className="size-4" />
                      </div>
                      <span className="font-semibold text-foreground">{habit.title}</span>
                      {habit.target > 1 || habit.unit ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          ({habit.target}
                          {unitLabel})
                        </span>
                      ) : null}
                      {!habit.archived && !dueToday ? (
                        <Badge>{isFa ? 'امروز موعد نیست' : 'Not due today'}</Badge>
                      ) : null}
                      {habit.archived ? <Badge>{isFa ? 'بایگانی' : 'Archived'}</Badge> : null}
                    </span>
                  }
                  description={habit.description || undefined}
                  icon={<Flame className="size-4" />}
                  actions={
                    <>
                      {/* Streak Badge */}
                      {stats && stats.current > 0 ? (
                        <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                          <Flame className="size-3" />
                          {stats.current}
                          {isFa ? ' روز زنجیره' : 'd streak'} · {isFa ? 'بهترین ' : 'best '}
                          {stats.longest}
                        </Badge>
                      ) : null}

                      {/* Quick Today Note Button */}
                      {!habit.archived ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={
                            hasTodayNote
                              ? isFa
                                ? `یادداشت امروز: ${todayEntry?.note}`
                                : `Today's note: ${todayEntry?.note}`
                              : isFa
                                ? 'افزودن یادداشت برای امروز'
                                : "Add today's note"
                          }
                          onClick={() => openNote(habit, today)}
                          className={cn(
                            'text-xs',
                            hasTodayNote ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground',
                          )}
                        >
                          <FileText className="size-3.5" />
                          <span className="hidden md:inline">
                            {hasTodayNote ? (isFa ? 'یادداشت دارد' : 'Note') : isFa ? 'یادداشت' : 'Note'}
                          </span>
                        </Button>
                      ) : null}

                      {/* Log Today Button */}
                      {!habit.archived ? (
                        <Button
                          size="sm"
                          variant={doneToday ? 'secondary' : 'primary'}
                          onClick={() => void cycle(habit, today)}
                        >
                          <Check className="size-3.5" />
                          {doneToday
                            ? isFa
                              ? `انجام شد ${todayCount}/${target}${unitLabel}`
                              : `Done ${todayCount}/${target}${unitLabel}`
                            : isFa
                              ? `ثبت امروز (${todayCount}/${target}${unitLabel})`
                              : `Log today (${todayCount}/${target}${unitLabel})`}
                        </Button>
                      ) : null}

                      {/* Actions Menu */}
                      <Menu
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${habit.title}`}>
                            <span className="text-xs leading-none tracking-widest">•••</span>
                          </Button>
                        }
                        items={[
                          {
                            label: isFa ? 'آمار و تاریخچه کامل' : 'View full stats & history',
                            onSelect: () => setDetailHabit(habit),
                          },
                          {
                            label: isFa ? 'یادداشت امروز' : "Today's note",
                            onSelect: () => openNote(habit, today),
                          },
                          {
                            label: isFa ? 'انتقال به بالا' : 'Move up',
                            onSelect: () => void handleMove(habit.id, 'up'),
                          },
                          {
                            label: isFa ? 'انتقال به پایین' : 'Move down',
                            onSelect: () => void handleMove(habit.id, 'down'),
                          },
                          {
                            label: isFa ? 'ویرایش' : 'Edit',
                            onSelect: () => setEditing(habit),
                          },
                          {
                            label: habit.archived
                              ? isFa
                                ? 'بازیابی'
                                : 'Restore'
                              : isFa
                                ? 'بایگانی'
                                : 'Archive',
                            onSelect: () => void habitRepo.update(habit.id, { archived: !habit.archived }),
                          },
                          {
                            label: isFa ? 'حذف' : 'Delete',
                            danger: true,
                            separated: true,
                            onSelect: () => setDeleting(habit),
                          },
                        ]}
                      />
                    </>
                  }
                />

                <CardBody>
                  {/* Modern Day-by-Day Calendar Grid */}
                  <div className="overflow-x-auto pb-1.5">
                    <div
                      className="inline-grid gap-[14px] justify-items-center min-w-fit"
                      style={{
                        gridTemplateColumns: `repeat(${gridDays.length}, minmax(56px, 64px))`,
                      }}
                    >
                    {gridDays.map((day) => {
                      const count = countFor(habit.id, day)
                      const due = isHabitDue(habit, fromDayKey(day))
                      const entry = entryFor(habit.id, day)
                      const hasNote = Boolean(entry?.note && entry.note.trim())
                      const meta = getDayColumnMeta(day, today, isFa)
                      const done = count >= target

                      return (
                        <div key={day} className="flex flex-col items-center gap-1.5 min-w-0">
                          {/* Column Header: Full Weekday Name (e.g. چهارشنبه) + 'امروز' badge if today */}
                          <div className="flex flex-col items-center text-center select-none w-full min-h-10 justify-end pb-0.5">
                            <span
                              className={cn(
                                'text-xs font-semibold tracking-tight transition-colors truncate max-w-full',
                                meta.isToday
                                  ? 'text-accent font-bold scale-105'
                                  : 'text-muted-foreground/90',
                              )}
                              title={meta.fullWeekday}
                            >
                              {meta.headerLabel}
                            </span>
                            {meta.isToday ? (
                              <span className="mt-0.5 inline-block rounded-full bg-accent/15 px-1.5 py-0.2 text-[9px] font-bold text-accent leading-tight">
                                {isFa ? 'امروز' : 'Today'}
                              </span>
                            ) : (
                              <span className="mt-0.5 inline-block text-[9px] text-transparent leading-tight select-none">
                                ·
                              </span>
                            )}
                          </div>

                          {/* Compact Interactive Cell Button */}
                          <button
                            type="button"
                            title={`${formatDayLabel(day)} (${meta.fullWeekday}) — ${count}/${target}${unitLabel}${
                              due ? '' : isFa ? ' (غیرموعد)' : ' (not due)'
                            }${hasNote ? `\n📝 ${entry?.note}` : ''}\n${
                              isFa ? 'کلیک: ثبت/حذف · دوبار کلیک: یادداشت' : 'Click: log/undo · Double-click: note'
                            }`}
                            onClick={() => void cycle(habit, day)}
                            onDoubleClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              openNote(habit, day)
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              openNote(habit, day)
                            }}
                            className={cn(
                              'group relative flex size-10 sm:size-11 flex-col items-center justify-center rounded-xl border font-semibold transition-all duration-150 cursor-pointer shrink-0 shadow-2xs',
                              // Completed
                              done
                                ? 'text-white shadow-xs hover:scale-105 hover:brightness-105'
                                : count > 0
                                  ? 'text-foreground hover:scale-105'
                                  : meta.isToday
                                    ? 'border-accent/60 bg-accent/5 ring-2 ring-accent/25 hover:bg-accent/15 hover:border-accent text-accent'
                                    : 'border-border/80 bg-card/60 hover:border-border hover:bg-muted/40 text-muted-foreground',
                              // Not due
                              !due && !done && 'opacity-35 border-dashed',
                            )}
                            style={{
                              backgroundColor: done ? habit.color : count > 0 ? `${habit.color}2b` : undefined,
                              borderColor: done ? habit.color : count > 0 ? habit.color : undefined,
                            }}
                          >
                            {/* Inside cell: Date is ALWAYS visible! */}
                            {done ? (
                              <div className="flex flex-col items-center justify-center -space-y-0.5">
                                <Check className="size-3.5 text-white stroke-[3] drop-shadow-xs" />
                                <span className="text-[11px] font-bold text-white tabular-nums drop-shadow-xs leading-none">
                                  {meta.dayNum}
                                </span>
                              </div>
                            ) : count > 0 ? (
                              <div className="flex flex-col items-center justify-center -space-y-0.5">
                                <span className="text-[10px] font-bold text-accent tabular-nums leading-none">
                                  {isFa ? toPersianDigits(String(count)) : count}
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums leading-none">
                                  {meta.dayNum}
                                </span>
                              </div>
                            ) : (
                              <span
                                className={cn(
                                  'text-xs font-semibold tabular-nums transition-colors',
                                  meta.isToday
                                    ? 'text-accent font-bold'
                                    : 'text-foreground/80 group-hover:text-foreground',
                                )}
                              >
                                {meta.dayNum}
                              </span>
                            )}

                            {/* Amber Dot for Attached Notes */}
                            {hasNote ? (
                              <span
                                className="absolute top-1 end-1 size-1.5 rounded-full bg-amber-400 ring-1 ring-background shadow-xs"
                                title={isFa ? 'دارای یادداشت' : 'Has note'}
                              />
                            ) : null}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Card Sub-footer with horizon controls & tips */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground/80 flex items-center gap-1">
                        <Calendar className="size-3.5 text-accent" />
                        <span>
                          {timeHorizon === 'endOfMonth'
                            ? isFa
                              ? `روزهای پیش‌رو تا پایان ماه (${toPersianDigits(String(gridDays.length))} روز)`
                              : `Days until end of month (${gridDays.length}d)`
                            : timeHorizon === 'week'
                              ? isFa
                                ? 'هفته پیش‌رو (۷ روز از امروز)'
                                : 'Next 7 days (from today)'
                              : isFa
                                ? '۱۴ روز گذشته (تاریخچه)'
                                : 'Last 14 days (history)'}
                        </span>
                      </span>

                      <span className="opacity-30">|</span>

                      {/* Horizon Toggle */}
                      {timeHorizon === 'endOfMonth' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setTimeHorizon('week')}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                          >
                            {isFa ? 'نمایش فقط ۷ روز' : 'Show 7 days'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimeHorizon('past')}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                          >
                            {isFa ? 'مشاهده روزهای گذشته' : 'View past days'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTimeHorizon('endOfMonth')}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        >
                          {isFa ? 'بازگشت به روزهای تا پایان ماه' : 'Back to end of month'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetailHabit(habit)}
                        className="text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <BarChart2 className="size-3.5" />
                        <span>{isFa ? 'آمار عمیق و تقویم ۳۵ روزه' : 'Deep Stats & 35d Heatmap'}</span>
                      </button>
                      <span className="opacity-30">·</span>
                      <span>
                        {stats?.totalCompletions ?? 0} {habit.unit ?? (isFa ? 'ثبت' : 'logs')} ·{' '}
                        {stats?.consistency ?? 0}% {isFa ? 'پایداری' : 'consistency'}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------ Habit Modal (Create/Edit) -- */}
      <HabitModal
        open={createOpen || editing != null}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        habit={editing}
      />

      {/* ------------------------------------------------ Habit Detail Modal -- */}
      <HabitDetailModal
        open={detailHabit != null}
        onClose={() => setDetailHabit(null)}
        habit={detailHabit}
        stats={detailHabit ? statsById.get(detailHabit.id) : undefined}
        entries={entries}
        onOpenNote={(day, currentNote, count) => {
          if (detailHabit) {
            setNoteState({
              open: true,
              habit: detailHabit,
              day,
              note: currentNote,
              count,
            })
          }
        }}
      />

      {/* ------------------------------------------------ Habit Note Modal -- */}
      <HabitNoteModal
        open={noteState.open}
        onClose={() => setNoteState((s) => ({ ...s, open: false }))}
        habit={noteState.habit}
        day={noteState.day}
        currentNote={noteState.note}
        count={noteState.count}
        target={noteState.habit?.target ?? 1}
        unit={noteState.habit?.unit}
        onSave={saveNote}
      />

      {/* ------------------------------------------------ Delete Confirm Dialog -- */}
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={isFa ? 'حذف عادت؟' : 'Delete habit?'}
        message={
          deleting ? (
            isFa ? (
              <>عادت «{deleting.title}» و تمام تاریخچه ثبت‌های آن برای همیشه حذف خواهد شد.</>
            ) : (
              <>“{deleting.title}” and its entire history will be removed permanently.</>
            )
          ) : null
        }
      />
    </>
  )
}

export function HabitModal({
  open,
  onClose,
  habit,
}: {
  open: boolean
  onClose: () => void
  habit: Habit | null
}) {
  const workspaceId = useWorkspaceId()
  const language = useI18n((s) => s.language)
  const isFa = language === 'fa'

  const [title, setTitle] = useState(habit?.title ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [icon, setIcon] = useState(habit?.icon ?? 'repeat')
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'daily')
  const [target, setTarget] = useState(String(habit?.target ?? 1))
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [weekDays, setWeekDays] = useState<WeekDay[]>(habit?.weekDays ?? [1, 3, 5])
  const [color, setColor] = useState(habit?.color ?? ENTITY_COLORS[6])
  const [busy, setBusy] = useState(false)

  // Re-seed form on habit change
  const seedKey = habit?.id ?? 'new'
  const [lastSeed, setLastSeed] = useState(seedKey)
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey)
    setTitle(habit?.title ?? '')
    setDescription(habit?.description ?? '')
    setIcon(habit?.icon ?? 'repeat')
    setFrequency(habit?.frequency ?? 'daily')
    setTarget(String(habit?.target ?? 1))
    setUnit(habit?.unit ?? '')
    setWeekDays(habit?.weekDays ?? [1, 3, 5])
    setColor(habit?.color ?? ENTITY_COLORS[6])
  }

  const DAY_LABELS: { value: WeekDay; label: string }[] = isFa
    ? [
        { value: 6, label: 'ش' },
        { value: 0, label: 'ی' },
        { value: 1, label: 'د' },
        { value: 2, label: 'س' },
        { value: 3, label: 'چ' },
        { value: 4, label: 'پ' },
        { value: 5, label: 'ج' },
      ]
    : [
        { value: 1, label: 'Mon' },
        { value: 2, label: 'Tue' },
        { value: 3, label: 'Wed' },
        { value: 4, label: 'Thu' },
        { value: 5, label: 'Fri' },
        { value: 6, label: 'Sat' },
        { value: 0, label: 'Sun' },
      ]

  const UNIT_SUGGESTIONS = isFa
    ? ['صفحه', 'لیوان', 'دقیقه', 'کیلومتر', 'بار', 'تکرار']
    : ['pages', 'glasses', 'mins', 'km', 'times', 'reps']

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        icon,
        frequency,
        target: Math.max(1, Number(target) || 1),
        unit: unit.trim(),
        weekDays: frequency === 'custom' ? [...weekDays].sort() : [],
        color,
      }
      if (habit) {
        await habitRepo.update(habit.id, input)
        toast.success(isFa ? 'عادت با موفقیت ویرایش شد' : 'Habit updated')
      } else {
        await habitRepo.create(workspaceId, input)
        toast.success(isFa ? 'عادت جدید با موفقیت ایجاد شد' : 'Habit created')
      }
      onClose()
    } catch (error) {
      toast.error((error as Error).message || (isFa ? 'خطا در ذخیره عادت' : 'Could not save the habit'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? (isFa ? 'ویرایش عادت' : 'Edit habit') : isFa ? 'عادت جدید' : 'New habit'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {isFa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {habit ? (isFa ? 'ذخیره تغییرات' : 'Save') : isFa ? 'ایجاد عادت' : 'Create habit'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label={isFa ? 'عنوان عادت' : 'Title'} required htmlFor="nh-title">
          <Input
            id="nh-title"
            autoFocus
            value={title}
            placeholder={isFa ? 'مثلاً: مطالعه ۲۰ صفحه کتاب' : 'Read 20 pages'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label={isFa ? 'توضیحات (اختیاری)' : 'Description'} htmlFor="nh-desc">
          <Textarea
            id="nh-desc"
            rows={2}
            value={description}
            placeholder={isFa ? 'جزئیات یا هدف شکل‌گیری این عادت...' : 'Optional details or motivation'}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {/* Icon Picker */}
        <Field label={isFa ? 'آیکون عادت' : 'Habit Icon'}>
          <HabitIconPicker value={icon} onChange={setIcon} language={language} />
        </Field>

        {/* Frequency & Target & Unit */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={isFa ? 'دوره تکرار' : 'Frequency'}>
            <OptionSelect
              value={frequency}
              onChange={setFrequency}
              options={HABIT_FREQUENCIES.map((f) => ({
                value: f,
                label:
                  f === 'daily'
                    ? isFa
                      ? 'روزانه'
                      : 'Daily'
                    : f === 'weekly'
                      ? isFa
                        ? 'هفتگی'
                        : 'Weekly'
                      : isFa
                        ? 'روزهای مشخص'
                        : 'Custom days',
              }))}
            />
          </Field>

          <Field
            label={
              frequency === 'weekly'
                ? isFa
                  ? 'هدف در هفته'
                  : 'Target per week'
                : isFa
                  ? 'هدف در روز'
                  : 'Target per day'
            }
          >
            <Input
              type="number"
              min={1}
              max={100}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>

          <Field label={isFa ? 'واحد اندازه‌گیری' : 'Unit'}>
            <Input
              value={unit}
              placeholder={isFa ? 'مثلاً: صفحه، لیوان' : 'e.g. pages, mins'}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
        </div>

        {/* Quick Unit Chips */}
        <div className="flex flex-wrap items-center gap-1.5 -mt-1 text-xs">
          <span className="text-[11px] text-muted-foreground">{isFa ? 'پیشنهادها:' : 'Suggestions:'}</span>
          {UNIT_SUGGESTIONS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={cn(
                'rounded-md border border-border/60 px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent',
                unit === u ? 'border-accent bg-accent/10 text-accent font-semibold' : 'text-muted-foreground',
              )}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Custom Days */}
        {frequency === 'custom' ? (
          <Field label={isFa ? 'روزهای موعد در هفته' : 'Days due'}>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d) => {
                const selected = weekDays.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() =>
                      setWeekDays((cur) =>
                        selected ? cur.filter((x) => x !== d.value) : [...cur, d.value],
                      )
                    }
                    className={cn(
                      'rounded-md border px-3 py-1 text-xs transition-colors',
                      selected
                        ? 'border-accent bg-accent/10 text-accent font-semibold'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>
        ) : null}

        {/* Color Palette */}
        <Field label={isFa ? 'رنگ تم کارت' : 'Colour'}>
          <div className="flex flex-wrap gap-2">
            {ENTITY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className="size-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? 'var(--color-foreground)' : 'transparent',
                }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
