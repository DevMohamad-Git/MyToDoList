import {
  Calendar,
  CheckCircle2,
  Circle,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
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
  JalaliDatePicker,
  LoadingState,
  Menu,
  Modal,
  OptionSelect,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { ENTITY_COLORS } from '@/config/constants'
import { useGoalsData } from '@/hooks/useGoalsData'
import { goalStatusLabel, priorityLabel, useT } from '@/i18n'
import { goalRepo } from '@/storage/goalRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useWorkspaceId } from '@/stores/workspace'
import { GOAL_STATUSES, PRIORITIES, type Goal, type GoalStatus, type Priority, type Task } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate, fromDateInput, toISO } from '@/utils/date'
import { newId } from '@/utils/id'

type GoalView = 'active' | 'achieved' | 'all'
type SortBy = 'order' | 'deadline' | 'progress' | 'priority' | 'title'

export function GoalsPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()

  const { loading, data } = useGoalsData(workspaceId)

  // Filters & State
  const [view, setView] = useState<GoalView>('active')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')
  const [healthFilter, setHealthFilter] = useState<'all' | 'on_track' | 'off_track'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('order')

  // Modals state
  const [createOpen, setCreateOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [tasksModalGoal, setTasksModalGoal] = useState<Goal | null>(null)
  const [deleting, setDeleting] = useState<Goal | null>(null)

  const projects = data?.projects ?? []
  const projectsById = data?.projectsById ?? new Map()
  const statsById = data?.statsById ?? new Map()
  const tasksByGoalId = data?.tasksByGoalId ?? new Map()
  const portfolioSummary = data?.portfolioSummary

  const filteredGoals = useMemo(() => {
    if (!data) return []
    let list = data.goals

    // 1. View filter
    if (view === 'active') {
      list = list.filter((g) => g.status === 'active')
    } else if (view === 'achieved') {
      list = list.filter((g) => g.status === 'achieved')
    }

    // 2. Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.description && g.description.toLowerCase().includes(q)),
      )
    }

    // 3. Priority filter
    if (priorityFilter !== 'all') {
      list = list.filter((g) => g.priority === priorityFilter)
    }

    // 4. Health filter
    if (healthFilter !== 'all') {
      list = list.filter((g) => {
        const stats = statsById.get(g.id)
        if (!stats) return true
        return healthFilter === 'on_track' ? stats.onTrack : !stats.onTrack
      })
    }

    // 5. Sorting
    const priorityWeights: Record<Priority, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return a.deadline.localeCompare(b.deadline)
      }
      if (sortBy === 'progress') {
        const pA = statsById.get(a.id)?.progress ?? 0
        const pB = statsById.get(b.id)?.progress ?? 0
        return pB - pA
      }
      if (sortBy === 'priority') {
        return priorityWeights[b.priority] - priorityWeights[a.priority]
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title)
      }
      return a.order - b.order
    })
  }, [data, view, search, priorityFilter, healthFilter, sortBy, statsById])

  async function confirmDelete() {
    if (!deleting) return
    await goalRepo.remove(deleting.id)
    toast.success(t('goalsToastDeleted', { title: deleting.title }))
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title={t('goalsTitle')}
        description={t('goalsDesc')}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('goalsNewGoal')}
          </Button>
        }
      />

      {/* ------------------------------------------------ Portfolio Header -- */}
      {portfolioSummary && portfolioSummary.total > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t('goalsStatActive')}
            value={<span dir="ltr">{portfolioSummary.active}</span>}
            hint={t('goalsStatAvgProgress', { p: portfolioSummary.avgProgress })}
            icon={<Target className="size-4" />}
          />
          <StatTile
            label={t('goalsStatHealth')}
            value={
              <span dir="ltr">
                {portfolioSummary.onTrack}/{portfolioSummary.active}
              </span>
            }
            hint={t('goalsStatOnTrackCount', {
              on: portfolioSummary.onTrack,
              off: portfolioSummary.offTrack,
            })}
            tone={portfolioSummary.offTrack > 0 ? 'warning' : 'default'}
            icon={<TrendingUp className="size-4" />}
          />
          <StatTile
            label={t('goalsStatMilestones')}
            value={
              <span dir="ltr">
                {portfolioSummary.completedMilestones}/{portfolioSummary.totalMilestones}
              </span>
            }
            hint={t('goalsStatMilestonesRatio', {
              done: portfolioSummary.completedMilestones,
              total: portfolioSummary.totalMilestones,
            })}
            icon={<CheckCircle2 className="size-4" />}
          />
          <StatTile
            label={t('goalsStatExecution')}
            value={
              <span dir="ltr">
                {portfolioSummary.completedTasks}/{portfolioSummary.totalTasks}
              </span>
            }
            hint={t('goalsStatTasksRatio', {
              done: portfolioSummary.completedTasks,
              total: portfolioSummary.totalTasks,
            })}
            icon={<ListChecks className="size-4" />}
          />
        </div>
      )}

      {/* ------------------------------------------------ Filters & Search -- */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            options={[
              { value: 'active', label: t('goalsViewActive') },
              { value: 'achieved', label: t('goalsViewAchieved') },
              { value: 'all', label: t('goalsViewAll') },
            ]}
            onChange={setView}
          />

          <div className="relative min-w-44 flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('goalsSearchPlaceholder')}
              className="h-8 w-full rounded-lg border border-input bg-background pe-2 ps-8 text-sm placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none"
            />
          </div>

          <OptionSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { value: 'all', label: t('goalsFilterAllPriorities') },
              ...PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) })),
            ]}
            className="w-32"
          />

          <OptionSelect
            value={healthFilter}
            onChange={setHealthFilter}
            options={[
              { value: 'all', label: t('goalsFilterAllHealth') },
              { value: 'on_track', label: t('goalsFilterOnTrack') },
              { value: 'off_track', label: t('goalsFilterOffTrack') },
            ]}
            className="w-36"
          />

          <OptionSelect
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'order', label: t('goalsSortOrder') },
              { value: 'deadline', label: t('goalsSortDeadline') },
              { value: 'progress', label: t('goalsSortProgress') },
              { value: 'priority', label: t('goalsSortPriority') },
            ]}
            className="w-32"
          />
        </div>
      </Card>

      {/* ------------------------------------------------ Goals Grid List -- */}
      {loading ? (
        <LoadingState label={t('goalsLoading')} />
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={<Target className="size-8" />}
          title={t('goalsEmptyTitle')}
          description={t('goalsEmptyDesc')}
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t('goalsNewGoal')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredGoals.map((goal) => {
            const stats = statsById.get(goal.id)
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                stats={stats}
                projectsById={projectsById}
                onEdit={() => setEditingGoal(goal)}
                onDelete={() => setDeleting(goal)}
                onOpenTasks={() => setTasksModalGoal(goal)}
              />
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------ Modals -- */}
      <CreateGoalModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      <EditGoalModal
        goal={editingGoal}
        open={editingGoal != null}
        onClose={() => setEditingGoal(null)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      <GoalTasksModal
        goal={tasksModalGoal}
        tasks={tasksModalGoal ? tasksByGoalId.get(tasksModalGoal.id) ?? [] : []}
        allWorkspaceTasks={data?.tasks ?? []}
        open={tasksModalGoal != null}
        onClose={() => setTasksModalGoal(null)}
      />

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('cDelete')}
        cancelLabel={t('cCancel')}
        title={t('goalsDeleteConfirmTitle')}
        message={
          deleting ? (
            <>{t('goalsDeleteConfirmMsg', { title: deleting.title })}</>
          ) : null
        }
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Goal Card Component (Memoized for high render performance)                 */
/* -------------------------------------------------------------------------- */

interface GoalCardProps {
  goal: Goal
  stats?: ReturnType<typeof import('@/services/progress').goalStats>
  projectsById: Map<string, import('@/types').Project>
  onEdit: () => void
  onDelete: () => void
  onOpenTasks: () => void
}

const GoalCard = memo(function GoalCard({
  goal,
  stats,
  projectsById,
  onEdit,
  onDelete,
  onOpenTasks,
}: GoalCardProps) {
  const t = useT()

  return (
    <Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
      <div>
        <div className="flex items-start gap-2.5 border-b border-border p-4">
          <span
            className="mt-1 size-3 shrink-0 rounded-full shadow-sm"
            style={{ backgroundColor: goal.color }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{goal.title}</h2>
            {goal.description ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {goal.description}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge>{priorityLabel(goal.priority)}</Badge>
              {goal.status !== 'active' ? (
                <Badge>{goalStatusLabel(goal.status)}</Badge>
              ) : null}
              {goal.deadline ? (
                <Badge
                  className={cn(
                    stats?.onTrack === false &&
                      'border-rose-500/25 bg-rose-500/10 text-rose-400',
                  )}
                >
                  {stats?.daysRemaining != null
                    ? stats.daysRemaining >= 0
                      ? t('goalsDaysLeft', { n: stats.daysRemaining })
                      : t('goalsDaysOver', { n: Math.abs(stats.daysRemaining) })
                    : t('goalsDue', { date: formatDate(goal.deadline) })}
                </Badge>
              ) : null}
            </div>
          </div>
          <GoalMenu goal={goal} onEdit={onEdit} onDelete={onDelete} onOpenTasks={onOpenTasks} />
        </div>

        <CardBody>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{t('goalsProgress')}</span>
            <span className="font-semibold tabular-nums">
              {Math.round(stats?.progress ?? 0)}%
            </span>
          </div>
          <ProgressBar value={stats?.progress ?? 0} color={goal.color} />

          {/* 3-Column Metrics with Interactive Tasks Box */}
          <div className="mt-3.5 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-muted/30 p-1.5">
              <div className="text-sm font-semibold tabular-nums">
                {stats?.completedMilestones ?? 0}/{stats?.totalMilestones ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('goalsMilestones')}</div>
            </div>
            <button
              type="button"
              onClick={onOpenTasks}
              className="group rounded-lg bg-muted/30 p-1.5 transition-colors hover:bg-accent/10"
              title={t('goalsTasksModalTitle', { title: goal.title })}
            >
              <div className="text-sm font-semibold tabular-nums group-hover:text-accent">
                {stats?.completedLinkedTasks ?? 0}/{stats?.linkedTasks ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground group-hover:text-accent">
                {t('goalsTasks')}
              </div>
            </button>
            <div className="rounded-lg bg-muted/30 p-1.5">
              <div className="text-sm font-semibold tabular-nums">
                {stats?.linkedProjects ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('goalsProjects')}</div>
            </div>
          </div>

          {/* Projects Pills */}
          {goal.linkedProjectIds.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {goal.linkedProjectIds.map((pid) => {
                const project = projectsById.get(pid)
                if (!project) return null
                return (
                  <Badge
                    key={pid}
                    className="border-transparent text-[11px]"
                    style={{ backgroundColor: `${project.color}20`, color: project.color }}
                  >
                    {project.name}
                  </Badge>
                )
              })}
            </div>
          ) : null}

          {/* Milestones list with optional due dates */}
          {goal.milestones.length > 0 ? (
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {goal.milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <button
                    type="button"
                    aria-label={
                      milestone.completed
                        ? t('goalsReopenMilestone')
                        : t('goalsCompleteMilestone')
                    }
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
                  {milestone.dueDate ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDate(milestone.dueDate)}
                    </span>
                  ) : null}
                  <IconButton
                    label={t('goalsRemoveMilestone')}
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
      </div>
    </Card>
  )
})

/* -------------------------------------------------------------------------- */
/* Goal Menu                                                                  */
/* -------------------------------------------------------------------------- */

function GoalMenu({
  goal,
  onEdit,
  onDelete,
  onOpenTasks,
}: {
  goal: Goal
  onEdit: () => void
  onDelete: () => void
  onOpenTasks: () => void
}) {
  const t = useT()
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Select
        value={goal.status}
        aria-label={t('goalsGoalStatus')}
        className="h-7 w-28 text-xs"
        onChange={(e) => void goalRepo.update(goal.id, { status: e.target.value as GoalStatus })}
      >
        {GOAL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {goalStatusLabel(s)}
          </option>
        ))}
      </Select>
      <Menu
        trigger={
          <IconButton label={t('goalsActions')} className="text-muted-foreground">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
        items={[
          {
            label: t('goalsEditGoal'),
            icon: <Pencil className="size-3.5" />,
            onSelect: onEdit,
          },
          {
            label: t('goalsTasks'),
            icon: <ListChecks className="size-3.5" />,
            onSelect: onOpenTasks,
          },
          {
            label: t('goalsDeleteGoal'),
            icon: <X className="size-3.5" />,
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* New Milestone Row (With optional due date support)                         */
/* -------------------------------------------------------------------------- */

function NewMilestoneRow({ goalId }: { goalId: string }) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

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
        dueDate: dueDate ? fromDateInput(dueDate) : null,
        completedAt: null,
        order: goal.milestones.length,
      },
    ])
    setTitle('')
    setDueDate('')
    setShowDatePicker(false)
  }

  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          value={title}
          placeholder={t('goalsAddMilestonePlaceholder')}
          className="h-8 flex-1 text-xs"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <IconButton
          label={t('goalsMilestoneDateOptional')}
          className={cn(
            'size-8 rounded-lg border border-input transition-colors',
            dueDate ? 'border-accent text-accent' : 'text-muted-foreground',
          )}
          onClick={() => setShowDatePicker((prev) => !prev)}
        >
          <Calendar className="size-3.5" />
        </IconButton>
        <Button variant="secondary" size="sm" onClick={() => void add()} disabled={!title.trim()}>
          {t('goalsAddMilestone')}
        </Button>
      </div>
      {showDatePicker && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-1.5">
          <span className="text-[10px] text-muted-foreground">{t('goalsMilestoneDueDate')}:</span>
          <JalaliDatePicker value={dueDate} onChange={(v) => setDueDate(v)} className="h-7 flex-1 text-xs" />
          {dueDate && (
            <IconButton label={t('goalsClearDate')} onClick={() => setDueDate('')}>
              <X className="size-3" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Create Goal Modal                                                          */
/* -------------------------------------------------------------------------- */

function CreateGoalModal({
  open,
  onClose,
  projects,
}: {
  open: boolean
  onClose: () => void
  projects: { id: string; name: string }[]
}) {
  const t = useT()
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
      toast.success(t('goalsToastCreated'))
      setTitle('')
      setDescription('')
      setDeadline('')
      setLinked([])
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('goalsToastCreateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goalsNewGoalModalTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cCancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {t('goalsCreateGoal')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('goalsFieldTitle')} required htmlFor="ng-title">
          <Input
            id="ng-title"
            autoFocus
            value={title}
            placeholder={t('goalsFieldTitlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t('goalsFieldDescription')} htmlFor="ng-desc">
          <Textarea
            id="ng-desc"
            value={description}
            placeholder={t('goalsFieldDescPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('goalsFieldPriority')}>
            <OptionSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            />
          </Field>
          <Field label={t('goalsFieldDeadline')}>
            <JalaliDatePicker value={deadline} onChange={(v) => setDeadline(v)} />
          </Field>
        </div>
        <Field label={t('goalsFieldLinkedProjects')} hint={t('goalsFieldLinkedProjectsHint')}>
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('goalsNoProjects')}</p>
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
        <Field label={t('goalsFieldColor')}>
          <div className="flex flex-wrap gap-1.5">
            {ENTITY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('goalsColorAria', { c })}
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

/* -------------------------------------------------------------------------- */
/* Edit Goal Modal (Full Edit Capability)                                     */
/* -------------------------------------------------------------------------- */

function EditGoalModal({
  goal,
  open,
  onClose,
  projects,
}: {
  goal: Goal | null
  open: boolean
  onClose: () => void
  projects: { id: string; name: string }[]
}) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<GoalStatus>('active')
  const [priority, setPriority] = useState<Priority>('high')
  const [deadline, setDeadline] = useState('')
  const [color, setColor] = useState(ENTITY_COLORS[1])
  const [linked, setLinked] = useState<string[]>([])
  const [manualProgress, setManualProgress] = useState<string>('')
  const [busy, setBusy] = useState(false)

  // Sync state whenever goal changes
  useEffect(() => {
    if (goal) {
      setTitle(goal.title)
      setDescription(goal.description ?? '')
      setStatus(goal.status)
      setPriority(goal.priority)
      setDeadline(goal.deadline ? toISO(new Date(goal.deadline)) : '')
      setColor(goal.color)
      setLinked(goal.linkedProjectIds ?? [])
      setManualProgress(goal.manualProgress != null ? String(goal.manualProgress) : '')
    }
  }, [goal])

  if (!goal) return null

  async function submit() {
    if (!title.trim() || !goal) return
    setBusy(true)
    try {
      const parsedManual =
        manualProgress.trim() === '' ? null : Math.max(0, Math.min(100, Number(manualProgress)))
      await goalRepo.update(goal.id, {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        color,
        deadline: deadline ? fromDateInput(deadline) : null,
        linkedProjectIds: linked,
        manualProgress: Number.isFinite(parsedManual) ? parsedManual : null,
      })
      toast.success(t('goalsToastUpdated'))
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('goalsToastUpdateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goalsEditGoalModalTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cCancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {t('goalsSaveGoal')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('goalsFieldTitle')} required htmlFor="eg-title">
          <Input
            id="eg-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t('goalsFieldDescription')} htmlFor="eg-desc">
          <Textarea
            id="eg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('goalsFieldStatus')}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as GoalStatus)}
              className="h-9 w-full text-xs"
            >
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {goalStatusLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('goalsFieldPriority')}>
            <OptionSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            />
          </Field>
          <Field label={t('goalsFieldDeadline')}>
            <JalaliDatePicker value={deadline} onChange={(v) => setDeadline(v)} />
          </Field>
        </div>

        <Field
          label={t('goalsFieldManualProgress')}
          hint={t('goalsFieldManualProgressHint')}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={manualProgress}
              placeholder="0–100"
              className="h-8 w-28 text-xs tabular-nums"
              onChange={(e) => setManualProgress(e.target.value)}
            />
            {manualProgress && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualProgress('')}
                className="text-xs text-muted-foreground"
              >
                {t('goalsResetManualProgress')}
              </Button>
            )}
          </div>
        </Field>

        <Field label={t('goalsFieldLinkedProjects')} hint={t('goalsFieldLinkedProjectsHint')}>
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('goalsNoProjects')}</p>
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

        <Field label={t('goalsFieldColor')}>
          <div className="flex flex-wrap gap-1.5">
            {ENTITY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('goalsColorAria', { c })}
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

/* -------------------------------------------------------------------------- */
/* Linked Tasks Modal (View & Link Tasks directly)                            */
/* -------------------------------------------------------------------------- */

function GoalTasksModal({
  goal,
  tasks,
  allWorkspaceTasks,
  open,
  onClose,
}: {
  goal: Goal | null
  tasks: Task[]
  allWorkspaceTasks: Task[]
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedExistingId, setSelectedExistingId] = useState('')
  const [busy, setBusy] = useState(false)

  if (!goal) return null

  // Eligible tasks to link (unlinked to this goal and not completed)
  const unlinkedCandidates = allWorkspaceTasks.filter(
    (tk) => tk.goalId !== goal.id && !tk.archived && !['completed', 'cancelled'].includes(tk.status),
  )

  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return
    setBusy(true)
    try {
      await taskRepo.create(workspaceId, {
        title: newTaskTitle.trim(),
        goalId: goal.id,
        status: 'planned',
      })
      toast.success(t('goalsToastTaskLinked'))
      setNewTaskTitle('')
    } finally {
      setBusy(false)
    }
  }

  async function handleLinkExisting() {
    if (!selectedExistingId) return
    setBusy(true)
    try {
      await taskRepo.update(selectedExistingId, { goalId: goal.id })
      toast.success(t('goalsToastTaskLinked'))
      setSelectedExistingId('')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlinkTask(taskId: string) {
    await taskRepo.update(taskId, { goalId: null })
    toast.success(t('goalsToastTaskUnlinked'))
  }

  const completedCount = tasks.filter((tk) => tk.status === 'completed').length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goalsTasksModalTitle', { title: goal.title })}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('cClose')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('goalsTasksModalDesc')}</span>
          <span className="font-medium text-foreground">
            {t('goalsTasksModalLinkedCount', { done: completedCount, total: tasks.length })}
          </span>
        </div>

        {/* Quick Add New Task */}
        <div className="flex gap-2">
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder={t('goalsTasksModalQuickAdd')}
            className="h-8 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateTask()
            }}
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleCreateTask()}
            disabled={busy || !newTaskTitle.trim()}
          >
            <Plus className="size-3.5" />
            {t('cCreate')}
          </Button>
        </div>

        {/* Link Existing dropdown */}
        {unlinkedCandidates.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedExistingId}
              onChange={(e) => setSelectedExistingId(e.target.value)}
              className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="">{t('goalsTasksModalLinkExisting')}</option>
              {unlinkedCandidates.slice(0, 50).map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleLinkExisting()}
              disabled={busy || !selectedExistingId}
            >
              {t('goalsLinkTaskBtn')}
            </Button>
          </div>
        )}

        {/* Task List */}
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('goalsTasksModalEmpty')}
          </p>
        ) : (
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => void taskRepo.toggleComplete(task.id)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate font-medium',
                    task.status === 'completed' && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </span>
                <Badge className="text-[10px]">{priorityLabel(task.priority)}</Badge>
                {task.dueDate ? (
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(task.dueDate)}
                  </span>
                ) : null}
                <IconButton
                  label={t('goalsTasksModalDetach')}
                  onClick={() => void handleUnlinkTask(task.id)}
                  className="text-muted-foreground hover:text-rose-400"
                >
                  <X className="size-3" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
