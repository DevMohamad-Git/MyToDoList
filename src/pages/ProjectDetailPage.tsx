import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Flag,
  Plus,
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
  PRIORITY_LABEL,
  PROJECT_STATUS_CLASS,
  PROJECT_STATUS_LABEL,
} from '@/config/constants'
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

/**
 * One project: its numbers, milestones and task list on a single surface.
 * Progress is always derived through `projectStats`, never stored, so it cannot
 * drift from the tasks it summarises.
 */
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: ID }>()
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [milestoneTitle, setMilestoneTitle] = useState('')

  const project = useLiveQuery(
    // `undefined` = read in flight, `null` = the id does not exist, object = found.
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

  const stats = useMemo(
    () => (project ? projectStats(project, tasks, minutes ?? 0) : null),
    [project, tasks, minutes],
  )

  const [taskView, setTaskView] = useState<'open' | 'all'>('open')
  const visibleTasks = useMemo(
    () =>
      taskView === 'open'
        ? tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
        : tasks,
    [tasks, taskView],
  )

  if (!projectId) return null
  if (project === undefined) return <LoadingState label="Loading project…" />
  if (project === null) {
    return (
      <EmptyState
        title="Project not found"
        description="It may have been deleted."
        action={
          <Link to="/projects">
            <Button variant="outline">Back to projects</Button>
          </Link>
        }
      />
    )
  }

  async function toggle(task: Task) {
    const next = await taskRepo.toggleComplete(task.id)
    if (next?.status === 'completed') toast.success(`Completed “${next.title}”`)
  }

  async function confirmDelete() {
    if (!deleting) return
    await taskRepo.remove(deleting.id)
    toast.success('Task deleted')
    setDeleting(null)
  }

  async function addMilestone() {
    if (!milestoneTitle.trim() || !project) return
    await projectRepo.setMilestones(project.id, [
      ...project.milestones,
      {
        id: newId(),
        title: milestoneTitle.trim(),
        completed: false,
        dueDate: null,
        completedAt: null,
        order: project.milestones.length,
      },
    ])
    setMilestoneTitle('')
  }

  return (
    <>
      <div className="mb-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="size-3" />
          All projects
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
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
              <Plus className="size-4" />
              Add task
            </Button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className={PROJECT_STATUS_CLASS[project.status]}>
            {PROJECT_STATUS_LABEL[project.status]}
          </Badge>
          <PriorityBadge priority={project.priority} />
          {project.deadline ? (
            <Badge>
              <CalendarClock className="size-3" />
              Due {formatDate(project.deadline)}
            </Badge>
          ) : null}
        </div>
      </PageHeader>

      {stats ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Progress"
            value={`${Math.round(stats.progress)}%`}
            tone="accent"
            hint={
              stats.totalMilestones > 0
                ? `${stats.completedMilestones}/${stats.totalMilestones} milestones`
                : 'From tasks'
            }
          />
          <StatTile label="Open tasks" value={stats.openTasks} hint={`${stats.totalTasks} total`} />
          <StatTile
            label="Overdue"
            value={stats.overdueTasks}
            tone={stats.overdueTasks > 0 ? 'danger' : 'default'}
            hint={stats.blockedTasks > 0 ? `${stats.blockedTasks} blocked` : 'Nothing late'}
          />
          <StatTile
            label="Remaining estimate"
            value={formatDuration(stats.remainingEstimateMinutes)}
            hint={`${formatDuration(stats.estimatedMinutes)} estimated total`}
          />
          <StatTile
            label="Tracked time"
            value={formatDuration(minutes ?? 0)}
            hint={
              stats.estimateAccuracy != null
                ? `${Math.round(stats.estimateAccuracy * 100)}% of estimate`
                : 'No comparison yet'
            }
          />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* ---------------------------------------------------------- tasks -- */}
        <Card>
          <CardHeader
            title="Tasks"
            description={`${visibleTasks.length} shown`}
            icon={<Flag className="size-4" />}
            actions={
              <SegmentedControl
                value={taskView}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'all', label: 'All' },
                ]}
                onChange={setTaskView}
              />
            }
          />
          {visibleTasks.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Flag className="size-6" />}
                title="No tasks here"
                description="Add the first task for this project."
                action={
                  <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
                    <Plus className="size-4" />
                    Add task
                  </Button>
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
            title="Milestones"
            description={
              project.milestones.length === 0
                ? 'None yet'
                : `${project.milestones.filter((m) => m.completed).length}/${project.milestones.length} done`
            }
            icon={<CheckCircle2 className="size-4" />}
          />
          {project.milestones.length > 0 ? (
            <div className="border-b border-border px-4 py-3">
              <ProgressBar value={stats?.milestoneProgress ?? 0} color={project.color} />
            </div>
          ) : null}
          <div className="divide-y divide-border">
            {project.milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <button
                  type="button"
                  aria-label={milestone.completed ? 'Reopen milestone' : 'Complete milestone'}
                  onClick={() => void projectRepo.toggleMilestone(project.id, milestone.id)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
                >
                  {milestone.completed ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
                <span
                  className={
                    milestone.completed
                      ? 'min-w-0 flex-1 truncate text-sm text-muted-foreground line-through'
                      : 'min-w-0 flex-1 truncate text-sm'
                  }
                >
                  {milestone.title}
                </span>
                <IconButton
                  label="Remove milestone"
                  onClick={() =>
                    void projectRepo.setMilestones(
                      project.id,
                      project.milestones.filter((m) => m.id !== milestone.id),
                    )
                  }
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              value={milestoneTitle}
              placeholder="New milestone…"
              onChange={(e) => setMilestoneTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addMilestone()
              }}
            />
            <Button variant="secondary" onClick={() => void addMilestone()} disabled={!milestoneTitle.trim()}>
              Add
            </Button>
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
        title="Delete task?"
        message={deleting ? <>“{deleting.title}” will be removed permanently.</> : null}
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
      toast.success('Project updated')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || 'Could not update the project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Edit project"
        footer={
          <>
            <Button
              variant="ghost"
              className="mr-auto text-rose-400 hover:text-rose-300"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Name" required htmlFor="ep-name">
            <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="ep-desc">
            <Textarea
              id="ep-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <OptionSelect
                value={priority}
                onChange={setPriority}
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              />
            </Field>
            <Field label="Deadline">
              <JalaliDatePicker value={deadline} onChange={(v) => setDeadline(v)} />
            </Field>
          </div>
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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await projectRepo.remove(project.id, 'detach')
          toast.success('Project deleted — its tasks moved to the Inbox')
          setDeleteOpen(false)
          onDone()
        }}
        title="Delete project?"
        message={<>“{project.name}” will be removed. Its tasks move to the Inbox, not to the void.</>}
      />
    </>
  )
}
