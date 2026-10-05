import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ListChecks,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { Task } from '@/types'
import { cn } from '@/utils/cn'
import {
  addDays,
  dayRange,
  formatDayLabel,
  formatDuration,
  formatMinutesOfDay,
  fromDayKey,
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
  const workspaceId = useWorkspaceId()
  const settings = useSettings()

  const [day, setDay] = useState(() => toDayKey(new Date()))
  const [zoom, setZoom] = useState<'compact' | 'full'>('compact')
  const [proposal, setProposal] = useState<PlanProposal | null>(null)
  const [reschedulePlan, setReschedulePlan] = useState<ReschedulePlan | null>(null)
  const [applying, setApplying] = useState(false)

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

  const now = new Date()
  const behind = useMemo(
    () => behindScheduleReport(plan, now, settings.planning),
    [plan, settings.planning],
  )
  const reschedulePlans = useMemo(
    () =>
      day === toDayKey(now) && behind.missedBlocks.length > 0
        ? buildReschedulePlans(plan, now, settings.planning, toDayKey(new Date(now.getTime() + 86_400_000)))
        : [],
    // Recomputing every render keeps "now" fresh without a ticking timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, settings.planning, day, behind.missedBlocks.length],
  )

  const backlog = useMemo(
    () => [...backlogSource].sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now)).slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backlogSource],
  )

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

  function runAutoPlan() {
    const p = autoSchedule({
      day,
      candidates: allOpen,
      existing: scheduled,
      settings: settings.planning,
      allTasks: allOpen,
    })
    if (p.items.length === 0) {
      toast.info('Nothing could be scheduled — no free slots or nothing fits today.')
      return
    }
    setProposal(p)
  }

  async function applyProposal() {
    if (!proposal) return
    setApplying(true)
    try {
      const patches = proposalToPatches(proposal)
      for (const patch of patches) {
        await taskRepo.update(patch.id, {
          startDate: patch.startDate,
          status: 'planned',
        })
      }
      toast.success(`Scheduled ${patches.length} task${patches.length === 1 ? '' : 's'} for ${formatDayLabel(day)}`)
      setProposal(null)
    } catch (error) {
      toast.error((error as Error).message || 'Could not apply the plan')
    } finally {
      setApplying(false)
    }
  }

  async function applyReschedule() {
    if (!reschedulePlan) return
    setApplying(true)
    try {
      const patches = rescheduleToPatches(reschedulePlan.actions)
      for (const patch of patches) await taskRepo.update(patch.id, { startDate: patch.startDate })
      toast.success(`Applied “${reschedulePlan.label}” — ${patches.length} task(s) moved`)
      setReschedulePlan(null)
    } catch (error) {
      toast.error((error as Error).message || 'Could not apply the reschedule')
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
    })
    if (p.items.length === 0) {
      toast.info(`No free slot today fits “${task.title}”.`)
      return
    }
    const patch = proposalToPatches(p)[0]
    await taskRepo.update(patch.id, { startDate: patch.startDate, status: 'planned' })
    toast.success(`“${task.title}” scheduled at ${formatMinutesOfDay(p.items[0].start)}`)
  }

  const startHour = Math.floor(plan.workStart / 60)
  const endHour = Math.max(startHour + 1, Math.ceil(plan.workEnd / 60))
  const hourHeight = zoom === 'compact' ? 44 : 64
  const timelineMinutes = (endHour - startHour) * 60

  return (
    <>
      <PageHeader
        title="Planner"
        description="Lay the day out, spot conflicts, and auto-fill the gaps with your most urgent work."
        actions={
          <>
            <SegmentedControl
              value={zoom}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'full', label: 'Full' },
              ]}
              onChange={setZoom}
            />
            <Button variant="primary" onClick={runAutoPlan}>
              <Wand2 className="size-4" />
              Auto-plan day
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------------ day nav -- */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => shiftDay(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <JalaliDatePicker
            value={day}
            onChange={(v) => v && setDay(v)}
            className="w-44"
          />
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => shiftDay(1)}>
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDay(toDayKey(new Date()))}>
            Today
          </Button>
          <span className="ml-2 text-sm font-medium">{formatDayLabel(day)}</span>
          {!plan.isWorkday ? <Badge>Non-workday</Badge> : null}

          <div className="ml-auto flex items-center gap-3">
            <div className="w-40">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Load</span>
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
                {plan.loadPercent}% booked
              </Badge>
            ) : null}
            {plan.conflictCount > 0 ? (
              <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                <AlertTriangle className="size-3" />
                {plan.conflictCount} conflict{plan.conflictCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------- behind schedule -- */}
      {reschedulePlans.length > 0 ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardHeader
            title={`${behind.missedBlocks.length} scheduled block(s) have already passed`}
            description={`You are ${formatDuration(behind.behindMinutes)} behind. Pick how to recover:`}
            icon={<AlertTriangle className="size-4 text-amber-400" />}
          />
          <CardBody className="grid gap-2 sm:grid-cols-3">
            {reschedulePlans.map((rp) => (
              <button
                key={rp.strategy}
                type="button"
                onClick={() => setReschedulePlan(rp)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-accent"
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
            title="Timeline"
            description={`${formatMinutesOfDay(plan.workStart)}–${formatMinutesOfDay(plan.workEnd)} · ${plan.blocks.length} block(s)`}
            icon={<CalendarDays className="size-4" />}
          />
          <div className="relative" style={{ height: timelineMinutes * (hourHeight / 60) }}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div
                key={i}
                className="absolute inset-x-0 border-t border-border/60"
                style={{ top: i * hourHeight }}
              >
                <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] tabular-nums text-muted-foreground">
                  {String(startHour + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {plan.blocks.map((block) => {
              const top = ((block.start - startHour * 60) * hourHeight) / 60
              const height = Math.max(24, ((block.end - block.start) * hourHeight) / 60)
              const closed = CLOSED_TASK_STATUSES.includes(block.task.status)
              const conflict = block.conflictsWith.length > 0
              return (
                <div
                  key={block.task.id}
                  title={`${block.task.title} · ${formatMinutesOfDay(block.start)}–${formatMinutesOfDay(block.end)}${conflict ? ' · overlaps another block' : ''}`}
                  className={cn(
                    'absolute left-16 right-3 overflow-hidden rounded-lg border px-2.5 py-1.5 text-xs shadow-sm',
                    closed ? 'border-border bg-muted/40 opacity-60' : 'border-border bg-card',
                    conflict && 'border-amber-500/50',
                  )}
                  style={{ top, height }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('truncate font-medium', closed && 'line-through')}>
                      {block.task.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMinutesOfDay(block.start)}
                    </span>
                  </div>
                  {height >= 44 ? (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {formatDuration(block.end - block.start)}
                      {conflict ? ' · overlapping' : ''}
                      {block.task.priority !== 'medium' ? ` · ${block.task.priority}` : ''}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {plan.blocks.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled. Use Auto-plan or pick from the backlog.
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* -------------------------------------------------------- backlog -- */}
        <Card>
          <CardHeader
            title="Backlog"
            description="Open, unscheduled tasks — most urgent first"
            icon={<ListChecks className="size-4" />}
          />
          {backlog.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Check className="size-6" />}
                title="Backlog is clear"
                description="Every open task has a place on the calendar."
              />
            </CardBody>
          ) : (
            <div>
              {backlog.map((task) => (
                <div key={task.id} className="group relative">
                  <TaskRow
                    task={task}
                    project={task.projectId ? (projectNames?.get(task.projectId) ?? null) : null}
                    onToggle={async (t) => {
                      const next = await taskRepo.toggleComplete(t.id)
                      if (next?.status === 'completed') toast.success(`Completed “${next.title}”`)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void scheduleSingle(task)}
                    title="Schedule in the next free slot"
                    className="absolute top-2.5 right-9 rounded-md border border-border bg-card px-1.5 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                  >
                    + plan
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
        title={`Proposed plan for ${formatDayLabel(proposal?.day ?? day)}`}
        description={
          proposal
            ? `${proposal.items.length} placed · ${formatDuration(proposal.totalMinutes)} of ${formatDuration(proposal.availableMinutes)} available`
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposal(null)} disabled={applying}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void applyProposal()} disabled={applying}>
              <Sparkles className="size-4" />
              {applying ? 'Applying…' : `Apply ${proposal?.items.length ?? 0} schedule change(s)`}
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
                  {proposal.skipped.length} not scheduled
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
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void applyReschedule()} disabled={applying}>
              <CalendarPlus className="size-4" />
              {applying ? 'Applying…' : 'Apply moves'}
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
                Protected: {reschedulePlan.protectedTasks.map((t) => t.title).join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

    </>
  )
}
