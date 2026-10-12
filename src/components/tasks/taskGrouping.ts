import type { Priority, Project, Task } from '@/types'
import { priorityLabel, type TranslationKey } from '@/i18n'
import { isTaskOverdue } from '@/services/progress'

export type GroupByMode = 'none' | 'project' | 'priority' | 'dueDate'
export type SortByMode = 'order' | 'dueDate' | 'priority' | 'title' | 'createdAt'

const PRIORITY_WEIGHTS: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export interface TaskGroup {
  key: string
  label: string
  count: number
  color?: string
  tasks: Task[]
}

/** Sort tasks based on selected sorting mode */
export function sortTaskList(tasks: Task[], mode: SortByMode): Task[] {
  if (mode === 'order') {
    return tasks // already sorted by default compareTasks
  }

  const copy = [...tasks]
  switch (mode) {
    case 'dueDate':
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
    case 'priority':
      return copy.sort((a, b) => {
        return PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority]
      })
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title))
    case 'createdAt':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    default:
      return copy
  }
}

/** Group tasks based on selected grouping mode */
export function groupTaskList(
  tasks: Task[],
  mode: GroupByMode,
  projects: Project[],
  t: (key: TranslationKey) => string,
): TaskGroup[] {
  if (mode === 'none') {
    return [{ key: 'all', label: '', count: tasks.length, tasks }]
  }

  if (mode === 'project') {
    const groups = new Map<string, Task[]>()

    for (const task of tasks) {
      const pid = task.projectId ?? '__none__'
      const list = groups.get(pid) ?? []
      list.push(task)
      groups.set(pid, list)
    }

    const result: TaskGroup[] = []
    for (const proj of projects) {
      const pTasks = groups.get(proj.id)
      if (pTasks && pTasks.length > 0) {
        result.push({
          key: proj.id,
          label: proj.name,
          color: proj.color,
          count: pTasks.length,
          tasks: pTasks,
        })
      }
    }

    const noProjTasks = groups.get('__none__')
    if (noProjTasks && noProjTasks.length > 0) {
      result.push({
        key: '__none__',
        label: t('tasksGroupNoProject'),
        count: noProjTasks.length,
        tasks: noProjTasks,
      })
    }
    return result
  }

  if (mode === 'priority') {
    const priorities: Priority[] = ['critical', 'high', 'medium', 'low']
    const result: TaskGroup[] = []

    for (const pri of priorities) {
      const matched = tasks.filter((t) => t.priority === pri)
      if (matched.length > 0) {
        result.push({
          key: pri,
          label: priorityLabel(pri),
          count: matched.length,
          tasks: matched,
        })
      }
    }
    return result
  }

  if (mode === 'dueDate') {
    const now = new Date()
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    const overdue: Task[] = []
    const today: Task[] = []
    const upcoming: Task[] = []
    const noDate: Task[] = []

    for (const task of tasks) {
      if (!task.dueDate) {
        noDate.push(task)
      } else if (isTaskOverdue(task)) {
        overdue.push(task)
      } else {
        const d = new Date(task.dueDate)
        if (d <= todayEnd) {
          today.push(task)
        } else {
          upcoming.push(task)
        }
      }
    }

    const result: TaskGroup[] = []
    if (overdue.length > 0) {
      result.push({
        key: 'overdue',
        label: t('tasksGroupOverdue'),
        color: '#f43f5e',
        count: overdue.length,
        tasks: overdue,
      })
    }
    if (today.length > 0) {
      result.push({
        key: 'today',
        label: t('tasksGroupToday'),
        color: '#eab308',
        count: today.length,
        tasks: today,
      })
    }
    if (upcoming.length > 0) {
      result.push({
        key: 'upcoming',
        label: t('tasksGroupUpcoming'),
        color: '#3b82f6',
        count: upcoming.length,
        tasks: upcoming,
      })
    }
    if (noDate.length > 0) {
      result.push({
        key: 'noDate',
        label: t('tasksGroupNoDate'),
        count: noDate.length,
        tasks: noDate,
      })
    }
    return result
  }

  return [{ key: 'all', label: '', count: tasks.length, tasks }]
}
