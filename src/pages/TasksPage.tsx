import { useLiveQuery } from 'dexie-react-hooks'
import { ListFilter, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  OptionSelect,
  PageHeader,
  SegmentedControl,
  StatTile,
  toast,
} from '@/components/ui'
import { priorityLabel, useT, type TranslationKey } from '@/i18n'
import { PRIORITIES, type ID, type Priority, type Task } from '@/types'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo, type TaskFilter } from '@/storage/taskRepo'
import { useWorkspaceId } from '@/stores/workspace'

/**
 * The full task list. Everything on this page is a `TaskFilter` — the filter bar
 * never reshapes data in the page; it just describes what the repository should
 * return, so saved views elsewhere (recommendations deep links) land in the same
 * list the user would have built by hand.
 */

type StatusView = 'open' | 'today' | 'overdue' | 'inbox' | 'completed' | 'all'

const STATUS_VIEW_KEY: Record<StatusView, TranslationKey> = {
  open: 'filterOpen',
  today: 'filterToday',
  overdue: 'filterOverdue',
  inbox: 'filterInbox',
  completed: 'filterDone',
  all: 'filterAll',
}

export function TasksPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [statusView, setStatusView] = useState<StatusView>('open')
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [tag, setTag] = useState<string>('')
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  // Deep link: /tasks?filter=overdue opens the overdue view directly.
  useEffect(() => {
    const requested = searchParams.get('filter')
    if (requested === 'overdue') {
      setStatusView('overdue')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const tags = useLiveQuery(() => taskRepo.allTags(workspaceId), [workspaceId]) ?? []

  const filter: TaskFilter = useMemo(() => {
    const base: TaskFilter = { includeSubtasks: true, includeArchived: statusView === 'all' }
    if (search.trim()) base.search = search.trim()
    if (projectId) base.projectId = projectId
    if (priority) base.priority = [priority]
    if (tag) base.tags = [tag]
    switch (statusView) {
      case 'open':
        base.status = ['inbox', 'planned', 'in_progress', 'blocked']
        break
      case 'today': {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        base.status = ['inbox', 'planned', 'in_progress', 'blocked']
        base.dueBefore = new Date(start.getTime() + 86_400_000).toISOString()
        break
      }
      case 'overdue':
        base.overdue = true
        break
      case 'inbox':
        base.status = ['inbox']
        break
      case 'completed':
        base.status = ['completed']
        break
      case 'all':
        break
    }
    return base
  }, [statusView, search, projectId, priority, tag])

  const tasks = useLiveQuery(() => taskRepo.list(workspaceId, filter), [workspaceId, filter])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  async function toggle(task: Task) {
    const next = await taskRepo.toggleComplete(task.id)
    if (next?.status === 'completed') toast.success(t('toastCompleted', { title: next.title }))
  }

  async function duplicate(task: Task) {
    await taskRepo.duplicate(task.id)
    toast.success(t('toastTaskDuplicated'))
  }

  async function confirmDelete() {
    if (!deleting) return
    const impact = await taskRepo.remove(deleting.id)
    toast.success(
      impact.tasks > 1
        ? t('toastDeletedSubtasks', { title: deleting.title, n: impact.tasks - 1 })
        : t('toastDeleted', { title: deleting.title }),
    )
    setDeleting(null)
  }

  const openCount = tasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length ?? 0

  return (
    <>
      <PageHeader
        title={t('tasksTitle')}
        description={t('tasksDesc')}
        actions={
          <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
            <Plus className="size-4" />
            {t('shellNewTask')}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('tasksShowing')}
          value={<span dir="ltr">{tasks?.length ?? '…'}</span>}
          hint={t('tasksOpenInView', { n: openCount })}
          icon={<ListFilter className="size-4" />}
        />
        <StatTile
          label={t('tasksInbox')}
          value={tasks?.filter((task) => task.status === 'inbox').length ?? '…'}
          hint={t('tasksUnprocessed')}
        />
        <StatTile
          label={t('tasksBlocked')}
          value={tasks?.filter((task) => task.status === 'blocked').length ?? '…'}
          tone={(tasks?.filter((task) => task.status === 'blocked').length ?? 0) > 0 ? 'warning' : 'default'}
          hint={t('tasksWaitingOn')}
        />
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={statusView}
            options={(Object.keys(STATUS_VIEW_KEY) as StatusView[]).map((view) => ({
              value: view,
              label: t(STATUS_VIEW_KEY[view]),
            }))}
            onChange={setStatusView}
          />
          <div className="relative min-w-44 flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tasksSearchPlaceholder')}
              className="h-8 w-full rounded-lg border border-input bg-background pe-2 ps-8 text-sm placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none"
            />
          </div>
          <OptionSelect
            value={projectId}
            placeholder={t('tasksAllProjects')}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            className="w-40"
          />
          <OptionSelect
            value={priority}
            placeholder={t('tasksAnyPriority')}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            className="w-32"
          />
          <OptionSelect
            value={tag}
            placeholder={t('tasksAnyTag')}
            onChange={setTag}
            options={tags.map((tag) => ({ value: tag, label: `#${tag}` }))}
            className="w-32"
          />
        </div>
      </Card>

      <Card>
        {!tasks ? (
          <LoadingState label={t('tasksLoading')} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<ListFilter className="size-8" />}
            title={t('tasksNoMatch')}
            description={t('tasksNoMatchDesc')}
            action={
              <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
                <Plus className="size-4" />
                {t('shellNewTask')}
              </Button>
            }
          />
        ) : (
          <div>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                project={task.projectId ? (projectById.get(task.projectId) ?? null) : null}
                onToggle={toggle}
                onOpen={(t) => setEditingId(t.id)}
                onEdit={(t) => setEditingId(t.id)}
                onDuplicate={duplicate}
                onDelete={setDeleting}
                onStartFocus={(t) => navigate(`/focus?task=${t.id}`)}
              />
            ))}
          </div>
        )}
      </Card>

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <TaskEditorModal taskId={editingId} open={editingId != null} onClose={() => setEditingId(null)} />
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('tasksDeleteTitle')}
        confirmLabel={t('cDelete')}
        cancelLabel={t('cCancel')}
        message={
          deleting ? t('tasksDeleteMsg', { title: deleting.title }) : null
        }
      />
    </>
  )
}
