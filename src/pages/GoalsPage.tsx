import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Circle, Plus, Target, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Menu,
  Modal,
  OptionSelect,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  Textarea,
  toast,
} from '@/components/ui'
import { ENTITY_COLORS, PRIORITY_LABEL } from '@/config/constants'
import { goalStatsMap } from '@/services/analytics'
import { goalRepo } from '@/storage/goalRepo'
import { projectRepo } from '@/storage/projectRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import { GOAL_STATUSES, PRIORITIES, type Goal, type GoalStatus, type Priority } from '@/types'

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  achieved: 'Achieved',
  paused: 'Paused',
  abandoned: 'Abandoned',
}
import { cn } from '@/utils/cn'
import { formatDate, fromDateInput } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Long-term goals. Progress blends milestones, linked projects and linked tasks
 * via `goalStatsMap`, and the page keeps the "is the pace healthy" signal visible
 * instead of burying it behind the percentage.
 */
export function GoalsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const [view, setView] = useState<'active' | 'all'>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<Goal | null>(null)

  const goals = useLiveQuery(() => goalRepo.list(workspaceId), [workspaceId]) ?? []
  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const statsById = useMemo(() => (snapshot ? goalStatsMap(snapshot) : new Map()), [snapshot])

  const visible = view === 'active' ? goals.filter((g) => g.status === 'active') : goals
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  async function confirmDelete() {
    if (!deleting) return
    await goalRepo.remove(deleting.id)
    toast.success(`Deleted “${deleting.title}” — linked tasks were unlinked, not deleted`)
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title="Goals"
        description="The outcomes behind the day-to-day tasks, with progress derived from real work."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New goal
          </Button>
        }
      />

      <SegmentedControl
        className="mb-4"
        value={view}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'all', label: 'All' },
        ]}
        onChange={setView}
      />

      {!snapshot ? (
        <LoadingState label="Loading goals…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Target className="size-8" />}
          title="No goals here"
          description="A goal ties projects and tasks to an outcome so their progress rolls up to something that matters."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((goal) => {
            const stats = statsById.get(goal.id)
            return (
              <Card key={goal.id}>
                <div className="flex items-start gap-2.5 border-b border-border p-4">
                  <span
                    className="mt-1 size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: goal.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">{goal.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{PRIORITY_LABEL[goal.priority]}</Badge>
                      {goal.status !== 'active' ? <Badge>{GOAL_STATUS_LABEL[goal.status]}</Badge> : null}
                      {goal.deadline ? (
                        <Badge
                          className={cn(
                            stats?.onTrack === false &&
                              'border-rose-500/25 bg-rose-500/10 text-rose-400',
                          )}
                        >
                          {stats?.daysRemaining != null
                            ? stats.daysRemaining >= 0
                              ? `${stats.daysRemaining}d left`
                              : `${Math.abs(stats.daysRemaining)}d over`
                            : `Due ${formatDate(goal.deadline)}`}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <GoalMenu goal={goal} onDelete={() => setDeleting(goal)} />
                </div>

                <CardBody>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium tabular-nums">{Math.round(stats?.progress ?? 0)}%</span>
                  </div>
                  <ProgressBar value={stats?.progress ?? 0} color={goal.color} />

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {stats?.completedMilestones ?? 0}/{stats?.totalMilestones ?? 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">milestones</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {stats?.completedLinkedTasks ?? 0}/{stats?.linkedTasks ?? 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">tasks</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">{stats?.linkedProjects ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground">projects</div>
                    </div>
                  </div>

                  {goal.linkedProjectIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {goal.linkedProjectIds.map((pid) => {
                        const project = projectById.get(pid)
                        if (!project) return null
                        return (
                          <Badge
                            key={pid}
                            className="border-transparent"
                            style={{ backgroundColor: `${project.color}20`, color: project.color }}
                          >
                            {project.name}
                          </Badge>
                        )
                      })}
                    </div>
                  ) : null}

                  {goal.milestones.length > 0 ? (
                    <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                      {goal.milestones.map((milestone) => (
                        <div key={milestone.id} className="flex items-center gap-2 px-2.5 py-2">
                          <button
                            type="button"
                            aria-label={milestone.completed ? 'Reopen milestone' : 'Complete milestone'}
                            onClick={() => void goalRepo.toggleMilestone(goal.id, milestone.id)}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
                          >
                            {milestone.completed ? (
                              <CheckCircle2 className="size-3.5 text-emerald-400" />
                            ) : (
                              <Circle className="size-3.5" />
                            )}
                          </button>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-xs',
                              milestone.completed && 'text-muted-foreground line-through',
                            )}
                          >
                            {milestone.title}
                          </span>
                          <IconButton
                            label="Remove milestone"
                            onClick={() =>
                              void goalRepo.setMilestones(
                                goal.id,
                                goal.milestones.filter((m) => m.id !== milestone.id),
                              )
                            }
                          >
                            <X className="size-3" />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <NewMilestoneRow goalId={goal.id} />
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <CreateGoalModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete goal?"
        message={
          deleting ? (
            <>“{deleting.title}” will be removed. Linked tasks and projects are kept.</>
          ) : null
        }
      />
    </>
  )
}

function GoalMenu({ goal, onDelete }: { goal: Goal; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Select
        value={goal.status}
        aria-label="Goal status"
        className="h-7 w-24 text-xs"
        onChange={(e) => void goalRepo.update(goal.id, { status: e.target.value as GoalStatus })}
      >
        {GOAL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {GOAL_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      <Menu
        trigger={
          <IconButton label="Goal actions" className="text-muted-foreground">
            <X className="size-4" />
          </IconButton>
        }
        items={[
          {
            label: 'Delete goal',
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

function NewMilestoneRow({ goalId }: { goalId: string }) {
  const [title, setTitle] = useState('')
  async function add() {
    if (!title.trim()) return
    const goal = await goalRepo.get(goalId)
    if (!goal) return
    await goalRepo.setMilestones(goalId, [
      ...goal.milestones,
      {
        id: newId(),
        title: title.trim(),
        completed: false,
        dueDate: null,
        completedAt: null,
        order: goal.milestones.length,
      },
    ])
    setTitle('')
  }
  return (
    <div className="mt-2 flex gap-2">
      <Input
        value={title}
        placeholder="Add milestone…"
        className="h-8 text-xs"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add()
        }}
      />
      <Button variant="secondary" size="sm" onClick={() => void add()} disabled={!title.trim()}>
        Add
      </Button>
    </div>
  )
}

function CreateGoalModal({
  open,
  onClose,
  projects,
}: {
  open: boolean
  onClose: () => void
  projects: { id: string; name: string }[]
}) {
  const workspaceId = useWorkspaceId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('high')
  const [deadline, setDeadline] = useState('')
  const [color, setColor] = useState(ENTITY_COLORS[1])
  const [linked, setLinked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      const goal = await goalRepo.create(workspaceId, {
        title: title.trim(),
        description: description.trim(),
        priority,
        color,
        deadline: deadline ? fromDateInput(deadline) : null,
        linkedProjectIds: linked,
      })
      for (const projectId of linked) await goalRepo.linkProject(goal.id, projectId)
      toast.success('Goal created')
      setTitle('')
      setDescription('')
      setDeadline('')
      setLinked([])
      onClose()
    } catch (error) {
      toast.error((error as Error).message || 'Could not create the goal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New goal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            Create goal
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" required htmlFor="ng-title">
          <Input
            id="ng-title"
            autoFocus
            value={title}
            placeholder="Launch the side project"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="ng-desc">
          <Textarea
            id="ng-desc"
            value={description}
            placeholder="What does “done” look like?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <OptionSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Linked projects" hint="Their progress feeds this goal's percentage.">
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">No projects yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const selected = linked.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setLinked((cur) => (selected ? cur.filter((x) => x !== p.id) : [...cur, p.id]))
                    }
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      selected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}
        </Field>
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
