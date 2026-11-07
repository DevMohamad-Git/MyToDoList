import { CornerDownLeft, Loader2, Plus } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { parseQuickAdd } from '@/components/tasks/QuickAddDialog'
import { toast } from '@/components/ui'
import { useT } from '@/i18n'
import { taskRepo } from '@/storage/taskRepo'
import type { ID, Task } from '@/types'
import { cn } from '@/utils/cn'

interface TaskInlineAddProps {
  workspaceId: string
  defaultProjectId?: string | null
  currentStatusView?: string
  onCreated?: (task: Task) => void
  className?: string
}

export function TaskInlineAdd({
  workspaceId,
  defaultProjectId,
  currentStatusView,
  onCreated,
  className,
}: TaskInlineAddProps) {
  const t = useT()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || submitting) return

    const parsed = parseQuickAdd(trimmed)
    if (!parsed.title) return

    setSubmitting(true)
    try {
      let status: 'inbox' | 'planned' | 'blocked' = 'inbox'
      let dueDate: string | null = null

      if (currentStatusView === 'today') {
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        dueDate = today.toISOString()
        status = 'planned'
      } else if (currentStatusView === 'blocked') {
        status = 'blocked'
      } else if (currentStatusView === 'inbox') {
        status = 'inbox'
      } else {
        status = 'inbox'
      }

      const created = await taskRepo.create(workspaceId, {
        title: parsed.title,
        tags: parsed.tags,
        priority: parsed.priority ?? 'medium',
        projectId: (defaultProjectId as ID) || null,
        dueDate,
        status,
      })

      setValue('')
      onCreated?.(created)

      toast.success(t('toastTaskAdded'), {
        label: t('toastUndo'),
        onClick: () => {
          void taskRepo.remove(created.id)
        },
      })
    } catch {
      toast.error(t('toastTaskAddFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    } else if (e.key === 'Escape') {
      setValue('')
    }
  }

  const destinationLabel =
    currentStatusView === 'today'
      ? t('filterToday')
      : currentStatusView === 'blocked'
        ? t('filterBlocked')
        : t('filterInbox')

  return (
    <div
      className={cn(
        'border-b border-border/60 bg-muted/15 p-3 sm:p-3.5 transition-colors',
        className,
      )}
    >
      <div className="group mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-border/80 bg-card px-4 py-2 shadow-xs transition-all hover:border-accent/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-accent">
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('tasksQuickAddInlinePlaceholder')}
          disabled={submitting}
          dir="auto"
          className="w-full bg-transparent text-sm placeholder:text-muted-foreground/70 focus:outline-none"
        />

        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="hidden sm:inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {destinationLabel}
          </span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-sans text-muted-foreground shadow-2xs">
            Enter <CornerDownLeft className="size-2.5" />
          </kbd>
        </div>
      </div>
    </div>
  )
}
