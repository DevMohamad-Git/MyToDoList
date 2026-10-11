import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Flag,
  Plus,
  Search,
  Share2,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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
  PriorityBadge,
  ProgressBar,
  SegmentedControl,
  Select,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import {
  ENTITY_COLORS,
  PROJECT_STATUS_CLASS,
} from '@/config/constants'
import { db } from '@/database/db'
import { projectStats } from '@/services/progress'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { timeRepo } from '@/storage/timeRepo'
import { useWorkspaceId } from '@/stores/workspace'
import {
  PRIORITIES,
  PROJECT_STATUSES,
  type ID,
  type Priority,
  type Project,
  type ProjectStatus,
  type Task,
} from '@/types'
import { formatDate, formatDuration, fromDateInput } from '@/utils/date'
import { newId } from '@/utils/id'
import { copyProjectSummary, downloadProjectSummary } from '@/utils/exportProject'
import { priorityLabel, projectStatusLabel, useT } from '@/i18n'

/**
 * One project: its numbers, milestones and task list on a single surface.
 * Progress is always derived through `projectStats`, never stored, so it cannot
 * drift from the tasks it summarises.
 */
export function ProjectDetailPage() {
  const t = useT()
  const { projectId } = useParams<{ projectId: ID }>()
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Milestones input state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDueDate, setMilestoneDueDate] = useState('')

  // Task search state
  const [taskSearch, setTaskSearch] = useState('')

  const project = useLiveQuery(
    async () => (projectId ? ((await projectRepo.get(projectId)) ?? null) : null),
    [projectId],
  )
  const tasks =
    useLiveQuery(
      () =>
        projectId ? taskRepo.byProject(workspaceId, projectId) : Promise.resolve([] as Task[]),
      [workspaceId, projectId],
    ) ?? []
  const minutes = useLiveQuery(
    () =>
      projectId
        ? timeRepo.totalForProject(projectId)
        : Promise.resolve(0),
    [projectId],
  )

  // Linked goals query
  const goals = useLiveQuery(
    () => db.goals.where('workspaceId').equals(workspaceId).toArray(),
    [workspaceId],
  ) ?? []

  const linkedGoals = useMemo(
    () =>
      projectId
        ? goals.filter((g) => Array.isArray(g.linkedProjectIds) && g.linkedProjectIds.includes(projectId))
        : [],
    [goals, projectId],
  )

  const stats = useMemo(
    () => (project ? projectStats(project, tasks, minutes ?? 0) : null),
    [project, tasks, minutes],
  )

  const [taskView, setTaskView] = useState<'open' | 'all'>('open')
  const visibleTasks = useMemo(() => {
    let list =
      taskView === 'open'
        ? tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
        : tasks

    if (taskSearch.trim()) {
      const q = taskSearch.trim().toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q))
    }

    return list
  }, [tasks, taskView, taskSearch])

  if (!projectId) return null
  if (project === undefined) return <LoadingState label={t('projectDetailLoading')} />
  if (project === null) {
    return (
      <EmptyState
        title={t('projectDetailNotFound')}
        description={t('projectDetailNotFoundDesc')}
        action={
          <Link to="/projects">
            <Button variant="outline">{t('projectDetailBackBtn')}</Button>
          </Link>
        }
      />
    )
  }

  async function toggle(task: Task) {
    const next = await taskRepo.toggleComplete(task.id)
    if (next?.status === 'completed') toast.success(t('toastCompleted', { title: next.title }))
  }

  async function confirmDelete() {
    if (!deleting) return
    await taskRepo.remove(deleting.id)
    toast.success(t('projectDetailTaskDeleted'))
    setDeleting(null)
  }

  async function addMilestone() {
    if (!milestoneTitle.trim() || !project) return
    const milestonesList = Array.isArray(project.milestones) ? project.milestones : []
    await projectRepo.setMilestones(project.id, [
      ...milestonesList,
      {
        id: newId(),
        title: milestoneTitle.trim(),
        completed: false,
        dueDate: milestoneDueDate ? new Date(`${milestoneDueDate}T12:00:00`).toISOString() : null,
        completedAt: null,
        order: milestonesList.length,
      },
    ])
    setMilestoneTitle('')
    setMilestoneDueDate('')
    toast.success(t('projectDetailMilestoneAdded'))
  }

  const milestonesList = Array.isArray(project.milestones) ? project.milestones : []

  return (
    <>
      <div className="mb-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
        >
          <ArrowLeft className="size-3 rtl:rotate-180" />
          {t('projectDetailBack')}
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="size-3 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </span>
        }
        description={project.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Menu
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Share2 className="size-3.5" />
                  {t('projectDetailExport')}
                </Button>
              }
              items={[
                {
                  label: t('projectsCopyReport'),
                  icon: <Copy className="size-3.5" />,
                  onSelect: () => void copyProjectSummary(project, stats ?? undefined, tasks),
                },
                {
                  label: t('projectsDownloadReport'),
                  icon: <Download className="size-3.5" />,
                  onSelect: () => downloadProjectSummary(project, stats ?? undefined, tasks),
                },
              ]}
            />
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              {t('projectDetailEdit')}
            </Button>
            <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
              <Plus className="size-4" />
              {t('projectDetailAddTask')}
            </Button>
          </div>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className={PROJECT_STATUS_CLASS[project.status]}>
            {projectStatusLabel(project.status)}
          </Badge>
          <PriorityBadge priority={project.priority} />
          {project.deadline ? (
            <Badge>
              <CalendarClock className="size-3" />
              {t('projectsDue', { date: formatDate(project.deadline) })}
            </Badge>
          ) : null}
        </div>
      </PageHeader>

      {/* Linked Goals Banner */}
      {linkedGoals.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/70 p-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Target className="size-3.5 text-accent" />
            {linkedGoals.length > 1 ? t('projectDetailLinkedGoals') : t('projectDetailLinkedGoal')}
          </span>
          {linkedGoals.map((g) => (
            <Link
              key={g.id}
              to="/goals"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent transition-colors"
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
              <span className="font-medium">{g.title}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {stats ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label={t('projectDetailStatProgress')}
            value={<span dir="ltr">{`${Math.round(stats.progress)}%`}</span>}
            tone="accent"
            hint={
              stats.totalMilestones > 0
                ? t('projectDetailStatProgressMilestones', {
                    done: stats.completedMilestones,
                    total: stats.totalMilestones,
                  })
                : t('projectDetailStatProgressFromTasks')
            }
          />
          <StatTile
            label={t('projectDetailStatOpenTasks')}
            value={<span dir="ltr">{stats.openTasks}</span>}
            hint={t('projectDetailStatTotalTasks', { total: stats.totalTasks })}
          />
          <StatTile
            label={t('projectDetailStatOverdue')}
            value={<span dir="ltr">{stats.overdueTasks}</span>}
            tone={stats.overdueTasks > 0 ? 'danger' : 'default'}
            hint={
              stats.blockedTasks > 0
                ? t('projectDetailStatBlocked', { n: stats.blockedTasks })
                : t('projectDetailStatNothingLate')
            }
          />
          <StatTile
            label={t('projectDetailStatRemaining')}
            value={formatDuration(stats.remainingEstimateMinutes)}
            hint={t('projectDetailStatTotalEstimate', {
              total: formatDuration(stats.estimatedMinutes),
            })}
          />
          <StatTile
            label={t('projectDetailStatTracked')}
            value={formatDuration(minutes ?? 0)}
            hint={
              stats.estimateAccuracy != null
                ? t('projectDetailStatAccuracy', {
                    p: Math.round(stats.estimateAccuracy * 100),
                  })
                : t('projectDetailStatNoAccuracy')
            }
          />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* ---------------------------------------------------------- tasks -- */}
        <Card>
          <CardHeader
            title={t('projectDetailTasksTitle')}
            description={t('projectDetailTasksShown', { n: visibleTasks.length })}
            icon={<Flag className="size-4" />}
            actions={
              <div className="flex items-center gap-2">
                <div className="relative w-36 sm:w-48">
                  <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder={t('projectDetailTasksSearchPlaceholder')}
                    className="h-7 ps-7 pe-6 text-xs"
                  />
                  {taskSearch ? (
                    <button
                      type="button"
                      onClick={() => setTaskSearch('')}
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
                <SegmentedControl
                  value={taskView}
                  options={[
                    { value: 'open', label: t('projectDetailTasksViewOpen') },
                    { value: 'all', label: t('projectDetailTasksViewAll') },
                  ]}
                  onChange={setTaskView}
                />
              </div>
            }
          />
          {visibleTasks.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Flag className="size-6" />}
                title={
                  taskSearch
                    ? t('projectDetailTasksEmptySearch')
                    : t('projectDetailTasksEmptyDefault')
                }
                description={
                  taskSearch
                    ? t('projectDetailTasksEmptySearchDesc')
                    : t('projectDetailTasksEmptyDefaultDesc')
                }
                action={
                  taskSearch ? (
                    <Button variant="outline" size="sm" onClick={() => setTaskSearch('')}>
                      {t('projectDetailClearSearch')}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
                      <Plus className="size-4" />
                      {t('projectDetailAddTask')}
                    </Button>
                  )
                }
              />
            </CardBody>
          ) : (
            <div>
              {visibleTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  project={project}
                  onToggle={toggle}
                  onOpen={(t) => setEditingId(t.id)}
                  onEdit={(t) => setEditingId(t.id)}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </Card>

        {/* ----------------------------------------------------- milestones -- */}
        <Card>
          <CardHeader
            title={t('projectDetailMilestonesTitle')}
            description={
              milestonesList.length === 0
                ? t('projectDetailMilestonesNone')
                : t('projectDetailMilestonesDone', {
                    done: milestonesList.filter((m) => m.completed).length,
                    total: milestonesList.length,
                  })
            }
            icon={<CheckCircle2 className="size-4" />}
          />
          {milestonesList.length > 0 ? (
            <div className="border-b border-border px-4 py-3">
              <ProgressBar value={stats?.milestoneProgress ?? 0} color={project.color} />
            </div>
          ) : null}

          <div className="divide-y divide-border">
            {milestonesList.map((milestone) => {
              const isOverdue =
                !milestone.completed &&
                milestone.dueDate &&
                new Date(milestone.dueDate) < new Date()

              return (
                <div key={milestone.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <button
                    type="button"
                    aria-label={
                      milestone.completed
                        ? t('projectDetailMilestoneReopenAria')
                        : t('projectDetailMilestoneCompleteAria')
                    }
                    onClick={() => void projectRepo.toggleMilestone(project.id, milestone.id)}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
                  >
                    {milestone.completed ? (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span
                      className={
                        milestone.completed
                          ? 'block truncate text-sm text-muted-foreground line-through'
                          : 'block truncate text-sm'
                      }
                    >
                      {milestone.title}
                    </span>
                    {milestone.dueDate ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarClock className="size-3" />
                        <span className={isOverdue ? 'text-rose-400 font-medium' : ''}>
                          {t('projectsDue', { date: formatDate(milestone.dueDate) })}
                          {isOverdue ? ` ${t('projectsDueOverdue')}` : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <IconButton
                    label={t('projectDetailMilestoneRemoveAria')}
                    onClick={() =>
                      void projectRepo.setMilestones(
                        project.id,
                        milestonesList.filter((m) => m.id !== milestone.id),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              )
            })}
          </div>

          {/* Add Milestone Form with Jalali Date Picker */}
          <div className="flex flex-col gap-2 border-t border-border p-3 bg-muted/20">
            <Input
              value={milestoneTitle}
              placeholder={t('projectDetailMilestonePlaceholder')}
              className="h-8 text-xs"
              onChange={(e) => setMilestoneTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addMilestone()
              }}
            />
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <JalaliDatePicker
                  value={milestoneDueDate}
                  placeholder={t('projectDetailMilestoneDateOptional')}
                  onChange={(v) => setMilestoneDueDate(v)}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void addMilestone()}
                disabled={!milestoneTitle.trim()}
              >
                {t('projectDetailMilestoneAddBtn')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <QuickAddDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultProjectId={project.id}
      />
      <TaskEditorModal taskId={editingId} open={editingId != null} onClose={() => setEditingId(null)} />
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('projectDetailDeleteTaskTitle')}
        message={deleting ? t('projectDetailDeleteTaskMsg', { title: deleting.title }) : null}
      />
      <EditProjectModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        onDone={() => navigate('/projects')}
      />
    </>
  )
}

function EditProjectModal({
  open,
  onClose,
  project,
  onDone,
}: {
  open: boolean
  onClose: () => void
  project: Project
  onDone: () => void
}) {
  const t = useT()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [color, setColor] = useState(project.color)
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [priority, setPriority] = useState<Priority>(project.priority)
  const [deadline, setDeadline] = useState(
    project.deadline ? formatDate(project.deadline, 'yyyy-MM-dd') : '',
  )
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await projectRepo.update(project.id, {
        name: name.trim(),
        description,
        color,
        status,
        priority,
        deadline: deadline ? fromDateInput(deadline) : null,
      })
      toast.success(t('projectsToastUpdated'))
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('projectsToastUpdateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('projectsEditProject')}
        footer={
          <>
            <Button
              variant="ghost"
              className="me-auto text-rose-400 hover:text-rose-300"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {t('cDelete')}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
              {t('projectsSaveProject')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('projectsFieldName')} required htmlFor="ep-name">
            <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('projectsFieldDescription')} htmlFor="ep-desc">
            <Textarea
              id="ep-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('projectsFieldStatus')}>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {projectStatusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('projectsFieldPriority')}>
              <OptionSelect
                value={priority}
                onChange={setPriority}
                options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
              />
            </Field>
            <Field label={t('projectsFieldDeadline')}>
              <JalaliDatePicker value={deadline} onChange={(v) => setDeadline(v)} />
            </Field>
          </div>
          <Field label={t('projectsFieldColour')}>
            <div className="flex flex-wrap gap-1.5">
              {ENTITY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('projectsFieldColourAria', { c })}
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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await projectRepo.remove(project.id, 'detach')
          toast.success(t('projectsToastDeleted', { name: project.name }))
          setDeleteOpen(false)
          onDone()
        }}
        title={t('projectsDeleteProject')}
        message={t('projectsDeleteConfirmMsg', { name: project.name })}
      />
    </>
  )
}
