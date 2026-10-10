import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  Coffee,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buildDayPlan } from '@/services/planner'
import {
  autoSchedule,
  behindScheduleReport,
  buildReschedulePlans,
  proposalToPatches,
  rescheduleToPatches,
  urgencyScore,
  type PlanProposal,
  type ReschedulePlan,
} from '@/services/planner'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  JalaliDatePicker,
  Modal,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  toast,
} from '@/components/ui'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { priorityLabel, useT } from '@/i18n'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { Priority, Task } from '@/types'
import { cn } from '@/utils/cn'
import {
  addDays,
  dayAtMinutes,
  dayRange,
  formatDayLabel,
  formatDuration,
  formatMinutesOfDay,
  fromDayKey,
  minutesIntoDay,
  toDayKey,
  toISO,
} from '@/utils/date'

/**
 * The day planner: one day at a time, laid out on the working-hours timeline.
 *
 * Proposals are always preview-then-apply — the same contract the AI planner
 * uses — so the user sees exactly which blocks will move before anything is
 * written.
 */

export function PlannerPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const settings = useSettings()

  const [day, setDay] = useState(() => toDayKey(new Date()))
  const [zoom, setZoom] = useState<'compact' | 'full'>('compact')
  const [proposal, setProposal] = useState<PlanProposal | null>(null)
  const [reschedulePlan, setReschedulePlan] = useState<ReschedulePlan | null>(null)
  const [applying, setApplying] = useState(false)

  // Interactive enhancements & performance states
  const [now, setNow] = useState(() => new Date())
  const [bufferMinutes, setBufferMinutes] = useState<number>(0)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddStartDate, setQuickAddStartDate] = useState<string | null>(null)
  const [backlogSearch, setBacklogSearch] = useState('')
  const [backlogPriority, setBacklogPriority] = useState<Priority | 'all'>('all')

  // Live minute ticker: updates "now" every 60s so time indicators and behind-schedule stay fresh
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const { start, end } = dayRange(day)
  const scheduled =
    useLiveQuery(
      () => taskRepo.scheduledBetween(workspaceId, toISO(start), toISO(end)),
      [workspaceId, day],
    ) ?? []
  const backlogSource =
    useLiveQuery(
      () =>
        taskRepo.list(workspaceId, {
          status: ['inbox', 'planned', 'in_progress', 'blocked'],
          scheduled: false,
        }),
      [workspaceId],
    ) ?? []
  const allOpen =
    useLiveQuery(
      () =>
        taskRepo.list(workspaceId, {
          status: ['inbox', 'planned', 'in_progress', 'blocked'],
        }),
      [workspaceId],
    ) ?? []

  const plan = useMemo(
    () => buildDayPlan(day, scheduled, [], settings.planning),
    [day, scheduled, settings.planning],
  )

  const behind = useMemo(
    () => behindScheduleReport(plan, now, settings.planning),
    [plan, now, settings.planning],
  )
  const reschedulePlans = useMemo(
    () =>
      day === toDayKey(now) && behind.missedBlocks.length > 0
        ? buildReschedulePlans(plan, now, settings.planning, toDayKey(new Date(now.getTime() + 86_400_000)))
        : [],
    [plan, now, settings.planning, day, behind.missedBlocks.length],
  )

  const filteredBacklog = useMemo(() => {
    let list = backlogSource
    if (backlogSearch.trim()) {
      const q = backlogSearch.toLowerCase().trim()
      list = list.filter((task) => task.title.toLowerCase().includes(q))
    }
    if (backlogPriority !== 'all') {
      list = list.filter((task) => task.priority === backlogPriority)
    }
    return [...list].sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now)).slice(0, 15)
  }, [backlogSource, backlogSearch, backlogPriority, now])

  const projectNames = useLiveQuery(
    async () => {
      const rows = await projectRepo.list(workspaceId)
      return new Map(rows.map((p) => [p.id, p]))
    },
    [workspaceId],
  )

  function shiftDay(delta: number) {
    setDay(toDayKey(addDays(fromDayKey(day), delta)))
  }

  function handleSlotClick(slotHour: number) {
    setQuickAddStartDate(toISO(dayAtMinutes(day, slotHour * 60)))
    setQuickAddOpen(true)
  }

  function runAutoPlan() {
    const p = autoSchedule({
      day,
      candidates: allOpen,
      existing: scheduled,
      settings: settings.planning,
      allTasks: allOpen,
      bufferMinutes,
    })
    if (p.items.length === 0) {
      toast.info(t('plannerToastNoFit'))
      return
    }
    setProposal(p)
  }

  // Parallel bulk update for top database performance
  async function applyProposal() {
    if (!proposal) return
    setApplying(true)
    try {
      const patches = proposalToPatches(proposal)
      await Promise.all(
        patches.map((patch) =>
          taskRepo.update(patch.id, {
            startDate: patch.startDate,
            status: 'planned',
          }),
        ),
      )
      toast.success(t('plannerToastScheduledN', { n: patches.length, day: formatDayLabel(day) }))
      setProposal(null)
    } catch (error) {
      toast.error((error as Error).message || t('plannerToastApplyError'))
    } finally {
      setApplying(false)
    }
  }

  // Parallel bulk update for reschedule actions
  async function applyReschedule() {
    if (!reschedulePlan) return
    setApplying(true)
    try {
      const patches = rescheduleToPatches(reschedulePlan.actions)
      await Promise.all(
        patches.map((patch) =>
          taskRepo.update(patch.id, { startDate: patch.startDate }),
        ),
      )
      toast.success(t('plannerToastRescheduleApplied', { label: reschedulePlan.label, n: patches.length }))
      setReschedulePlan(null)
    } catch (error) {
      toast.error((error as Error).message || t('plannerToastRescheduleError'))
    } finally {
      setApplying(false)
    }
  }

  async function scheduleSingle(task: Task) {
    const p = autoSchedule({
      day,
      candidates: [task],
      existing: scheduled,
      settings: settings.planning,
      allTasks: allOpen,
      bufferMinutes,
    })
    if (p.items.length === 0) {
      toast.info(t('plannerToastSingleNoSlot', { title: task.title }))
      return
    }
    const patch = proposalToPatches(p)[0]
    await taskRepo.update(patch.id, { startDate: patch.startDate, status: 'planned' })
    toast.success(t('plannerToastSingleScheduled', { title: task.title, time: formatMinutesOfDay(p.items[0].start) }))
  }

  const startHour = Math.floor(plan.workStart / 60)
  const endHour = Math.max(startHour + 1, Math.ceil(plan.workEnd / 60))
  const hourHeight = zoom === 'compact' ? 44 : 64
  const timelineMinutes = (endHour - startHour) * 60

  // Live Time Indicator calculation for today
  const isToday = day === toDayKey(now)
  const nowMinutes = minutesIntoDay(now)
  const isNowWithinTimeline = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
  const nowTop = isNowWithinTimeline ? ((nowMinutes - startHour * 60) * hourHeight) / 60 : null

  return (
    <>
      <PageHeader
        title={t('plannerTitle')}
        description={t('plannerDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={zoom}
              options={[
                { value: 'compact', label: t('plannerZoomCompact') },
                { value: 'full', label: t('plannerZoomFull') },
              ]}
              onChange={setZoom}
            />

            {/* Buffer Selector */}
            <div
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
              title={t('plannerBuffer')}
            >
              <Coffee className="size-3.5 text-accent" />
              <span className="hidden sm:inline">{t('plannerBuffer')}:</span>
              <select
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
              >
                <option value={0} className="bg-card text-foreground">{t('plannerBufferNone')}</option>
                <option value={5} className="bg-card text-foreground">{t('plannerBuffer5')}</option>
                <option value={10} className="bg-card text-foreground">{t('plannerBuffer10')}</option>
                <option value={15} className="bg-card text-foreground">{t('plannerBuffer15')}</option>
              </select>
            </div>

            <Button variant="primary" onClick={runAutoPlan}>
              <Wand2 className="size-4" />
              {t('plannerAutoPlan')}
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------ day nav -- */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t('plannerPrevDay')} onClick={() => shiftDay(-1)}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Button>
          <JalaliDatePicker
            value={day}
            onChange={(v) => v && setDay(v)}
            className="w-44"
          />
          <Button variant="outline" size="icon" aria-label={t('plannerNextDay')} onClick={() => shiftDay(1)}>
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDay(toDayKey(new Date()))}>
            {t('plannerToday')}
          </Button>
          <span className="ms-2 text-sm font-medium">{formatDayLabel(day)}</span>

          <div className="ms-auto flex items-center gap-3">
            <div className="w-40">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t('plannerLoad')}</span>
                <span className="tabular-nums">
                  {formatDuration(plan.scheduledMinutes)} / {formatDuration(plan.capacityMinutes)}
                </span>
              </div>
              <ProgressBar
                className="mt-1"
                value={plan.loadPercent}
                barClassName={plan.overbooked ? 'bg-rose-500' : plan.loadPercent > 85 ? 'bg-amber-500' : undefined}
              />
            </div>
            {plan.overbooked ? (
              <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-400">
                {t('plannerBookedPercent', { n: plan.loadPercent })}
              </Badge>
            ) : null}
            {plan.conflictCount > 0 ? (
              <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                <AlertTriangle className="size-3" />
                {plan.conflictCount === 1
                  ? t('plannerConflictCount1')
                  : t('plannerConflictCountN', { n: plan.conflictCount })}
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------- behind schedule -- */}
      {reschedulePlans.length > 0 ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardHeader
            title={
              behind.missedBlocks.length === 1
                ? t('plannerBehindScheduleTitle1')
                : t('plannerBehindScheduleTitleN', { n: behind.missedBlocks.length })
            }
            description={t('plannerBehindScheduleDesc', { dur: formatDuration(behind.behindMinutes) })}
            icon={<AlertTriangle className="size-4 text-amber-400" />}
          />
          <CardBody className="grid gap-2 sm:grid-cols-3">
            {reschedulePlans.map((rp) => (
              <button
                key={rp.strategy}
                type="button"
                onClick={() => setReschedulePlan(rp)}
                className="rounded-lg border border-border bg-card p-3 text-start transition-colors hover:border-accent"
              >
                <div className="text-sm font-medium">{rp.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">{rp.description}</p>
              </button>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* ------------------------------------------------------- timeline -- */}
        <Card className="overflow-hidden">
          <CardHeader
            title={t('plannerTimelineTitle')}
            description={t('plannerTimelineDesc', {
              start: formatMinutesOfDay(plan.workStart),
              end: formatMinutesOfDay(plan.workEnd),
              blocks: plan.blocks.length,
            })}
            icon={<CalendarDays className="size-4" />}
          />
          <div className="relative" style={{ height: timelineMinutes * (hourHeight / 60) }}>
            {/* Hour Grid Lines with Click-to-Add */}
            {Array.from({ length: endHour - startHour }, (_, i) => {
              const slotHour = startHour + i
              return (
                <div
                  key={i}
                  onClick={() => handleSlotClick(slotHour)}
                  className="group/slot absolute inset-x-0 border-t border-border/60 hover:bg-accent/5 transition-colors cursor-pointer"
                  style={{ top: i * hourHeight, height: hourHeight }}
                  title={`${formatMinutesOfDay(slotHour * 60)} — ${t('plannerClickToSchedule')}`}
                >
                  <span className="absolute -top-2 start-2 bg-card px-1 text-[10px] tabular-nums text-muted-foreground select-none">
                    {String(slotHour).padStart(2, '0')}:00
                  </span>
                  <span className="absolute top-1 end-3 opacity-0 group-hover/slot:opacity-100 text-[10px] text-muted-foreground hover:text-accent flex items-center gap-1 transition-opacity select-none">
                    <Plus className="size-3" />
                    {t('plannerAddAtTime')}
                  </span>
                </div>
              )
            })}

            {/* Live Current Time Line Indicator */}
            {nowTop != null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center transition-all duration-300"
                style={{ top: nowTop }}
              >
                <div className="absolute start-12 -translate-y-1/2 flex items-center gap-1.5 bg-background/95 px-1.5 py-0.5 rounded-full border border-rose-500/30 shadow-sm">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 tabular-nums">
                    {formatMinutesOfDay(nowMinutes)}
                  </span>
                </div>
                <div className="ms-28 w-full border-t-2 border-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.35)]" />
              </div>
            ) : null}

            {/* Scheduled Task Blocks */}
            {plan.blocks.map((block) => {
              const top = ((block.start - startHour * 60) * hourHeight) / 60
              const height = Math.max(24, ((block.end - block.start) * hourHeight) / 60)
              const closed = CLOSED_TASK_STATUSES.includes(block.task.status)
              const conflict = block.conflictsWith.length > 0
              return (
                <div
                  key={block.task.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingTaskId(block.task.id)
                  }}
                  title={`${block.task.title} · ${formatMinutesOfDay(block.start)}–${formatMinutesOfDay(block.end)}${conflict ? ` · ${t('plannerOverlapping')}` : ''} — ${t('plannerClickToEdit')}`}
                  className={cn(
                    'group/block absolute start-16 end-3 overflow-hidden rounded-lg border px-2.5 py-1.5 text-xs shadow-sm transition-all duration-150',
                    'cursor-pointer hover:shadow-md hover:border-accent hover:z-10',
                    closed ? 'border-border bg-muted/40 opacity-60' : 'border-border bg-card',
                    conflict && 'border-amber-500/50 bg-amber-500/5',
                  )}
                  style={{ top, height }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('truncate font-medium group-hover/block:text-accent transition-colors', closed && 'line-through')}>
                      {block.task.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMinutesOfDay(block.start)}
                    </span>
                  </div>
                  {height >= 44 ? (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {formatDuration(block.end - block.start)}
                      {conflict ? ` · ${t('plannerOverlapping')}` : ''}
                      {block.task.priority !== 'medium' ? ` · ${priorityLabel(block.task.priority)}` : ''}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {plan.blocks.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center pointer-events-none">
                <p className="text-sm text-muted-foreground">
                  {t('plannerTimelineEmpty')}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* -------------------------------------------------------- backlog -- */}
        <Card className="flex flex-col">
          <CardHeader
            title={t('plannerBacklogTitle')}
            description={t('plannerBacklogDesc')}
            icon={<ListChecks className="size-4" />}
          />

          {/* Backlog Search & Filter Bar */}
          <div className="px-4 pb-3 space-y-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder={t('plannerSearchBacklog')}
                className="w-full rounded-md border border-border bg-muted/30 ps-8 pe-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:bg-background focus:outline-none transition-colors"
              />
              {backlogSearch ? (
                <button
                  type="button"
                  onClick={() => setBacklogSearch('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBacklogPriority(p)}
                  className={cn(
                    'rounded px-2 py-0.5 font-medium transition-colors',
                    backlogPriority === p
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {p === 'all'
                    ? t('plannerFilterAll')
                    : p === 'critical'
                      ? t('plannerFilterCritical')
                      : p === 'high'
                        ? t('plannerFilterHigh')
                        : priorityLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {filteredBacklog.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Check className="size-6" />}
                title={t('plannerBacklogEmptyTitle')}
                description={t('plannerBacklogEmptyDesc')}
              />
            </CardBody>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredBacklog.map((task) => (
                <div key={task.id} className="group relative">
                  <TaskRow
                    task={task}
                    project={task.projectId ? (projectNames?.get(task.projectId) ?? null) : null}
                    onToggle={async (tRow) => {
                      const next = await taskRepo.toggleComplete(tRow.id)
                      if (next?.status === 'completed') toast.success(t('toastCompleted', { title: next.title }))
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void scheduleSingle(task)}
                    title={t('plannerScheduleTooltip')}
                    className="absolute top-2.5 end-9 rounded-md border border-border bg-card px-1.5 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent shadow-sm"
                  >
                    {t('plannerPlanAction')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------- proposal preview -- */}
      <Modal
        open={proposal != null}
        onClose={() => setProposal(null)}
        title={t('plannerProposalTitle', { day: formatDayLabel(proposal?.day ?? day) })}
        description={
          proposal
            ? t('plannerProposalDesc', {
                items: proposal.items.length,
                total: formatDuration(proposal.totalMinutes),
                available: formatDuration(proposal.availableMinutes),
              })
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposal(null)} disabled={applying}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void applyProposal()} disabled={applying}>
              <Sparkles className="size-4" />
              {applying ? t('plannerApplying') : t('plannerApplyChanges', { n: proposal?.items.length ?? 0 })}
            </Button>
          </>
        }
      >
        {proposal ? (
          <div className="flex flex-col gap-3">
            <div>
              {proposal.items.map((item) => (
                <div
                  key={item.taskId}
                  className="flex items-baseline gap-3 border-b border-border py-2 text-sm last:border-b-0"
                >
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {formatMinutesOfDay(item.start)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.reason}</span>
                </div>
              ))}
            </div>
            {proposal.skipped.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <h3 className="text-xs font-semibold text-amber-400">
                  {t('plannerNotScheduledTitle', { n: proposal.skipped.length })}
                </h3>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {proposal.skipped.map((s) => (
                    <li key={s.taskId}>
                      <span className="font-medium text-foreground">{s.title}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ----------------------------------------------- reschedule preview -- */}
      <Modal
        open={reschedulePlan != null}
        onClose={() => setReschedulePlan(null)}
        title={reschedulePlan?.label ?? ''}
        description={reschedulePlan?.description}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReschedulePlan(null)} disabled={applying}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void applyReschedule()} disabled={applying}>
              <CalendarPlus className="size-4" />
              {applying ? t('plannerApplying') : t('plannerApplyMoves')}
            </Button>
          </>
        }
      >
        {reschedulePlan ? (
          <div className="flex flex-col gap-2">
            {reschedulePlan.actions.map((action) => (
              <div key={action.taskId} className="flex items-baseline gap-3 border-b border-border py-2 text-sm last:border-b-0">
                <span className="min-w-0 flex-1 truncate font-medium">{action.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatMinutesOfDay(action.fromStart ?? 0)} →{' '}
                  {formatDayLabel(action.toDay)} {formatMinutesOfDay(action.toStart)}
                </span>
              </div>
            ))}
            {reschedulePlan.protectedTasks.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('plannerProtected', {
                  tasks: reschedulePlan.protectedTasks.map((pt) => pt.title).join(', '),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ------------------------------------------------ task editor modal -- */}
      <TaskEditorModal
        taskId={editingTaskId}
        open={editingTaskId != null}
        onClose={() => setEditingTaskId(null)}
      />

      {/* ------------------------------------------------ quick add dialog -- */}
      <QuickAddDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultStartDate={quickAddStartDate}
      />
    </>
  )
}
