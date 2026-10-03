import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarClock,
  FolderKanban,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Menu,
  Modal,
  PageHeader,
  PriorityBadge,
  ProgressBar,
  SegmentedControl,
  Textarea,
  toast,
} from '@/components/ui'
import { ENTITY_COLORS, PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL } from '@/config/constants'
import { projectStatsMap } from '@/services/analytics'
import { projectRepo } from '@/storage/projectRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '@/types'
import { formatDate, formatDuration } from '@/utils/date'

const HEALTH_BADGE: Record<string, string> = {
  on_track: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  at_risk: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  off_track: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  done: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  idle: 'text-muted-foreground bg-muted/50 border-border',
}

const HEALTH_LABEL: Record<string, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  done: 'Done',
  idle: 'Idle',
}

type View = 'active' | 'all' | 'completed'

export function ProjectsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const [view, setView] = useState<View>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<Project | null>(null)

  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const statsById = useMemo(
    () => (snapshot ? projectStatsMap(snapshot) : new Map()),
    [snapshot],
  )

  const visible = useMemo(() => {
    switch (view) {
      case 'active':
        return projects.filter((p) => p.status === 'active' || p.status === 'planning' || p.status === 'on_hold')
      case 'completed':
        return projects.filter((p) => p.status === 'completed')
      case 'all':
      default:
        return projects
    }
  }, [projects, view])

  async function confirmDelete() {
    if (!deleting) return
    await projectRepo.remove(deleting.id, 'detach')
    toast.success(`Deleted “${deleting.name}” — its tasks moved to the Inbox`)
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Grouped work with deadlines, milestones and derived progress."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      <SegmentedControl
        className="mb-4"
        value={view}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
          { value: 'all', label: 'All' },
        ]}
        onChange={setView}
      />

      {!snapshot || !projects ? (
        <LoadingState label="Loading projects…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-8" />}
          title={view === 'completed' ? 'No completed projects yet' : 'No projects here'}
          description="Projects pull together tasks, milestones and tracked time, and derive their own progress."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => {
            const stats = statsById.get(project.id)
            return (
              <Card key={project.id} className="group relative flex flex-col">
                <div className="flex items-start gap-2.5 border-b border-border p-4">
                  <span
                    className="mt-1 size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/projects/${project.id}`}
                      className="block truncate text-sm font-semibold hover:text-accent"
                    >
                      {project.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge className={PROJECT_STATUS_CLASS[project.status]}>
                        {PROJECT_STATUS_LABEL[project.status]}
                      </Badge>
                      <Badge className={HEALTH_BADGE[stats?.health ?? 'idle']}>
                        {HEALTH_LABEL[stats?.health ?? 'idle']}
                      </Badge>
                      <PriorityBadge priority={project.priority} />
                    </div>
                  </div>
                  <Menu
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${project.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    }
                    items={[
                      {
                        label: 'Mark completed',
                        onSelect: () => {
                          void projectRepo.update(project.id, { status: 'completed' })
                          toast.success(`“${project.name}” completed`)
                        },
                        disabled: project.status === 'completed',
                      },
                      {
                        label: 'Reopen',
                        onSelect: () => void projectRepo.update(project.id, { status: 'active' }),
                        disabled: project.status !== 'completed',
                      },
                      {
                        label: 'Delete',
                        danger: true,
                        separated: true,
                        onSelect: () => setDeleting(project),
                      },
                    ]}
                  />
                </div>

                <Link to={`/projects/${project.id}`} className="flex flex-1 flex-col p-4">
                  {project.description ? (
                    <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
                  ) : null}

                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium tabular-nums">{Math.round(stats?.progress ?? 0)}%</span>
                  </div>
                  <ProgressBar value={stats?.progress ?? 0} color={project.color} />

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-sm font-semibold tabular-nums">{stats?.openTasks ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground">open</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {stats?.completedMilestones ?? 0}/{stats?.totalMilestones ?? 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">milestones</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {formatDuration(stats?.actualMinutes ?? 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">tracked</div>
                    </div>
                  </div>

                  {project.deadline ? (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      Due {formatDate(project.deadline)}
                    </div>
                  ) : null}
                </Link>
              </Card>
            )
          })}
        </div>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete project?"
        message={
          deleting ? (
            <>
              “{deleting.name}” will be removed. Its tasks are <strong>not</strong> deleted — they
              move to the Inbox so no work is lost.
            </>
          ) : null
        }
      />
    </>
  )
}

export function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const workspaceId = useWorkspaceId()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(ENTITY_COLORS[0])
  const [status, setStatus] = useState<ProjectStatus>('planning')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await projectRepo.create(workspaceId, {
        name: name.trim(),
        description: description.trim(),
        color,
        status,
        deadline: deadline ? new Date(`${deadline}T12:00:00`).toISOString() : null,
      })
      toast.success('Project created')
      setName('')
      setDescription('')
      setStatus('planning')
      setDeadline('')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || 'Could not create the project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" required htmlFor="np-name">
          <Input
            id="np-name"
            autoFocus
            value={name}
            placeholder="Website redesign"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="np-desc">
          <Textarea
            id="np-desc"
            value={description}
            placeholder="What is this project about?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-3 text-sm focus:border-accent focus:outline-none"
            >
              {PROJECT_STATUSES.filter((s) => s !== 'archived').map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deadline">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
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
  )
}
