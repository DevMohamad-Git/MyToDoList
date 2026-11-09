import {
  Calendar,
  CheckCircle2,
  Hourglass,
  ListTodo,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { useState } from 'react'
import {
  Badge,
  Button,
  Modal,
  PriorityBadge,
  toast,
} from '@/components/ui'
import { taskRepo } from '@/storage/taskRepo'
import { useT } from '@/i18n'
import type { DayKey, FocusSession, Project, Task } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration, toDayKey } from '@/utils/date'

export type InspectTab = 'planned' | 'completed' | 'deadlines' | 'focus'

interface StatInspectModalProps {
  open: boolean
  onClose: () => void
  initialTab?: InspectTab
  day: DayKey
  workload: Task[]
  completed: Task[]
  openTasks: Task[]
  focusSessions: FocusSession[]
  projects: Project[]
}

export function StatInspectModal({
  open,
  onClose,
  initialTab = 'planned',
  day,
  workload,
  completed,
  openTasks: _openTasks,
  focusSessions,
  projects,
}: StatInspectModalProps) {
  const t = useT()
  const [tab, setTab] = useState<InspectTab>(initialTab)

  // Map project id to project name
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  // Tasks due on this day
  const dueTodayTasks = workload.filter(
    (task) => task.dueDate && toDayKey(task.dueDate) === day && task.status !== 'cancelled',
  )
  const metDeadlineTasks = dueTodayTasks.filter(
    (task) => task.completedAt && task.completedAt <= task.dueDate!,
  )
  const missedDeadlineTasks = dueTodayTasks.filter(
    (task) => (task.completedAt ? task.completedAt > task.dueDate! : task.status !== 'completed'),
  )

  const handleToggleTask = async (task: Task) => {
    const next = await taskRepo.toggleComplete(task.id)
    if (next) {
      toast.success(
        next.status === 'completed'
          ? `«${next.title}» انجام شد`
          : `«${next.title}» بازگشایی شد`,
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <ListTodo className="size-5 text-accent shrink-0" />
          <span>بررسی جزئیات کارهای {formatDayLabel(day)}</span>
        </div>
      }
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('cClose')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Tab Selection Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTab('planned')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold transition-all',
              tab === 'planned'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Calendar className="size-3.5" />
            <span>کارهای موعددار ({workload.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('completed')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold transition-all',
              tab === 'completed'
                ? 'bg-card text-emerald-500 shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>انجام‌شده ({completed.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('deadlines')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold transition-all',
              tab === 'deadlines'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Hourglass className="size-3.5" />
            <span>مهلت‌ها ({dueTodayTasks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('focus')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold transition-all',
              tab === 'focus'
                ? 'bg-card text-accent shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Timer className="size-3.5 text-accent" />
            <span>تمرکز ({focusSessions.length})</span>
          </button>
        </div>

        {/* Tab 1: Planned / Due Tasks */}
        {tab === 'planned' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>تمام تسک‌های دارای تاریخ شروع، موعد سررسید یا تکمیل در این روز:</span>
              <span>مجموع: {workload.length} کار</span>
            </div>

            {workload.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                هیچ کاری برای این تاریخ برنامه‌ریزی یا دارای موعد نبوده است.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card max-h-[380px] overflow-y-auto">
                {workload.map((task) => {
                  const isDone = task.status === 'completed'
                  const project = task.projectId ? projectMap.get(task.projectId) : null

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleTask(task)}
                          className={cn(
                            'size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                            isDone
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-muted-foreground/40 hover:border-accent',
                          )}
                          title={isDone ? 'علامت به عنوان باز' : 'علامت به عنوان انجام‌شده'}
                        >
                          {isDone ? <CheckCircle2 className="size-3.5" /> : null}
                        </button>

                        <div className="min-w-0">
                          <span
                            className={cn(
                              'text-sm font-medium block truncate',
                              isDone && 'line-through text-muted-foreground',
                            )}
                          >
                            {task.title}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            {project ? (
                              <span className="text-[10px] text-accent font-medium">
                                #{project.name}
                              </span>
                            ) : null}
                            {task.dueDate ? (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                موعد: {formatDayLabel(toDayKey(task.dueDate))}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        {task.estimatedDuration ? (
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatDuration(task.estimatedDuration, { compact: true })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Completed Tasks */}
        {tab === 'completed' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>کارهایی که در این روز با موفقیت تکمیل شده‌اند:</span>
              <span className="font-semibold text-emerald-500">{completed.length} کار تکمیل‌شده</span>
            </div>

            {completed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                هنوز کاری در این روز به پایان نرسیده است.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card max-h-[380px] overflow-y-auto">
                {completed.map((task) => {
                  const project = task.projectId ? projectMap.get(task.projectId) : null

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium line-through text-muted-foreground block truncate">
                            {task.title}
                          </span>
                          {project ? (
                            <span className="text-[10px] text-accent font-medium">
                              #{project.name}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        {task.actualDuration ? (
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatDuration(task.actualDuration, { compact: true })}
                          </span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => void handleToggleTask(task)}
                          title="بازگشایی مجدد"
                        >
                          بازگشایی
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Deadlines */}
        {tab === 'deadlines' && (
          <div className="flex flex-col gap-4">
            {/* Met Deadlines */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                <ShieldCheck className="size-4" />
                <span>مهلت‌های به‌موقع رعایت‌شده ({metDeadlineTasks.length})</span>
              </div>
              {metDeadlineTasks.length === 0 ? (
                <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground bg-muted/10 italic">
                  موردی ثبت نشده است.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {metDeadlineTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-2.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                        <span className="text-sm font-medium truncate line-through text-muted-foreground">
                          {task.title}
                        </span>
                      </div>
                      <Badge className="text-emerald-500 border-emerald-500/30 text-[10px]">
                        به موقع تحویل شد
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Missed / Overdue Deadlines */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-rose-500 uppercase tracking-wider">
                <ShieldAlert className="size-4" />
                <span>مهلت‌های گذشته یا به تعویق افتاده ({missedDeadlineTasks.length})</span>
              </div>
              {missedDeadlineTasks.length === 0 ? (
                <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground bg-muted/10 italic">
                  عالی! هیچ مهلت از دست رفته‌ای وجود ندارد.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {missedDeadlineTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-2.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-3.5 rounded-full border border-rose-500/50 shrink-0" />
                        <span className="text-sm font-medium truncate">{task.title}</span>
                      </div>
                      <Badge className="text-rose-500 border-rose-500/30 text-[10px]">
                        نیازمند انجام یا تمدید
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Focus Sessions */}
        {tab === 'focus' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>نشست‌های ثبت‌شده کار عمیق و پومودورو:</span>
              <span>
                مجموع:{' '}
                {formatDuration(
                  focusSessions.reduce((acc, s) => acc + s.duration, 0),
                )}
              </span>
            </div>

            {focusSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground space-y-2">
                <div>هیچ جلسه تمرکزی در این روز ثبت نشده است.</div>
                <div className="text-[11px] text-accent">
                  💡 استفاده از صفحه «تمرکز» (Focus) به افزایش پیوستگی و امتیاز بهره‌وری شما کمک می‌کند.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card max-h-[380px] overflow-y-auto">
                {focusSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                        <Timer className="size-4" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold capitalize">
                          {session.mode === 'pomodoro'
                            ? 'جلسه پومودورو'
                            : session.mode === 'stopwatch'
                              ? 'کرنومتر'
                              : 'شمارش معکوس'}
                        </span>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {new Date(session.startTime).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          تا{' '}
                          {new Date(session.endTime).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="font-mono text-xs font-bold text-accent border-accent/30">
                        {formatDuration(session.duration)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
