import {
  AlarmClock,
  CalendarClock,
  Copy,
  Link2,
  Paperclip,
  Pencil,
  Repeat,
  Timer,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Badge,
  Menu,
  PriorityDot,
  StatusBadge,
  TagBadge,
} from '@/components/ui'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { useT } from '@/i18n'
import { isTaskOverdue } from '@/services/progress'
import type { Project, Task } from '@/types'
import { cn } from '@/utils/cn'
import { formatDuration, formatRelativeDay } from '@/utils/date'

/**
 * One task as a list row.
 *
 * Shared by the task list, project detail, dashboard lanes and planner backlog so
 * a task looks and behaves identically everywhere. The checkbox is the primary
 * affordance; everything else is secondary metadata that degrades gracefully when
 * absent.
 */
export function TaskRow({
  task,
  project,
  subtaskCount,
  completedSubtasks,
  attachmentCount,
  selected,
  onToggle,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  onStartFocus,
  onSchedule,
  onSelectChange,
  extra,
  className,
}: {
  task: Task
  project?: Project | null
  subtaskCount?: number
  completedSubtasks?: number
  attachmentCount?: number
  selected?: boolean
  onToggle?: (task: Task) => void
  onOpen?: (task: Task) => void
  onEdit?: (task: Task) => void
  onDuplicate?: (task: Task) => void
  onDelete?: (task: Task) => void
  onStartFocus?: (task: Task) => void
  onSchedule?: (task: Task) => void
  onSelectChange?: (task: Task, selected: boolean) => void
  extra?: ReactNode
  className?: string
}) {
  const t = useT()
  const closed = CLOSED_TASK_STATUSES.includes(task.status)
  const overdue = isTaskOverdue(task)

  const menuItems = [
    onEdit && { label: t('taskEdit'), icon: <Pencil className="size-3.5" />, onSelect: () => onEdit(task) },
    onStartFocus && {
      label: t('taskStartFocus'),
      icon: <Timer className="size-3.5" />,
      onSelect: () => onStartFocus(task),
    },
    onSchedule && {
      label: t('taskReschedule'),
      icon: <CalendarClock className="size-3.5" />,
      onSelect: () => onSchedule(task),
    },
    onDuplicate && {
      label: t('taskDuplicate'),
      icon: <Copy className="size-3.5" />,
      onSelect: () => onDuplicate(task),
    },
    onDelete && {
      label: t('cDelete'),
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      separated: true,
      onSelect: () => onDelete(task),
    },
  ].filter(Boolean) as { label: string; icon: ReactNode; onSelect: () => void }[]

  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 border-b border-border px-3 py-2.5 transition-colors last:border-b-0',
        'hover:bg-muted/40',
        selected && 'bg-accent/8',
        className,
      )}
    >
      {onSelectChange ? (
        <input
          type="checkbox"
          aria-label={t('taskSelect', { title: task.title })}
          checked={Boolean(selected)}
          onChange={(e) => onSelectChange(task, e.target.checked)}
          className="mt-1 size-3.5 shrink-0 cursor-pointer rounded border-input accent-[var(--color-accent)]"
        />
      ) : null}

      <button
        type="button"
        role="checkbox"
        aria-checked={task.status === 'completed'}
        aria-label={
          task.status === 'completed'
            ? t('taskReopen', { title: task.title })
            : t('taskComplete', { title: task.title })
        }
        disabled={!onToggle}
        onClick={() => onToggle?.(task)}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          task.status === 'completed'
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-muted-foreground/40 hover:border-accent',
          !onToggle && 'cursor-default',
        )}
      >
        {task.status === 'completed' ? (
          <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none">
            <path d="M2 6.5 4.5 9 10 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <PriorityDot priority={task.priority} className="mt-1.5" />
          <button
            type="button"
            disabled={!onOpen}
            onClick={() => onOpen?.(task)}
            dir="auto"
            className={cn(
              'min-w-0 truncate text-start text-sm',
              closed && 'text-muted-foreground line-through',
              onOpen && 'hover:text-accent',
              !onOpen && 'cursor-default',
            )}
            title={task.title}
          >
            {task.title}
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 ps-4">
          {project ? (
            <Badge className="border-transparent" style={{ backgroundColor: `${project.color}20`, color: project.color }}>
              {project.name}
            </Badge>
          ) : null}

          {task.status !== 'completed' && task.status !== 'planned' ? (
            <StatusBadge status={task.status} />
          ) : null}

          {task.dueDate ? (
            <Badge
              className={cn(
                overdue && 'border-rose-500/25 bg-rose-500/10 text-rose-400',
              )}
              title={new Date(task.dueDate).toLocaleString()}
            >
              <AlarmClock className="size-3" />
              {formatRelativeDay(task.dueDate)}
            </Badge>
          ) : null}

          {task.estimatedDuration ? (
            <Badge title={t('taskEstDuration')}>
              <Timer className="size-3" />
              {formatDuration(task.estimatedDuration, { compact: true })}
              {task.actualDuration > 0
                ? ` / ${formatDuration(task.actualDuration, { compact: true })}`
                : ''}
            </Badge>
          ) : task.actualDuration > 0 ? (
            <Badge title={t('taskTracked')}>
              <Timer className="size-3" />
              {formatDuration(task.actualDuration, { compact: true })}
            </Badge>
          ) : null}

          {subtaskCount ? (
            <Badge title={t('taskSubtasks')}>
              {completedSubtasks ?? 0}/{subtaskCount}
            </Badge>
          ) : null}

          {task.recurrence ? (
            <Badge title={t('taskRecurring')}>
              <Repeat className="size-3" />
            </Badge>
          ) : null}

          {task.dependencies.length > 0 ? (
            <Badge title={t('taskDependencyTitle', { n: task.dependencies.length })}>
              <Link2 className="size-3" />
              {task.dependencies.length}
            </Badge>
          ) : null}

          {attachmentCount ? (
            <Badge title={t('taskAttachments')}>
              <Paperclip className="size-3" />
              {attachmentCount}
            </Badge>
          ) : null}

          {task.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}

          {extra}
        </div>
      </div>

      {menuItems.length > 0 ? (
        <Menu
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          items={menuItems}
          trigger={
            <button
              type="button"
              aria-label={t('taskActions', { title: task.title })}
              className="rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="text-xs leading-none tracking-widest">•••</span>
            </button>
          }
        />
      ) : null}
    </div>
  )
}
