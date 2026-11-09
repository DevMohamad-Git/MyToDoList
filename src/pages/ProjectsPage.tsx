import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  Kanban,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  JalaliDatePicker,
  LoadingState,
  Modal,
  PageHeader,
  SegmentedControl,
  StatTile,
  Textarea,
  toast,
} from '@/components/ui'
import { ENTITY_COLORS } from '@/config/constants'
import { projectRepo } from '@/storage/projectRepo'
import { useWorkspaceId } from '@/stores/workspace'
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '@/types'
import { formatDuration } from '@/utils/date'
import { byOrderThenCreated } from '@/utils/math'
import { useProjectsData } from '@/hooks/useProjectsData'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { ProjectKanban } from '@/components/projects/ProjectKanban'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { projectStatusLabel, useT } from '@/i18n'

type StatusFilter = 'active' | 'planning' | 'on_hold' | 'completed' | 'all'
type SortBy = 'order' | 'deadline_asc' | 'progress_desc' | 'progress_asc' | 'priority_desc' | 'name_asc'
type ViewMode = 'grid' | 'kanban'

const PRIORITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function ProjectsPage() {
  return (
    <ErrorBoundary fallbackTitle="خطا در نمایش صفحه پروژه‌ها">
      <ProjectsPageContent />
    </ErrorBoundary>
  )
}

