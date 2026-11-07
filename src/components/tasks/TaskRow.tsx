import {
  AlarmClock,
  CalendarClock,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Play,
  Repeat,
  Timer,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { TaskContextMenu } from '@/components/tasks/TaskContextMenu'
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
 * One task as an optimized, single-line list row.
 * Includes hover-revealed bulk checkbox, inline metadata badges, hover actions,
 * and context menu.
 */
export function TaskRow({
  task,
  project,
  subtaskCount,
  completedSubtasks,
  attachmentCount,
  selected,
  hasAnySelection,
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
  hasAnySelection?: boolean
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const closed = CLOSED_TASK_STATUSES.includes(task.status)
  const overdue = isTaskOverdue(task)

  const menuItems = [
    onEdit && {
      label: t('taskEdit'),
      icon: <Pencil className="size-3.5" />,
      onSelect: () => onEdit(task),
    },
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
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY })
      }}
      className={cn(
        'group flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-border/50 px-3 py-2 transition-colors last:border-b-0 min-h-[44px]',
        'hover:bg-muted/30',
        selected && 'bg-accent/8',
        className,
      )}
    >
      {/* Right side: Checkbox, complete circle, priority dot, title, description icon, extra */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onSelectChange ? (
          <input
            type="checkbox"
            aria-label={t('taskSelect', { title: task.title })}
            checked={Boolean(selected)}
            onChange={(e) => onSelectChange(task, e.target.checked)}
            className={cn(
              'size-3.5 shrink-0 cursor-pointer rounded border-input accent-[var(--color-accent)] transition-all',
              selected || hasAnySelection
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-90 -ms-1 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:ms-0 group-hover:pointer-events-auto',
            )}
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
            'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            task.status === 'completed'
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-muted-foreground/40 hover:border-accent',
            !onToggle && 'cursor-default',
          )}
        >
          {task.status === 'completed' ? (
            <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none">
              <path
                d="M2 6.5 4.5 9 10 3"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </button>

        <PriorityDot priority={task.priority} />

        <button
          type="button"
          disabled={!onOpen && !onEdit}
          onClick={() => (onOpen ?? onEdit)?.(task)}
          dir="auto"
          className={cn(
            'truncate text-start text-sm font-medium transition-colors',
            closed && 'text-muted-foreground line-through',
            (onOpen || onEdit) && 'hover:text-accent cursor-pointer',
          )}
          title={task.title}
        >
          {task.title}
        </button>

        {task.description ? (
          <span
            className="inline-flex shrink-0 items-center text-muted-foreground/50 hover:text-muted-foreground cursor-help"
            title={task.description}
          >
            <FileText className="size-3.5" />
          </span>
        ) : null}

        {task.description ? (
          <span
            className="hidden xl:inline-block truncate text-xs text-muted-foreground/60 max-w-44"
            dir="auto"
            title={task.description}
          >
            — {task.description}
          </span>
        ) : null}

        {extra}
      </div>

      {/* Left side: Metadata Badges + Hover Actions */}
      <div className="flex flex-wrap items-center gap-1.5 shrink-0 ps-6 md:ps-0">
        {project ? (
          <Badge
            className="border-transparent text-xs"
            style={{ backgroundColor: `${project.color}20`, color: project.color }}
          >
            {project.name}
          </Badge>
        ) : null}

        {task.status !== 'completed' && task.status !== 'planned' && task.status !== 'inbox' ? (
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

        {task.links && task.links.length > 0 ? (
          <Badge title={`${task.links.length} ${t('teLinks')}`}>
            <ExternalLink className="size-3" />
            {task.links.length}
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

        {/* Hover Quick Action Buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onStartFocus ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onStartFocus(task)
              }}
              title={t('taskStartFocus')}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/15 hover:text-accent transition-colors cursor-pointer"
            >
              <Play className="size-3.5 fill-current" />
            </button>
          ) : null}

          {onEdit || onOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ;(onEdit ?? onOpen)?.(task)
              }}
              title={t('taskEdit')}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}

          {menuItems.length > 0 ? (
            <Menu
              className="shrink-0"
              items={menuItems}
              trigger={
                <button
                  type="button"
                  aria-label={t('taskActions', { title: task.title })}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              }
            />
          ) : null}
        </div>
      </div>

      {contextMenu ? (
        <TaskContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={task}
          onClose={() => setContextMenu(null)}
          onOpen={onOpen}
          onEdit={onEdit}
          onToggle={onToggle}
          onStartFocus={onStartFocus}
          onSchedule={onSchedule}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  )
}
