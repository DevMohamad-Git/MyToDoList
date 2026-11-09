import {
  ArrowRight,
  Check,
  CheckCircle2,
  Flame,
  Inbox,
  ListTodo,
} from 'lucide-react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  PriorityBadge,
  toast,
} from '@/components/ui'
import { habitRepo } from '@/storage/habitRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useT } from '@/i18n'
import type { DayKey, Habit, ID, Task } from '@/types'
import { cn } from '@/utils/cn'
import { addDays, formatDayLabel, formatDuration, fromDayKey, toDayKey } from '@/utils/date'

interface TaskBreakdownCardProps {
  workspaceId: ID
  day: DayKey
  completed: Task[]
  open: Task[]
  workloadCount: number
  activeHabits: Habit[]
  completedHabitIds: Set<ID>
}

export function TaskBreakdownCard({
  workspaceId,
  day,
  completed,
  open,
  workloadCount,
  activeHabits,
  completedHabitIds,
}: TaskBreakdownCardProps) {
  const t = useT()

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
    const next = await taskRepo.toggleComplete(task.id)
    if (next) {
      toast.success(t('toastCompleted', { title: next.title }), {
        label: t('toastUndo'),
        onClick: () => {
          void taskRepo.toggleComplete(next.id)
        },
      })
    }
  }

  const handleToggleHabit = async (habit: Habit) => {
    try {
      const nextCount = await habitRepo.cycle(workspaceId, habit.id, day, habit.target)
      toast.success(
        nextCount > 0
          ? `«${habit.title}» ثبت شد (${nextCount}/${habit.target})`
          : `ثبت «${habit.title}» لغو شد`,
      )
    } catch {
      toast.error('خطا در ثبت وضعیت عادت')
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('reviewsTasksBreakdownTitle')}
        icon={<ListTodo className="size-4" />}
        actions={
          <div className="text-xs text-muted-foreground">
            {completed.length} / {workloadCount} {t('stCompleted')}
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {/* Completed Wins */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
            {t('reviewsTasksCompletedTitle', { count: completed.length })}
          </h4>
          {completed.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {t('focusTodaySessionsEmpty')}
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {completed.map((task) => (
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
        {open.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
              {t('reviewsTasksOpenTitle', { count: open.length })}
            </h4>
            <div className="divide-y divide-border rounded-lg border border-border">
              {open.map((task) => (
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

        {/* Daily Habits Consistency with Interactive Click-to-Cycle */}
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
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => void handleToggleHabit(habit)}
                    title={`کلیک برای تغییر وضعیت «${habit.title}» در تاریخ ${formatDayLabel(day)}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all shadow-sm border cursor-pointer select-none active:scale-95',
                      done
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    <span>{done ? '✓' : '○'}</span>
                    <span>{habit.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
