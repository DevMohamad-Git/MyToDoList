import type { HTMLAttributes, ReactNode } from 'react'
import {
  PRIORITY_CLASS,
  PRIORITY_DOT,
  PROJECT_STATUS_CLASS,
  TASK_STATUS_CLASS,
} from '@/config/constants'
import { priorityLabel, projectStatusLabel, t, taskStatusLabel } from '@/i18n'
import type { Priority, ProjectStatus, TaskStatus } from '@/types'
import { cn } from '@/utils/cn'

export function Badge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap',
        'border-border bg-muted/60 text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge className={cn(PRIORITY_CLASS[priority], className)}>
      <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} />
      {priorityLabel(priority)}
    </Badge>
  )
}

export function PriorityDot({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      title={t('prPriorityTitle', { p: priorityLabel(priority) })}
      className={cn('inline-block size-2 shrink-0 rounded-full', PRIORITY_DOT[priority], className)}
    />
  )
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <Badge className={cn(TASK_STATUS_CLASS[status], className)}>{taskStatusLabel(status)}</Badge>
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus
  className?: string
}) {
  return (
    <Badge className={cn(PROJECT_STATUS_CLASS[status], className)}>
      {projectStatusLabel(status)}
    </Badge>
  )
}

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return <Badge className={cn('border-border bg-muted/40', className)}>#{tag}</Badge>
}

/** Small coloured swatch for a project/goal/habit colour. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  )
}
