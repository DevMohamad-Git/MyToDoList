import { useLiveQuery } from 'dexie-react-hooks'
import { taskRepo } from '@/storage/taskRepo'
import type { ID, Task } from '@/types'
import { TaskRow } from './TaskRow'

export interface TaskNestedSubtasksProps {
  parentTaskId: ID
  workspaceId: ID
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onDelete: (task: Task) => void
  onStartFocus: (task: Task) => void
}

/**
 * Renders an indented nested list of subtasks directly beneath a parent task row.
 */
export function TaskNestedSubtasks({
  parentTaskId,
  workspaceId,
  onToggle,
  onOpen,
  onDelete,
  onStartFocus,
}: TaskNestedSubtasksProps) {
  const subtasks =
    useLiveQuery(
      () => taskRepo.subtasks(workspaceId, parentTaskId),
      [workspaceId, parentTaskId],
    ) ?? []

  if (subtasks.length === 0) return null

  return (
    <div className="border-b border-border/60 bg-muted/20 ps-6 pe-2 py-1 transition-all">
      <div className="border-s-2 border-accent/40 ps-2 flex flex-col gap-0.5">
        {subtasks.map((sub) => (
          <TaskRow
            key={sub.id}
            task={sub}
            className="border-b-0 py-1.5 hover:bg-muted/60 rounded-md"
            onToggle={onToggle}
            onOpen={onOpen}
            onEdit={onOpen}
            onDelete={onDelete}
            onStartFocus={onStartFocus}
          />
        ))}
      </div>
    </div>
  )
}
