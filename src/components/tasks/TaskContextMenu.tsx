import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'
import type { Task } from '@/types'
import { cn } from '@/utils/cn'

interface TaskContextMenuProps {
  x: number
  y: number
  task: Task
  onClose: () => void
  onOpen?: (task: Task) => void
  onEdit?: (task: Task) => void
  onToggle?: (task: Task) => void
  onStartFocus?: (task: Task) => void
  onSchedule?: (task: Task) => void
  onDuplicate?: (task: Task) => void
  onDelete?: (task: Task) => void
}

export function TaskContextMenu({
  x,
  y,
  task,
  onClose,
  onOpen,
  onEdit,
  onToggle,
  onStartFocus,
  onSchedule,
  onDuplicate,
  onDelete,
}: TaskContextMenuProps) {
  const t = useT()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    function handleScroll() {
      onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Prevent overflowing window boundaries
  const menuWidth = 190
  const menuHeight = 230
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10)
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10)

  const isCompleted = task.status === 'completed'

  return createPortal(
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className={cn(
        'fixed z-50 min-w-48 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100',
      )}
    >
      <div className="px-2.5 py-1.5 border-b border-border/50 text-[11px] font-semibold text-muted-foreground truncate max-w-44">
        {task.title}
      </div>

      <div className="py-1">
        {onStartFocus ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onStartFocus(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
          >
            <Play className="size-3.5 fill-current" />
            <span>{t('taskStartFocus')}</span>
          </button>
        ) : null}

        {onEdit || onOpen ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              ;(onEdit ?? onOpen)?.(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Pencil className="size-3.5" />
            <span>{t('taskEdit')}</span>
          </button>
        ) : null}

        {onToggle ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onToggle(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            {isCompleted ? (
              <>
                <RotateCcw className="size-3.5 text-amber-500" />
                <span>{t('taskReopen', { title: '' })}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span>{t('taskComplete', { title: '' })}</span>
              </>
            )}
          </button>
        ) : null}

        {onSchedule ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onSchedule(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <CalendarClock className="size-3.5" />
            <span>{t('taskReschedule')}</span>
          </button>
        ) : null}

        {onDuplicate ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onDuplicate(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Copy className="size-3.5" />
            <span>{t('taskDuplicate')}</span>
          </button>
        ) : null}
      </div>

      {onDelete ? (
        <div className="border-t border-border/50 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose()
              onDelete(task)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>{t('cDelete')}</span>
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
