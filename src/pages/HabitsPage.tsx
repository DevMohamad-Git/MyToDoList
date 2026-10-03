import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Flame, Plus, Repeat } from 'lucide-react'
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
  SegmentedControl,
  Textarea,
  toast,
} from '@/components/ui'
import { ENTITY_COLORS } from '@/config/constants'
import { habitStatsMap } from '@/services/analytics'
import { isHabitDue } from '@/services/streaks'
import { habitRepo } from '@/storage/habitRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import {
  HABIT_FREQUENCIES,
  type Habit,
  type HabitFrequency,
  type WeekDay,
} from '@/types'
import { cn } from '@/utils/cn'
import { addDays, formatDayLabel, fromDayKey, toDayKey } from '@/utils/date'

/**
 * Habit tracking with a 14-day click-to-log grid.
 *
 * The grid reuses `IntensityCell` and `habitRepo.cycle`, so one click logs,
 * increments, or undoes a day — the same single affordance the dashboard uses.
 */
export function HabitsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const [view, setView] = useState<'active' | 'archived'>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [deleting, setDeleting] = useState<Habit | null>(null)

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

  async function cycle(habit: Habit, day: string) {
    const target = Math.max(1, habit.target)
    const next = await habitRepo.cycle(workspaceId, habit.id, day, target)
    if (next === target) toast.success(`“${habit.title}” logged for ${formatDayLabel(day)}`)
  }

  async function confirmDelete() {
    if (!deleting) return
    await habitRepo.remove(deleting.id)
    toast.success(`Deleted “${deleting.title}”`)
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title="Habits"
        description="Small repeated actions, tracked by day with streaks that never punish an unfinished today."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New habit
          </Button>
        }
      />

      <SegmentedControl
        className="mb-4"
        value={view}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
        onChange={setView}
      />

      {!snapshot ? (
        <LoadingState label="Loading habits…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-8" />}
          title={view === 'archived' ? 'Nothing archived' : 'No habits yet'}
          description="Habits are simple counters per day: set a target, click the grid, and watch the streak grow."
          action={
            view === 'active' ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New habit
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((habit) => {
            const stats = statsById.get(habit.id)
            const dueToday = isHabitDue(habit, new Date())
            const todayCount = countFor(habit.id, today)
            const doneToday = todayCount >= Math.max(1, habit.target)
            return (
              <Card key={habit.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2.5">
                      <span className="size-3 rounded-full" style={{ backgroundColor: habit.color }} />
                      {habit.title}
                      {!habit.archived && !dueToday ? <Badge>Not due today</Badge> : null}
                      {habit.archived ? <Badge>Archived</Badge> : null}
                    </span>
                  }
                  description={habit.description || undefined}
                  icon={<Flame className="size-4" />}
                  actions={
                    <>
                      {stats && stats.current > 0 ? (
                        <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                          <Flame className="size-3" />
                          {stats.current}d streak · best {stats.longest}
                        </Badge>
                      ) : null}
                      {!habit.archived ? (
                        <Button
                          size="sm"
                          variant={doneToday ? 'secondary' : 'primary'}
                          onClick={() => void cycle(habit, today)}
                        >
                          <Check className="size-3.5" />
                          {doneToday ? `Done ${todayCount}/${habit.target}` : `Log today (${todayCount}/${habit.target})`}
                        </Button>
                      ) : null}
                      <Menu
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${habit.title}`}>
                            <span className="text-xs leading-none tracking-widest">•••</span>
                          </Button>
                        }
                        items={[
                          {
                            label: 'Edit',
                            onSelect: () => setEditing(habit),
                          },
                          {
                            label: habit.archived ? 'Restore' : 'Archive',
                            onSelect: () => void habitRepo.update(habit.id, { archived: !habit.archived }),
                          },
                          {
                            label: 'Delete',
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
                  <div className="grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                    {gridDays.map((day) => {
                      const count = countFor(habit.id, day)
                      const target = Math.max(1, habit.target)
                      const due = isHabitDue(habit, fromDayKey(day))
                      return (
                        <button
                          key={day}
                          type="button"
                          title={`${formatDayLabel(day)} — ${count}/${target}${due ? '' : ' (not due)'}`}
                          onClick={() => void cycle(habit, day)}
                          className={cn(
                            'flex aspect-square items-center justify-center rounded-md border text-[10px] font-semibold transition-transform hover:scale-105',
                            !due && 'opacity-30',
                          )}
                          style={{
                            backgroundColor: count > 0 ? habit.color : undefined,
                            opacity: count > 0 ? 0.35 + (count / target) * 0.65 : undefined,
                            borderColor: count >= target ? habit.color : undefined,
                          }}
                        >
                          <span className={count > 0 ? 'text-white drop-shadow' : 'text-muted-foreground/50'}>
                            {count > 0 ? count : fromDayKey(day).getDate()}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Last 14 days — click a cell to log / increment / undo</span>
                    <span className="tabular-nums">
                      {stats?.totalCompletions ?? 0} total · {stats?.consistency ?? 0}% consistency
                    </span>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <HabitModal
        open={createOpen || editing != null}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        habit={editing}
      />

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete habit?"
        message={
          deleting ? (
            <>“{deleting.title}” and its entire history will be removed permanently.</>
          ) : null
        }
      />
    </>
  )
}

function HabitModal({ open, onClose, habit }: { open: boolean; onClose: () => void; habit: Habit | null }) {
  const workspaceId = useWorkspaceId()
  const [title, setTitle] = useState(habit?.title ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'daily')
  const [target, setTarget] = useState(String(habit?.target ?? 1))
  const [weekDays, setWeekDays] = useState<WeekDay[]>(habit?.weekDays ?? [1, 3, 5])
  const [color, setColor] = useState(habit?.color ?? ENTITY_COLORS[6])
  const [busy, setBusy] = useState(false)

  // Re-seed the form whenever a different habit is opened for editing.
  const seedKey = habit?.id ?? 'new'
  const [lastSeed, setLastSeed] = useState(seedKey)
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey)
    setTitle(habit?.title ?? '')
    setDescription(habit?.description ?? '')
    setFrequency(habit?.frequency ?? 'daily')
    setTarget(String(habit?.target ?? 1))
    setWeekDays(habit?.weekDays ?? [1, 3, 5])
    setColor(habit?.color ?? ENTITY_COLORS[6])
  }

  const DAY_LABELS: { value: WeekDay; label: string }[] = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 0, label: 'Sun' },
  ]

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        frequency,
        target: Math.max(1, Number(target) || 1),
        weekDays: frequency === 'custom' ? [...weekDays].sort() : [],
        color,
      }
      if (habit) {
        await habitRepo.update(habit.id, input)
        toast.success('Habit updated')
      } else {
        await habitRepo.create(workspaceId, input)
        toast.success('Habit created')
      }
      onClose()
    } catch (error) {
      toast.error((error as Error).message || 'Could not save the habit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Edit habit' : 'New habit'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {habit ? 'Save' : 'Create habit'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" required htmlFor="nh-title">
          <Input
            id="nh-title"
            autoFocus
            value={title}
            placeholder="Read 20 pages"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="nh-desc">
          <Textarea
            id="nh-desc"
            value={description}
            placeholder="Optional details"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Frequency">
            <OptionSelect
              value={frequency}
              onChange={setFrequency}
              options={HABIT_FREQUENCIES.map((f) => ({
                value: f,
                label: f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Custom days',
              }))}
            />
          </Field>
          <Field
            label={frequency === 'weekly' ? 'Target per week' : 'Target per day'}
            hint="Counts above the target are shown as done."
          >
            <Input
              type="number"
              min={1}
              max={50}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
        </div>
        {frequency === 'custom' ? (
          <Field label="Days due">
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
                      'rounded-md border px-2.5 py-1 text-xs transition-colors',
                      selected
                        ? 'border-accent bg-accent/10 text-accent'
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
        <Field label="Colour">
          <div className="flex flex-wrap gap-1.5">
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
