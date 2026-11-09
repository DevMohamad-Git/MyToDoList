import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  FolderPlus,
  GripVertical,
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
import { cn } from '@/utils/cn'

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

  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ProjectStatus | null>(null)

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, project: Project) {
    e.dataTransfer.setData('text/plain', project.id)
    e.dataTransfer.setData('application/json', JSON.stringify({ projectId: project.id }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedProjectId(project.id)
  }

  function handleDragEnd() {
    setDraggedProjectId(null)
    setDragOverColumn(null)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, status: ProjectStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColumn !== status) {
      setDragOverColumn(status)
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>, status: ProjectStatus) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverColumn === status) {
        setDragOverColumn(null)
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetStatus: ProjectStatus) {
    e.preventDefault()
    const projectId = e.dataTransfer.getData('text/plain') || draggedProjectId
    setDragOverColumn(null)
    setDraggedProjectId(null)

    if (!projectId) return
    const project = safeProjects.find((p) => p && p.id === projectId)
    if (project && project.status !== targetStatus) {
      onStatusChange(project, targetStatus)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
      {COLUMNS.map((col) => {
        const columnProjects = safeProjects.filter((p) => p && p.status === col.status)
        const stageLabel = projectStatusLabel(col.status)
        const isColumnActive = dragOverColumn === col.status && draggedProjectId != null

        return (
          <div
            key={col.status}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={(e) => handleDragLeave(e, col.status)}
            onDrop={(e) => handleDrop(e, col.status)}
            className={cn(
              'flex flex-col rounded-xl border p-3 min-h-[500px] transition-all duration-150',
              col.tone,
              isColumnActive && 'ring-2 ring-accent border-accent bg-accent/[0.08] shadow-md',
            )}
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
                isColumnActive ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-accent/60 bg-accent/10 p-6 text-center text-xs font-medium text-accent animate-pulse">
                    {t('projectsKanbanDropHere')}
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                    {t('projectsKanbanEmptyStage')}
                  </div>
                )
              ) : (
                <>
                  {columnProjects.map((project) => {
                    if (!project) return null
                    const stats = statsById ? statsById.get(project.id) : undefined
                    const goals = goalsByProjectId ? goalsByProjectId.get(project.id) ?? [] : []
                    const isBeingDragged = draggedProjectId === project.id

                    return (
                      <Card
                        key={project.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, project)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          'group relative flex flex-col p-3 transition-all cursor-grab active:cursor-grabbing hover:border-accent/50 hover:shadow-sm select-none',
                          isBeingDragged && 'opacity-35 border-dashed border-accent scale-[0.98]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: project.color || col.accentColor }}
                            />
                            <Link
                              to={`/projects/${project.id}`}
                              className="truncate text-xs font-semibold hover:text-accent transition-colors"
                            >
                              {project.name || t('projectsUntitled')}
                            </Link>
                          </div>
                          <GripVertical className="size-3.5 shrink-0 text-muted-foreground/30 group-hover:text-accent transition-colors" />
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

                        {/* 3-metric stats box (matching Grid View) */}
                        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-muted/40 p-2 text-center border border-border/40">
                          <div>
                            <div className="text-xs font-semibold tabular-nums" dir="ltr">
                              {stats?.openTasks ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {t('projectsOpenTasksCount')}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold tabular-nums" dir="ltr">
                              {stats?.completedMilestones ?? 0}/{stats?.totalMilestones ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {t('projectsMilestonesCount')}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold tabular-nums" dir="ltr">
                              {formatDuration(stats?.actualMinutes ?? 0, { compact: true })}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {t('projectsTrackedCount')}
                            </div>
                          </div>
                        </div>

                        {project.deadline ? (
                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <CalendarClock className="size-3 text-muted-foreground/70" />
                            <span>{t('projectsDue', { date: formatDate(project.deadline) })}</span>
                          </div>
                        ) : null}
                      </Card>
                    )
                  })}
                  {isColumnActive && (
                    <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-accent/60 bg-accent/10 py-3 text-xs font-medium text-accent animate-pulse">
                      {t('projectsKanbanDropHere')}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
