import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown,
  Layers,
  ListFilter,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskBatchBar } from '@/components/tasks/TaskBatchBar'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskNestedSubtasks } from '@/components/tasks/TaskNestedSubtasks'
import { TaskRow } from '@/components/tasks/TaskRow'
import { VirtualTaskList } from '@/components/tasks/VirtualTaskList'
import {
  groupTaskList,
  sortTaskList,
  type GroupByMode,
  type SortByMode,
} from '@/components/tasks/taskGrouping'
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
import { TASKS_PAGE_CONFIG } from '@/config/tasksPageConfig'
import { useDebounce } from '@/hooks/useDebounce'
import { priorityLabel, useT, type TranslationKey } from '@/i18n'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo, type TaskFilter } from '@/storage/taskRepo'
import { useWorkspaceId } from '@/stores/workspace'
import { PRIORITIES, type ID, type Priority, type Task } from '@/types'
import { cn } from '@/utils/cn'

/**
 * Tasks Page — The centralized task management hub of FlowOS.
 * Incorporates three modular phases:
 *  - Phase 1: Quick wins (Debounced search, '/' focus shortcut, workspace stats, counts, undo toasts)
 *  - Phase 2: Performance (Indexed compound query optimization, smooth Virtual List)
 *  - Phase 3: Power UX (Batch actions, Group By, Sort By, Nested collapsible subtasks, shortcuts)
 *
 * Each phase can be isolated or rolled back in `src/config/tasksPageConfig.ts`.
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
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Primary filter state
  const [statusView, setStatusView] = useState<StatusView>('open')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(
    search,
    TASKS_PAGE_CONFIG.phase1QuickWins ? 200 : 0,
  )
  const [projectId, setProjectId] = useState<string>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [tag, setTag] = useState<string>('')

  // Phase 3 state: Grouping & Sorting
  const [groupBy, setGroupBy] = useState<GroupByMode>('none')
  const [sortBy, setSortBy] = useState<SortByMode>('order')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<ID>>(new Set())

  // Multi-selection state for Phase 3 Batch Actions
  const [selectedIds, setSelectedIds] = useState<Set<ID>>(new Set())

  // Modals & Dialogs
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState<Task[] | null>(null)

  // Deep link handling: /tasks?filter=inbox or /tasks?filter=overdue
  useEffect(() => {
    const requested = searchParams.get('filter') as StatusView | null
    if (
      requested &&
      ['open', 'today', 'overdue', 'inbox', 'completed', 'all'].includes(requested)
    ) {
      setStatusView(requested)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Phase 1: Global keyboard shortcuts ('/' to search, 'Escape' to clear, 'n' to add task)
  useEffect(() => {
    if (!TASKS_PAGE_CONFIG.phase1QuickWins) return

    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement
      const isInputActive =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable

      if (e.key === '/' && !isInputActive) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      } else if (
        (e.key === 'n' || e.key === 'N') &&
        !isInputActive &&
        TASKS_PAGE_CONFIG.phase3PowerFeatures
      ) {
        e.preventDefault()
        setQuickAddOpen(true)
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        if (search) {
          setSearch('')
        } else {
          searchInputRef.current?.blur()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [search])

  // Database queries via Dexie live query
  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const tags = useLiveQuery(() => taskRepo.allTags(workspaceId), [workspaceId]) ?? []

  // Phase 1: Real workspace-level stats (not scoped to temporary UI filters)
  const globalCounts = useLiveQuery(
    () => taskRepo.workspaceCounts(workspaceId),
    [workspaceId],
  )

  // Phase 1: Subtask and attachment metadata counts without N+1 queries
  const metadataCounts = useLiveQuery(
    () => taskRepo.getMetadataCounts(workspaceId),
    [workspaceId],
  )

  // Memoized query filter
  const filter: TaskFilter = useMemo(() => {
    const activeSearch = TASKS_PAGE_CONFIG.phase1QuickWins ? debouncedSearch : search
    const base: TaskFilter = {
      // In Phase 3, when nested subtasks are enabled, show top-level tasks to prevent visual clutter
      includeSubtasks: !TASKS_PAGE_CONFIG.phase3PowerFeatures,
      includeArchived: statusView === 'all',
    }

    if (activeSearch.trim()) base.search = activeSearch.trim()
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
  }, [statusView, debouncedSearch, search, projectId, priority, tag])

  const rawTasks = useLiveQuery(
    () => taskRepo.list(workspaceId, filter),
    [workspaceId, filter],
  )

  // Phase 3: Sort tasks
  const sortedTasks = useMemo(() => {
    if (!rawTasks) return []
    if (!TASKS_PAGE_CONFIG.phase3PowerFeatures) return rawTasks
    return sortTaskList(rawTasks, sortBy)
  }, [rawTasks, sortBy])

  // Phase 3: Group tasks
  const groupedTasks = useMemo(() => {
    if (!TASKS_PAGE_CONFIG.phase3PowerFeatures) {
      return [{ key: 'all', label: '', count: sortedTasks.length, tasks: sortedTasks }]
    }
    return groupTaskList(sortedTasks, groupBy, projects, t)
  }, [sortedTasks, groupBy, projects, t])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  // Toggle complete with Undo support (Phase 1)
  async function toggle(task: Task) {
    const next = await taskRepo.toggleComplete(task.id)
    if (next?.status === 'completed') {
      toast.success(t('toastCompleted', { title: next.title }), {
        label: t('toastUndo'),
        onClick: () => {
          void taskRepo.toggleComplete(next.id)
        },
      })
    }
  }

  async function duplicate(task: Task) {
    await taskRepo.duplicate(task.id)
    toast.success(t('toastTaskDuplicated'))
  }

  // Delete task with Undo support (Phase 1)
  async function confirmDelete() {
    if (!deleting) return
    const target = deleting
    const impact = await taskRepo.remove(target.id)

    // Remove from multi-selection if present
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(target.id)
      return next
    })

    toast.success(
      impact.tasks > 1
        ? t('toastDeletedSubtasks', { title: target.title, n: impact.tasks - 1 })
        : t('toastDeleted', { title: target.title }),
      {
        label: t('toastUndo'),
        onClick: () => {
          void taskRepo.restore(target)
          toast.success(t('toastRestored', { title: target.title }))
        },
      },
    )
    setDeleting(null)
  }

  // Phase 3: Batch action handlers
  function handleSelectTask(task: Task, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(task.id)
      else next.delete(task.id)
      return next
    })
  }

  function handleSelectAll() {
    if (!sortedTasks) return
    if (selectedIds.size === sortedTasks.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedTasks.map((t) => t.id)))
    }
  }

  async function handleBulkComplete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    for (const id of ids) {
      await taskRepo.setStatus(id, 'completed')
    }
    toast.success(t('toastBulkCompleted', { n: ids.length }))
    setSelectedIds(new Set())
  }

  async function handleBulkSetPriority(newPriority: Priority) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    await taskRepo.updateMany(ids, { priority: newPriority })
    toast.success(t('toastBulkPriority', { n: ids.length }))
    setSelectedIds(new Set())
  }

  async function handleBulkMoveProject(newProjectId: string | null) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    await taskRepo.updateMany(ids, { projectId: newProjectId })
    toast.success(t('toastBulkProject', { n: ids.length }))
    setSelectedIds(new Set())
  }

  async function handleConfirmBulkDelete() {
    if (!bulkDeleting) return
    const count = bulkDeleting.length
    for (const item of bulkDeleting) {
      await taskRepo.remove(item.id)
    }
    toast.success(t('toastBulkDeleted', { n: count }))
    setSelectedIds(new Set())
    setBulkDeleting(null)
  }

  function toggleExpandSubtasks(taskId: ID) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function toggleGroupCollapse(groupKey: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const openCount =
    sortedTasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length ?? 0

  return (
    <>
      <PageHeader
        title={t('tasksTitle')}
        description={t('tasksDesc')}
        actions={
          <div className="flex items-center gap-2">
            {TASKS_PAGE_CONFIG.phase3PowerFeatures && sortedTasks.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedIds.size === sortedTasks.length
                  ? t('bulkDeselectAll')
                  : t('bulkSelectAll')}
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setQuickAddOpen(true)}>
              <Plus className="size-4" />
              {t('shellNewTask')}
            </Button>
          </div>
        }
      />

      {/* Metric Tiles: Using Phase 1 Global Situation Stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('tasksShowing')}
          value={<span dir="ltr">{sortedTasks?.length ?? '…'}</span>}
          hint={t('tasksOpenInView', { n: openCount })}
          icon={<ListFilter className="size-4" />}
        />
        <StatTile
          label={t('tasksInbox')}
          value={
            TASKS_PAGE_CONFIG.phase1QuickWins
              ? (globalCounts?.inbox ?? '…')
              : (sortedTasks?.filter((task) => task.status === 'inbox').length ?? '…')
          }
          hint={t('tasksUnprocessed')}
        />
        <StatTile
          label={t('tasksBlocked')}
          value={
            TASKS_PAGE_CONFIG.phase1QuickWins
              ? (globalCounts?.blocked ?? '…')
              : (sortedTasks?.filter((task) => task.status === 'blocked').length ?? '…')
          }
          tone={
            (TASKS_PAGE_CONFIG.phase1QuickWins
              ? (globalCounts?.blocked ?? 0)
              : (sortedTasks?.filter((task) => task.status === 'blocked').length ?? 0)) > 0
              ? 'warning'
              : 'default'
          }
          hint={t('tasksWaitingOn')}
        />
      </div>

      {/* Main Filter & Control Toolbar */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2.5">
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
                ref={searchInputRef}
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

          {/* Phase 3: Group By & Sort Controls */}
          {TASKS_PAGE_CONFIG.phase3PowerFeatures ? (
            <div className="flex flex-wrap items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{t('groupByNone')}:</span>
                  <OptionSelect<GroupByMode>
                    value={groupBy}
                    onChange={setGroupBy}
                    options={[
                      { value: 'none', label: t('groupByNone') },
                      { value: 'project', label: t('groupByProject') },
                      { value: 'priority', label: t('groupByPriority') },
                      { value: 'dueDate', label: t('groupByDueDate') },
                    ]}
                    className="h-7 w-40 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{t('sortByOrder')}:</span>
                  <OptionSelect<SortByMode>
                    value={sortBy}
                    onChange={setSortBy}
                    options={[
                      { value: 'order', label: t('sortByOrder') },
                      { value: 'dueDate', label: t('sortByDueDate') },
                      { value: 'priority', label: t('sortByPriority') },
                      { value: 'title', label: t('sortByTitle') },
                      { value: 'createdAt', label: t('sortByCreated') },
                    ]}
                    className="h-7 w-36 text-xs"
                  />
                </div>
              </div>

              {selectedIds.size > 0 ? (
                <span className="font-semibold text-accent">
                  {t('bulkSelected', { n: selectedIds.size })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* Task List / Virtualized Container */}
      <Card>
        {!rawTasks ? (
          <LoadingState label={t('tasksLoading')} />
        ) : sortedTasks.length === 0 ? (
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
          <div className="divide-y divide-border/40">
            {groupedTasks.map((group) => {
              const isGroupCollapsed = collapsedGroups.has(group.key)
              return (
                <div key={group.key}>
                  {group.label ? (
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.key)}
                      className="flex w-full items-center justify-between bg-muted/40 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {group.color ? (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                        ) : null}
                        <span>{group.label}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                          {group.count}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          'size-3.5 text-muted-foreground transition-transform',
                          isGroupCollapsed ? '-rotate-90' : '',
                        )}
                      />
                    </button>
                  ) : null}

                  {!isGroupCollapsed ? (
                    <VirtualTaskList
                      items={group.tasks}
                      enabled={TASKS_PAGE_CONFIG.phase2Performance}
                      renderItem={(task) => {
                        const subInfo = metadataCounts?.subtasks.get(task.id)
                        const attCount = metadataCounts?.attachments.get(task.id)
                        const isExpanded = expandedSubtasks.has(task.id)

                        return (
                          <div key={task.id}>
                            <TaskRow
                              task={task}
                              project={
                                task.projectId
                                  ? (projectById.get(task.projectId) ?? null)
                                  : null
                              }
                              subtaskCount={subInfo?.total}
                              completedSubtasks={subInfo?.completed}
                              attachmentCount={attCount}
                              selected={
                                TASKS_PAGE_CONFIG.phase3PowerFeatures
                                  ? selectedIds.has(task.id)
                                  : undefined
                              }
                              onSelectChange={
                                TASKS_PAGE_CONFIG.phase3PowerFeatures
                                  ? handleSelectTask
                                  : undefined
                              }
                              onToggle={toggle}
                              onOpen={(t) => setEditingId(t.id)}
                              onEdit={(t) => setEditingId(t.id)}
                              onDuplicate={duplicate}
                              onDelete={setDeleting}
                              onStartFocus={(t) => navigate(`/focus?task=${t.id}`)}
                              extra={
                                (subInfo?.total ?? 0) > 0 &&
                                TASKS_PAGE_CONFIG.phase3PowerFeatures ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleExpandSubtasks(task.id)
                                    }}
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                    title={
                                      isExpanded
                                        ? t('tasksCollapseSubtasks')
                                        : t('tasksExpandSubtasks')
                                    }
                                  >
                                    <ChevronDown
                                      className={cn(
                                        'size-3 transition-transform',
                                        isExpanded ? 'rotate-180' : '',
                                      )}
                                    />
                                    <span>
                                      {isExpanded
                                        ? t('tasksCollapseSubtasks')
                                        : t('tasksExpandSubtasks')}
                                    </span>
                                  </button>
                                ) : null
                              }
                            />

                            {/* Phase 3: Nested collapsible subtasks */}
                            {isExpanded && TASKS_PAGE_CONFIG.phase3PowerFeatures ? (
                              <TaskNestedSubtasks
                                parentTaskId={task.id}
                                workspaceId={workspaceId}
                                onToggle={toggle}
                                onOpen={(t) => setEditingId(t.id)}
                                onDelete={setDeleting}
                                onStartFocus={(t) => navigate(`/focus?task=${t.id}`)}
                              />
                            ) : null}
                          </div>
                        )
                      }}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Phase 3: Floating Batch Operations Toolbar */}
      {TASKS_PAGE_CONFIG.phase3PowerFeatures ? (
        <TaskBatchBar
          selectedCount={selectedIds.size}
          projects={projects}
          onClearSelection={() => setSelectedIds(new Set())}
          onCompleteSelected={() => void handleBulkComplete()}
          onSetPrioritySelected={(p) => void handleBulkSetPriority(p)}
          onMoveProjectSelected={(pid) => void handleBulkMoveProject(pid)}
          onDeleteSelected={() => {
            const tasksToDelete = (sortedTasks ?? []).filter((t) => selectedIds.has(t.id))
            setBulkDeleting(tasksToDelete)
          }}
        />
      ) : null}

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <TaskEditorModal
        taskId={editingId}
        open={editingId != null}
        onClose={() => setEditingId(null)}
      />

      {/* Delete Confirmation Modal for Single Task */}
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('tasksDeleteTitle')}
        confirmLabel={t('cDelete')}
        cancelLabel={t('cCancel')}
        message={deleting ? t('tasksDeleteMsg', { title: deleting.title }) : null}
      />

      {/* Delete Confirmation Modal for Bulk Selection */}
      <ConfirmDialog
        open={bulkDeleting != null}
        onClose={() => setBulkDeleting(null)}
        onConfirm={handleConfirmBulkDelete}
        title={t('tasksDeleteTitle')}
        confirmLabel={t('cDelete')}
        cancelLabel={t('cCancel')}
        message={
          bulkDeleting
            ? t('toastBulkDeleted', { n: bulkDeleting.length }) +
              ' — ' +
              t('tasksDeleteMsg', { title: '…' })
            : null
        }
      />
    </>
  )
}
