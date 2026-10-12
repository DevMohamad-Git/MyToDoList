import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart2,
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
import { addDays, formatDayLabel, formatDayNumber, fromDayKey, toDayKey } from '@/utils/date'
import { fireConfetti } from '@/utils/confetti'
import { HabitIcon, HabitIconPicker } from '@/components/habits/HabitIcon'
import { HabitDetailModal } from '@/components/habits/HabitDetailModal'
import { HabitNoteModal } from '@/components/habits/HabitNoteModal'

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

  const habits = useLiveQuery(() => habitRepo.list(workspaceId, true), [workspaceId]) ?? []
  const statsById = useMemo(() => (snapshot ? habitStatsMap(snapshot) : new Map()), [snapshot])

  const visible = view === 'active' ? habits.filter((h) => !h.archived) : habits.filter((h) => h.archived)
  const today = toDayKey(new Date())

  const gridDays = useMemo(() => {
    const out: string[] = []
    for (let i = 13; i >= 0; i--) out.push(toDayKey(addDays(new Date(), -i)))
    return out
  }, [])

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
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {isFa ? 'عادت جدید' : 'New habit'}
          </Button>
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          value={view}
          options={[
            { value: 'active', label: isFa ? 'فعال' : 'Active' },
            { value: 'archived', label: isFa ? 'بایگانی' : 'Archived' },
          ]}
          onChange={setView}
        />

        {view === 'active' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-40 sm:min-w-48">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isFa ? 'جستجوی عادت…' : 'Search habits…'}
                className="w-full rounded-lg border border-border bg-card ps-8 pe-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              ) : null}
            </div>

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
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
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
          </div>
        ) : null}
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
                  {/* 14-day Click-to-Log Grid */}
                  <div
                    className="grid grid-cols-14 gap-1.5"
                    style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}
                  >
                    {gridDays.map((day) => {
                      const count = countFor(habit.id, day)
                      const due = isHabitDue(habit, fromDayKey(day))
                      const entry = entryFor(habit.id, day)
                      const hasNote = Boolean(entry?.note && entry.note.trim())

                      return (
                        <button
                          key={day}
                          type="button"
                          title={`${formatDayLabel(day)} — ${count}/${target}${unitLabel}${
                            due ? '' : isFa ? ' (غیرموعد)' : ' (not due)'
                          }${hasNote ? `\n📝 ${entry?.note}` : ''}\n${
                            isFa ? 'دوبار کلیک یا کلیک راست: یادداشت روز' : 'Double click / Right click: Day note'
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
                            'group relative flex aspect-square items-center justify-center rounded-lg border text-[10px] font-semibold transition-all hover:scale-105',
                            !due && 'opacity-30',
                          )}
                          style={{
                            backgroundColor: count > 0 ? habit.color : undefined,
                            opacity: count > 0 ? 0.35 + (count / target) * 0.65 : undefined,
                            borderColor: count >= target ? habit.color : undefined,
                          }}
                        >
                          <span
                            className={
                              count > 0 ? 'text-white drop-shadow font-bold' : 'text-muted-foreground/50'
                            }
                          >
                            {count > 0 ? count : formatDayNumber(day)}
                          </span>

                          {/* Amber Dot for Attached Notes */}
                          {hasNote ? (
                            <span
                              className="absolute top-1 end-1 size-1.5 rounded-full bg-amber-400 ring-1 ring-background"
                              title={isFa ? 'دارای یادداشت' : 'Has note'}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  {/* Card Sub-footer */}
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span>{isFa ? '۱۴ روز گذشته' : 'Last 14 days'}</span>
                      <span className="opacity-40">·</span>
                      <span className="text-[10px] text-muted-foreground/80">
                        {isFa
                          ? 'کلیک: ثبت/حذف · دوبار کلیک: یادداشت'
                          : 'Click: log/undo · Double-click: note'}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetailHabit(habit)}
                        className="text-accent hover:underline flex items-center gap-1"
                      >
                        <BarChart2 className="size-3" />
                        <span>{isFa ? 'آمار عمیق' : 'Deep Stats'}</span>
                      </button>
                      <span className="opacity-40">·</span>
                      <span>
                        {stats?.totalCompletions ?? 0} {habit.unit ?? (isFa ? 'کل' : 'total')} ·{' '}
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

function HabitModal({
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
