import { CheckCheck, Flag, FolderInput, Trash2, X } from 'lucide-react'
import { Button, Menu } from '@/components/ui'
import { priorityLabel, useT } from '@/i18n'
import { PRIORITIES, type Priority, type Project } from '@/types'

export interface TaskBatchBarProps {
  selectedCount: number
  projects: Project[]
  onClearSelection: () => void
  onCompleteSelected: () => void
  onDeleteSelected: () => void
  onSetPrioritySelected: (priority: Priority) => void
  onMoveProjectSelected: (projectId: string | null) => void
}

/**
 * Floating bottom toolbar for bulk operations on multiple selected tasks.
 */
export function TaskBatchBar({
  selectedCount,
  projects,
  onClearSelection,
  onCompleteSelected,
  onDeleteSelected,
  onSetPrioritySelected,
  onMoveProjectSelected,
}: TaskBatchBarProps) {
  const t = useT()

  if (selectedCount === 0) return null

  const priorityMenuItems = PRIORITIES.map((p) => ({
    label: priorityLabel(p),
    onSelect: () => onSetPrioritySelected(p),
  }))

  const projectMenuItems = [
    {
      label: t('qaNoProject'),
      onSelect: () => onMoveProjectSelected(null),
    },
    ...projects.map((proj) => ({
      label: proj.name,
      onSelect: () => onMoveProjectSelected(proj.id),
    })),
  ]

  return (
    <div className="fixed bottom-6 start-1/2 z-40 -translate-x-1/2 transition-all animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <span className="text-xs font-semibold text-foreground px-1" dir="auto">
          {t('bulkSelected', { n: selectedCount })}
        </span>

        <div className="h-4 w-px bg-border/60 mx-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={onCompleteSelected}
          className="gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
        >
          <CheckCheck className="size-3.5" />
          {t('bulkComplete')}
        </Button>

        <Menu
          items={priorityMenuItems}
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Flag className="size-3.5" />
              {t('bulkSetPriority')}
            </Button>
          }
        />

        <Menu
          items={projectMenuItems}
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <FolderInput className="size-3.5" />
              {t('bulkMoveProject')}
            </Button>
          }
        />

        <Button
          size="sm"
          variant="outline"
          onClick={onDeleteSelected}
          className="gap-1.5 text-xs text-rose-400 hover:text-rose-300"
        >
          <Trash2 className="size-3.5" />
          {t('bulkDelete')}
        </Button>

        <button
          type="button"
          onClick={onClearSelection}
          className="ms-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          title={t('bulkDeselectAll')}
          aria-label={t('bulkDeselectAll')}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
