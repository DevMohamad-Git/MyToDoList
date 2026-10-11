import React from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  Copy,
  Download,
  MoreHorizontal,
  Target,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Menu,
  PriorityBadge,
  ProgressBar,
} from '@/components/ui'
import { PROJECT_STATUS_CLASS } from '@/config/constants'
import type { Goal, Priority, Project } from '@/types'
import type { ProjectStats } from '@/services/progress'
import { formatDate, formatDuration } from '@/utils/date'
import { copyProjectSummary, downloadProjectSummary } from '@/utils/exportProject'
import { healthLabel, projectStatusLabel, useT } from '@/i18n'

const HEALTH_BADGE: Record<string, string> = {
  on_track: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  at_risk: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  off_track: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  done: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  idle: 'text-muted-foreground bg-muted/50 border-border',
}

export interface ProjectCardProps {
  project: Project
  stats?: ProjectStats
  linkedGoals?: Goal[]
  onMarkCompleted: (project: Project) => void
  onReopen: (project: Project) => void
  onDelete: (project: Project) => void
}

export const ProjectCard = React.memo(function ProjectCard({
  project,
  stats,
  linkedGoals = [],
  onMarkCompleted,
  onReopen,
  onDelete,
}: ProjectCardProps) {
  const t = useT()
  if (!project) return null

  const isCompleted = project.status === 'completed'
  const statusKey = project.status ?? 'active'
  const healthKey = stats?.health ?? 'idle'
  const priorityKey: Priority = project.priority ?? 'medium'
  const projectName = project.name || t('projectsUntitled')

  return (
    <Card className="group relative flex flex-col transition-all hover:border-accent/40 hover:shadow-md">
      <div className="flex items-start gap-2.5 border-b border-border p-4">
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color || 'var(--color-accent)' }}
        />
        <div className="min-w-0 flex-1">
          <Link
            to={`/projects/${project.id}`}
            className="block truncate text-sm font-semibold hover:text-accent transition-colors"
          >
            {projectName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge className={PROJECT_STATUS_CLASS[statusKey] ?? 'text-muted-foreground'}>
              {projectStatusLabel(statusKey)}
            </Badge>
            <Badge className={HEALTH_BADGE[healthKey] ?? HEALTH_BADGE.idle}>
              {healthLabel(healthKey)}
            </Badge>
            <PriorityBadge priority={priorityKey} />

            {linkedGoals && linkedGoals.length > 0 && linkedGoals[0]?.title ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
                <Target className="size-3 text-accent" />
                <span className="truncate max-w-[100px]">{linkedGoals[0].title}</span>
              </span>
            ) : null}
          </div>
        </div>

        <Menu
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('projectsActionsAria', { name: projectName })}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
          items={[
            {
              label: isCompleted ? t('projectsReopen') : t('projectsMarkCompleted'),
              onSelect: () => (isCompleted ? onReopen(project) : onMarkCompleted(project)),
            },
            {
              label: t('projectsCopyReport'),
              icon: <Copy className="size-3.5" />,
              onSelect: () => void copyProjectSummary(project, stats),
            },
            {
              label: t('projectsDownloadReport'),
              icon: <Download className="size-3.5" />,
              onSelect: () => downloadProjectSummary(project, stats),
            },
            {
              label: t('cDelete'),
              danger: true,
              separated: true,
              onSelect: () => onDelete(project),
            },
          ]}
        />
      </div>

      <Link
        to={`/projects/${project.id}`}
        className="flex flex-1 flex-col p-4 focus:outline-none"
      >
        {project.description ? (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {project.description}
          </p>
        ) : null}

        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{t('projectsProgress')}</span>
          <span className="font-medium tabular-nums" dir="ltr">
            {Math.round(stats?.progress || 0)}%
          </span>
        </div>
        <ProgressBar value={stats?.progress || 0} color={project.color} />

        <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2 text-center border border-border/40">
          <div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">
              {stats?.openTasks ?? 0}
            </div>
            <div className="text-[10px] text-muted-foreground">{t('projectsOpenTasksCount')}</div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">
              {stats?.completedMilestones ?? 0}/{stats?.totalMilestones ?? 0}
            </div>
            <div className="text-[10px] text-muted-foreground">{t('projectsMilestonesCount')}</div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">
              {formatDuration(stats?.actualMinutes ?? 0, { compact: true })}
            </div>
            <div className="text-[10px] text-muted-foreground">{t('projectsTrackedCount')}</div>
          </div>
        </div>

        {project.deadline ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5 text-muted-foreground/70" />
            {t('projectsDue', { date: formatDate(project.deadline) })}
          </div>
        ) : null}
      </Link>
    </Card>
  )
})
