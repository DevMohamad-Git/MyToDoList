import React from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderPlus,
  Play,
  RotateCcw,
} from 'lucide-react'
import {
  Button,
  Card,
  ProgressBar,
} from '@/components/ui'
import type { Goal, Project, ProjectStatus } from '@/types'
import type { ProjectStats } from '@/services/progress'
import { formatDate, formatDuration } from '@/utils/date'
import { projectStatusLabel, useT } from '@/i18n'

const COLUMNS: { status: ProjectStatus; tone: string; accentColor: string }[] = [
  {
    status: 'planning',
    tone: 'border-blue-500/30 bg-blue-500/5',
    accentColor: '#3b82f6',
  },
  {
    status: 'active',
    tone: 'border-emerald-500/30 bg-emerald-500/5',
    accentColor: '#10b981',
  },
  {
    status: 'on_hold',
    tone: 'border-amber-500/30 bg-amber-500/5',
    accentColor: '#f59e0b',
  },
  {
    status: 'completed',
    tone: 'border-purple-500/30 bg-purple-500/5',
    accentColor: '#8b5cf6',
  },
]

export interface ProjectKanbanProps {
  projects: Project[]
  statsById: Map<string, ProjectStats>
  goalsByProjectId: Map<string, Goal[]>
  onStatusChange: (project: Project, nextStatus: ProjectStatus) => void
  onNewProjectInStatus: (status: ProjectStatus) => void
}

export const ProjectKanban = React.memo(function ProjectKanban({
  projects,
  statsById,
  goalsByProjectId,
  onStatusChange,
  onNewProjectInStatus,
}: ProjectKanbanProps) {
  const t = useT()
  const safeProjects = Array.isArray(projects) ? projects : []

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
      {COLUMNS.map((col) => {
        const columnProjects = safeProjects.filter((p) => p && p.status === col.status)
        const stageLabel = projectStatusLabel(col.status)

        return (
          <div
            key={col.status}
            className={`flex flex-col rounded-xl border p-3 min-h-[500px] ${col.tone}`}
          >
            {/* Column Header */}
            <div className="mb-3 flex items-center justify-between pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: col.accentColor }}
                />
                <span className="text-sm font-semibold">{stageLabel}</span>
                <span
                  className="rounded-full bg-muted/80 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
                  dir="ltr"
                >
                  {columnProjects.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onNewProjectInStatus(col.status)}
                title={t('projectsKanbanNewInStage', { stage: stageLabel })}
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </div>

            {/* Column Cards */}
            <div className="flex flex-col gap-3 flex-1">
              {columnProjects.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  {t('projectsKanbanEmptyStage')}
                </div>
              ) : (
                columnProjects.map((project) => {
                  if (!project) return null
                  const stats = statsById ? statsById.get(project.id) : undefined
                  const goals = goalsByProjectId ? goalsByProjectId.get(project.id) ?? [] : []

                  return (
                    <Card
                      key={project.id}
                      className="group relative flex flex-col p-3 hover:border-accent/50 transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color || col.accentColor }}
                          />
                          <Link
                            to={`/projects/${project.id}`}
                            className="truncate text-xs font-semibold hover:text-accent"
                          >
                            {project.name || t('projectsUntitled')}
                          </Link>
                        </div>
                      </div>

                      {goals.length > 0 && goals[0]?.title ? (
                        <div className="mt-1 text-[10px] text-muted-foreground truncate">
                          🎯 {goals[0].title}
                        </div>
                      ) : null}

                      {/* Progress Bar */}
                      <div className="mt-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{t('projectsProgress')}</span>
                          <span className="font-medium tabular-nums" dir="ltr">
                            {Math.round(stats?.progress || 0)}%
                          </span>
                        </div>
                        <ProgressBar value={stats?.progress || 0} color={project.color} />
                      </div>

                      {/* Stats footer */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2">
                        <span>
                          <span dir="ltr">{stats?.openTasks ?? 0}</span> {t('projectsOpenTasksCount')}
                        </span>
                        <span dir="ltr">
                          {formatDuration(stats?.actualMinutes ?? 0, { compact: true })}
                        </span>
                        {project.deadline ? (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="size-3" />
                            {formatDate(project.deadline, 'd MMM')}
                          </span>
                        ) : null}
                      </div>

                      {/* Status Transition Toolbar */}
                      <div className="mt-2 flex items-center justify-between gap-1 border-t border-border/40 pt-2">
                        {col.status === 'planning' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full text-xs h-7"
                            onClick={() => onStatusChange(project, 'active')}
                          >
                            <Play className="size-3 me-1 text-emerald-400 rtl:rotate-180" />{' '}
                            {t('projectsKanbanStart')}
                          </Button>
                        ) : null}

                        {col.status === 'active' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 text-[11px] h-7"
                              onClick={() => onStatusChange(project, 'on_hold')}
                            >
                              <Clock className="size-3 me-1 text-amber-400" />{' '}
                              {t('projectsKanbanHold')}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 text-[11px] h-7"
                              onClick={() => onStatusChange(project, 'completed')}
                            >
                              <CheckCircle2 className="size-3 me-1 text-emerald-400" />{' '}
                              {t('projectsKanbanDone')}
                            </Button>
                          </>
                        ) : null}

                        {col.status === 'on_hold' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full text-xs h-7"
                            onClick={() => onStatusChange(project, 'active')}
                          >
                            <Play className="size-3 me-1 text-emerald-400 rtl:rotate-180" />{' '}
                            {t('projectsKanbanResume')}
                          </Button>
                        ) : null}

                        {col.status === 'completed' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs h-7"
                            onClick={() => onStatusChange(project, 'active')}
                          >
                            <RotateCcw className="size-3 me-1" /> {t('projectsReopen')}
                          </Button>
                        ) : null}
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