function ProjectsPageContent() {
  const t = useT()
  const navigate = useNavigate()
  const workspaceId = useWorkspaceId()
  const { loading, data } = useProjectsData(workspaceId)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [healthFilter, setHealthFilter] = useState<'on_track' | 'needs_attention' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('order')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultStatus, setCreateDefaultStatus] = useState<ProjectStatus>('planning')
  const [deleting, setDeleting] = useState<Project | null>(null)

  const projects = data?.projects ?? []
  const statsById = data?.statsById ?? new Map()
  const goalsByProjectId = data?.goalsByProjectId ?? new Map()
  const summary = data?.portfolioSummary

  // Filter and Sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects]

    // Status filtering
    if (statusFilter === 'active') {
      result = result.filter(
        (p) => p && (p.status === 'active' || p.status === 'planning' || p.status === 'on_hold'),
      )
    } else if (statusFilter === 'planning') {
      result = result.filter((p) => p && p.status === 'planning')
    } else if (statusFilter === 'on_hold') {
      result = result.filter((p) => p && p.status === 'on_hold')
    } else if (statusFilter === 'completed') {
      result = result.filter((p) => p && p.status === 'completed')
    }

    // Health filtering from interactive stat tiles
    if (healthFilter === 'on_track') {
      result = result.filter((p) => p && statsById.get(p.id)?.health === 'on_track')
    } else if (healthFilter === 'needs_attention') {
      result = result.filter((p) => {
        if (!p) return false
        const h = statsById.get(p.id)?.health
        return h === 'at_risk' || h === 'off_track'
      })
    }

    // Search query filtering
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (p) =>
          p &&
          ((p.name || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            p.tags?.some((t) => (t || '').toLowerCase().includes(q))),
      )
    }

    // Sorting
    result.sort((a, b) => {
      if (!a) return 1
      if (!b) return -1
      if (sortBy === 'deadline_asc') {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return (a.deadline || '').localeCompare(b.deadline || '')
      }
      if (sortBy === 'progress_desc') {
        const pA = statsById.get(a.id)?.progress ?? 0
        const pB = statsById.get(b.id)?.progress ?? 0
        return pB - pA
      }
      if (sortBy === 'progress_asc') {
        const pA = statsById.get(a.id)?.progress ?? 0
        const pB = statsById.get(b.id)?.progress ?? 0
        return pA - pB
      }
      if (sortBy === 'priority_desc') {
        return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0)
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '')
      }
      // 'order' default:
      return byOrderThenCreated(a, b)
    })

    return result
  }, [projects, statusFilter, healthFilter, searchQuery, sortBy, statsById])

  const handleMarkCompleted = useCallback(async (project: Project) => {
    await projectRepo.update(project.id, { status: 'completed' })
    toast.success(t('projectsToastCompleted', { name: project.name }))
  }, [t])

  const handleReopen = useCallback(async (project: Project) => {
    await projectRepo.update(project.id, { status: 'active' })
    toast.success(t('projectsToastReopened', { name: project.name }))
  }, [t])

  const handleStatusChange = useCallback(async (project: Project, nextStatus: ProjectStatus) => {
    await projectRepo.update(project.id, { status: nextStatus })
    toast.success(t('projectsToastMoved', { name: project.name, status: projectStatusLabel(nextStatus) }))
  }, [t])

  const handleNewProjectInStatus = useCallback((status: ProjectStatus) => {
    setCreateDefaultStatus(status)
    setCreateOpen(true)
  }, [])

  async function confirmDelete() {
    if (!deleting) return
    await projectRepo.remove(deleting.id, 'detach')
    toast.success(t('projectsToastDeleted', { name: deleting.name }))
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title={t('projectsTitle')}
        description={t('projectsDesc')}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/assistant?prompt=${encodeURIComponent('یک پروژه جدید با کارهاش برام بساز')}`}>
              <Button variant="secondary" className="gap-1.5 text-accent">
                <Sparkles className="size-4" />
                <span>{t('withAssistant')}</span>
              </Button>
            </Link>
            <Button
              variant="primary"
              onClick={() => {
                setCreateDefaultStatus('planning')
                setCreateOpen(true)
              }}
            >
              <Plus className="size-4" />
              {t('projectsNewProject')}
            </Button>
          </div>
        }
      />

      {/* Portfolio Health & Summary Bar */}
      {summary && summary.total > 0 ? (
        <div className="mb-6 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t('projectsStatActive')}
            value={<span dir="ltr">{summary.active}</span>}
            icon={<FolderKanban className="size-4 text-muted-foreground" />}
            hint={t('projectsStatActiveHint', { completed: summary.completed, total: summary.total })}
            onClick={healthFilter ? () => setHealthFilter(null) : undefined}
            title={healthFilter ? t('projectsClearHealthFilter') : undefined}
          />
          <StatTile
            label={t('projectsStatOnTrack')}
            value={<span dir="ltr">{summary.onTrack}</span>}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            tone={summary.onTrack > 0 ? 'accent' : 'default'}
            hint={t('projectsStatOnTrackHint')}
            onClick={() => setHealthFilter((prev) => (prev === 'on_track' ? null : 'on_track'))}
            active={healthFilter === 'on_track'}
            title={t('projectsFilterOnTrack')}
          />
          <StatTile
            label={t('projectsStatAttention')}
            value={<span dir="ltr">{(summary.atRisk || 0) + (summary.offTrack || 0)}</span>}
            icon={<AlertTriangle className="size-4 text-rose-500" />}
            tone={(summary.atRisk || 0) + (summary.offTrack || 0) > 0 ? 'danger' : 'default'}
            hint={t('projectsStatAttentionHint', { off: summary.offTrack || 0, risk: summary.atRisk || 0 })}
            onClick={() => setHealthFilter((prev) => (prev === 'needs_attention' ? null : 'needs_attention'))}
            active={healthFilter === 'needs_attention'}
            title={t('projectsFilterAttention')}
          />
          <StatTile
            label={t('projectsStatTracked')}
            value={formatDuration(summary.totalTrackedMinutes)}
            icon={<Clock className="size-4 text-blue-500" />}
            hint={
              <span className="flex items-center justify-between gap-1">
                <span>{t('projectsStatAvgProgress', { p: summary.avgProgress })}</span>
                <ExternalLink className="size-3 shrink-0 opacity-60" />
              </span>
            }
            onClick={() => navigate('/analytics')}
            title={t('projectsViewAnalyticsHint')}
          />
        </div>
      ) : null}

      {/* Filter and Control Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: View & Status Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={statusFilter}
            options={[
              { value: 'active', label: t('projectsViewActive') },
              { value: 'planning', label: t('projectsViewPlanning') },
              { value: 'on_hold', label: t('projectsViewOnHold') },
              { value: 'completed', label: t('projectsViewCompleted') },
              { value: 'all', label: t('projectsViewAll') },
            ]}
            onChange={(val) => setStatusFilter(val as StatusFilter)}
          />

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('projectsViewGridTooltip')}
            >
              <LayoutGrid className="size-3.5" />
              <span>{t('projectsViewGrid')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('projectsViewBoardTooltip')}
            >
              <Kanban className="size-3.5" />
              <span>{t('projectsViewBoard')}</span>
            </button>
          </div>
        </div>

        {/* Right: Search, Health Filter Chip & Sort Controls */}
        <div className="flex flex-1 items-center gap-2 min-w-[280px]">
          {/* Active Health Filter Chip */}
          {healthFilter ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent shrink-0 animate-in fade-in">
              <span>
                {healthFilter === 'on_track' ? t('projectsStatOnTrack') : t('projectsStatAttention')}
              </span>
              <button
                type="button"
                onClick={() => setHealthFilter(null)}
                className="ms-0.5 rounded p-0.5 hover:bg-accent/20 hover:text-foreground transition-colors cursor-pointer"
                title={t('projectsClearHealthFilter')}
              >
                <X className="size-3" />
              </button>
            </div>
          ) : null}

          {/* Expanded Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('projectsSearchPlaceholder')}
              className="h-9 w-full ps-9 pe-8 text-xs bg-muted/20 focus:bg-background transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs focus:border-accent focus:outline-none cursor-pointer"
            >
              <option value="order">{t('projectsSortOrder')}</option>
              <option value="deadline_asc">{t('projectsSortDeadline')}</option>
              <option value="progress_desc">{t('projectsSortProgressDesc')}</option>
              <option value="progress_asc">{t('projectsSortProgressAsc')}</option>
              <option value="priority_desc">{t('projectsSortPriority')}</option>
              <option value="name_asc">{t('projectsSortName')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState label={t('projectsLoading')} />
      ) : filteredAndSortedProjects.length === 0 && viewMode === 'grid' ? (
        <EmptyState
          icon={<FolderKanban className="size-8" />}
          title={
            searchQuery
              ? t('projectsEmptySearch')
              : statusFilter === 'completed'
                ? t('projectsEmptyCompleted')
                : t('projectsEmptyDefault')
          }
          description={t('projectsEmptyDesc')}
          action={
            searchQuery ? (
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                {t('projectsClearSearch')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setCreateDefaultStatus('planning')
                  setCreateOpen(true)
                }}
              >
                <Plus className="size-4" />
                {t('projectsNewProject')}
              </Button>
            )
          }
        />
      ) : viewMode === 'kanban' ? (
        <ProjectKanban
          projects={filteredAndSortedProjects}
          statsById={statsById}
          goalsByProjectId={goalsByProjectId}
          onStatusChange={handleStatusChange}
          onNewProjectInStatus={handleNewProjectInStatus}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              stats={statsById.get(project.id)}
              linkedGoals={goalsByProjectId.get(project.id)}
              onMarkCompleted={handleMarkCompleted}
              onReopen={handleReopen}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {/* Creation Modal */}
      <CreateProjectModal
        open={createOpen}
        defaultStatus={createDefaultStatus}
        onClose={() => setCreateOpen(false)}
      />

      {/* Safe Deletion Dialog */}
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('projectsDeleteProject')}
        message={deleting ? t('projectsDeleteConfirmMsg', { name: deleting.name }) : null}
      />
    </>
  )
}

export function CreateProjectModal({
  open,
  defaultStatus = 'planning',
  onClose,
}: {
  open: boolean
  defaultStatus?: ProjectStatus
  onClose: () => void
}) {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(ENTITY_COLORS[0])
  const [status, setStatus] = useState<ProjectStatus>(defaultStatus)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)

  // Sync default status when modal opens
  useEffect(() => {
    if (open) {
      setStatus(defaultStatus)
    }
  }, [open, defaultStatus])

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
      toast.success(t('projectsToastCreated'))
      setName('')
      setDescription('')
      setStatus(defaultStatus)
      setDeadline('')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('projectsToastCreateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('projectsNewProject')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cCancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {t('projectsCreateProject')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('projectsFieldName')} required htmlFor="np-name">
          <Input
            id="np-name"
            autoFocus
            value={name}
            placeholder={t('projectsFieldNamePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('projectsFieldDescription')} htmlFor="np-desc">
          <Textarea
            id="np-desc"
            value={description}
            placeholder={t('projectsFieldDescPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('projectsFieldStatus')}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-3 text-sm focus:border-accent focus:outline-none"
            >
              {PROJECT_STATUSES.filter((s) => s !== 'archived').map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel(s)}
                </option>
              ))}
            </select>
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
  )
}
