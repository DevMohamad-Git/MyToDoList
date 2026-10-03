import { db } from '@/database/db'
import { createTask } from '@/database/factories'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { logActivity } from '@/storage/activityRepo'
import { attachmentRepo } from '@/storage/attachmentRepo'
import { nextOccurrence } from '@/services/recurrence'
import type { DayKey, ID, Priority, Task, TaskStatus } from '@/types'
import { nowISO, toDayKey, toISO } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Task repository — the only module allowed to write to the `tasks` table.
 *
 * Two invariants it is responsible for:
 *  1. **Referential safety.** Deleting a task removes its subtrees, its
 *     attachments (and their blobs), its time entries, and any dependency edges
 *     pointing at it. Nothing is left dangling.
 *  2. **Audit completeness.** Every meaningful mutation writes an activity row,
 *     because the review and analytics features read history, not just state.
 */

export interface TaskFilter {
  status?: TaskStatus[]
  priority?: Priority[]
  projectId?: ID | null
  goalId?: ID | null
  tags?: string[]
  /** Only tasks whose due date is before now and which are still open. */
  overdue?: boolean
  /** `true` = scheduled (has startDate), `false` = unscheduled. */
  scheduled?: boolean
  dueBefore?: string
  dueAfter?: string
  /** Substring match across title, description, notes and tags. */
  search?: string
  includeArchived?: boolean
  includeSubtasks?: boolean
  minEstimate?: number
  maxEstimate?: number
}

function matchesFilter(task: Task, filter: TaskFilter, now: Date): boolean {
  if (!filter.includeArchived && task.archived) return false
  if (!filter.includeSubtasks && task.parentTaskId) return false
  if (filter.status?.length && !filter.status.includes(task.status)) return false
  if (filter.priority?.length && !filter.priority.includes(task.priority)) return false
  if (filter.projectId !== undefined && task.projectId !== filter.projectId) return false
  if (filter.goalId !== undefined && task.goalId !== filter.goalId) return false
  if (filter.tags?.length && !filter.tags.every((t) => task.tags.includes(t))) return false
  if (filter.scheduled === true && !task.startDate) return false
  if (filter.scheduled === false && task.startDate) return false
  if (filter.overdue) {
    if (!task.dueDate) return false
    if (CLOSED_TASK_STATUSES.includes(task.status)) return false
    if (new Date(task.dueDate) >= now) return false
  }
  if (filter.dueBefore && (!task.dueDate || task.dueDate > filter.dueBefore)) return false
  if (filter.dueAfter && (!task.dueDate || task.dueDate < filter.dueAfter)) return false
  if (filter.minEstimate != null && (task.estimatedDuration ?? 0) < filter.minEstimate) return false
  if (filter.maxEstimate != null && (task.estimatedDuration ?? 0) > filter.maxEstimate) return false
  if (filter.search) {
    const q = filter.search.toLowerCase()
    const haystack = `${task.title}\n${task.description}\n${task.notes}\n${task.tags.join(' ')}`
    if (!haystack.toLowerCase().includes(q)) return false
  }
  return true
}

export const taskRepo = {
  get(id: ID) {
    return db.tasks.get(id)
  },

  async getMany(ids: ID[]): Promise<Task[]> {
    if (ids.length === 0) return []
    const rows = await db.tasks.bulkGet(ids)
    return rows.filter((t): t is Task => Boolean(t))
  },

  allForWorkspace(workspaceId: ID) {
    return db.tasks.where('workspaceId').equals(workspaceId).toArray()
  },

  /** Filtered list. Runs the indexed narrowing first, then in-memory predicates. */
  async list(workspaceId: ID, filter: TaskFilter = {}): Promise<Task[]> {
    let rows: Task[]
    // Use the most selective available index to avoid a full workspace scan.
    if (filter.projectId !== undefined && filter.projectId !== null) {
      rows = await db.tasks
        .where('[workspaceId+projectId]')
        .equals([workspaceId, filter.projectId])
        .toArray()
    } else if (filter.status?.length === 1) {
      rows = await db.tasks
        .where('[workspaceId+status]')
        .equals([workspaceId, filter.status[0]])
        .toArray()
    } else {
      rows = await db.tasks.where('workspaceId').equals(workspaceId).toArray()
    }
    const now = new Date()
    return rows.filter((t) => matchesFilter(t, filter, now)).sort(compareTasks)
  },

  subtasks(workspaceId: ID, parentTaskId: ID) {
    return db.tasks.where('[workspaceId+parentTaskId]').equals([workspaceId, parentTaskId]).toArray()
  },

  byProject(workspaceId: ID, projectId: ID) {
    return db.tasks.where('[workspaceId+projectId]').equals([workspaceId, projectId]).toArray()
  },

  byGoal(workspaceId: ID, goalId: ID) {
    return db.tasks.where('[workspaceId+goalId]').equals([workspaceId, goalId]).toArray()
  },

  /** Tasks scheduled to start inside a window — the planner and calendar query. */
  scheduledBetween(workspaceId: ID, startISO: string, endISO: string) {
    return db.tasks
      .where('[workspaceId+startDate]')
      .between([workspaceId, startISO], [workspaceId, endISO], true, true)
      .toArray()
  },

  /** Tasks *due* inside a window, regardless of whether they are scheduled. */
  dueBetween(workspaceId: ID, startISO: string, endISO: string) {
    return db.tasks
      .where('[workspaceId+dueDate]')
      .between([workspaceId, startISO], [workspaceId, endISO], true, true)
      .toArray()
  },

  async overdue(workspaceId: ID, now: Date = new Date()): Promise<Task[]> {
    const rows = await db.tasks
      .where('[workspaceId+dueDate]')
      .between([workspaceId, ''], [workspaceId, toISO(now)], true, false)
      .toArray()
    return rows
      .filter((t) => !t.archived && !CLOSED_TASK_STATUSES.includes(t.status))
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  },

  async create(workspaceId: ID, input: Partial<Task> = {}): Promise<Task> {
    const task = createTask(workspaceId, input)
    await db.tasks.add(task)
    await logActivity(
      workspaceId,
      task.parentTaskId ? 'subtask_created' : 'task_created',
      'task',
      task.id,
      `Created ${task.parentTaskId ? 'subtask' : 'task'} “${task.title}”`,
      { priority: task.priority, projectId: task.projectId },
    )
    return task
  },

  async createMany(workspaceId: ID, inputs: Partial<Task>[]): Promise<Task[]> {
    const tasks = inputs.map((i) => createTask(workspaceId, i))
    await db.tasks.bulkAdd(tasks)
    for (const t of tasks) {
      await logActivity(workspaceId, 'task_created', 'task', t.id, `Created task “${t.title}”`, {
        priority: t.priority,
      })
    }
    return tasks
  },

  /**
   * Patch a task and record what changed. Schedule and deadline moves get their
   * own activity types because the review/analytics layer treats "rescheduled"
   * and "deadline changed" as behavioural signals, not incidental edits.
   */
  async update(id: ID, patch: Partial<Task>): Promise<Task | undefined> {
    const before = await db.tasks.get(id)
    if (!before) return undefined
    const next: Task = { ...before, ...patch, updatedAt: nowISO() }
    await db.tasks.put(next)

    if (patch.startDate !== undefined && patch.startDate !== before.startDate) {
      await logActivity(
        next.workspaceId,
        'task_rescheduled',
        'task',
        id,
        patch.startDate
          ? `Scheduled “${next.title}” for ${toDayKey(patch.startDate)}`
          : `Unscheduled “${next.title}”`,
        { from: before.startDate, to: patch.startDate },
      )
    }
    if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) {
      await logActivity(
        next.workspaceId,
        'task_deadline_changed',
        'task',
        id,
        patch.dueDate
          ? `Deadline for “${next.title}” set to ${toDayKey(patch.dueDate)}`
          : `Deadline removed from “${next.title}”`,
        { from: before.dueDate, to: patch.dueDate },
      )
    }
    if (patch.archived !== undefined && patch.archived !== before.archived) {
      await logActivity(
        next.workspaceId,
        'task_archived',
        'task',
        id,
        `${patch.archived ? 'Archived' : 'Restored'} “${next.title}”`,
      )
    }
    // A generic edit still deserves a trace, but only when it is not already
    // covered by one of the specific events above.
    const specific =
      patch.startDate !== undefined || patch.dueDate !== undefined || patch.archived !== undefined
    if (!specific && patch.status === undefined) {
      await logActivity(next.workspaceId, 'task_updated', 'task', id, `Updated “${next.title}”`)
    }
    return next
  },

  async updateMany(ids: ID[], patch: Partial<Task>): Promise<void> {
    for (const id of ids) await taskRepo.update(id, patch)
  },

  /**
   * Set status with the side effects that make the rest of the app coherent:
   * stamps `completedAt`, cascades completion to subtasks, and materialises the
   * next occurrence of a recurring task.
   */
  async setStatus(id: ID, status: TaskStatus): Promise<Task | undefined> {
    const before = await db.tasks.get(id)
    if (!before) return undefined
    const closing = CLOSED_TASK_STATUSES.includes(status)
    const wasClosed = CLOSED_TASK_STATUSES.includes(before.status)

    const next: Task = {
      ...before,
      status,
      completedAt: status === 'completed' ? (before.completedAt ?? nowISO()) : null,
      // Reaching a terminal state means 100%; reopening drops the override so
      // progress falls back to being derived from subtasks again.
      manualProgress: status === 'completed' ? 100 : before.manualProgress === 100 ? null : before.manualProgress,
      updatedAt: nowISO(),
    }
    await db.tasks.put(next)

    if (status === 'completed' && !wasClosed) {
      await logActivity(next.workspaceId, 'task_completed', 'task', id, `Completed “${next.title}”`, {
        priority: next.priority,
        onTime: next.dueDate ? next.completedAt! <= next.dueDate : true,
      })
      // Completing a parent closes out its remaining subtasks — leaving them
      // open would make project progress read below 100% for a done parent.
      const subs = await taskRepo.subtasks(next.workspaceId, id)
      for (const sub of subs) {
        if (!CLOSED_TASK_STATUSES.includes(sub.status)) {
          await db.tasks.put({
            ...sub,
            status: 'completed',
            completedAt: nowISO(),
            manualProgress: 100,
            updatedAt: nowISO(),
          })
        }
      }
      if (next.recurrence) await taskRepo.spawnNextOccurrence(next)
    } else if (!closing && wasClosed) {
      await logActivity(next.workspaceId, 'task_reopened', 'task', id, `Reopened “${next.title}”`)
    } else if (closing && status === 'cancelled') {
      await logActivity(next.workspaceId, 'task_updated', 'task', id, `Cancelled “${next.title}”`)
    } else {
      await logActivity(
        next.workspaceId,
        'task_updated',
        'task',
        id,
        `“${next.title}” moved to ${status.replace('_', ' ')}`,
        { from: before.status, to: status },
      )
    }
    return next
  },

  async toggleComplete(id: ID): Promise<Task | undefined> {
    const task = await db.tasks.get(id)
    if (!task) return undefined
    return taskRepo.setStatus(task.id, task.status === 'completed' ? 'planned' : 'completed')
  },

  /**
   * Materialise the next instance of a recurring task. The completed instance
   * keeps the history; the new row carries the recurrence forward with an
   * incremented counter so `count`/`until` limits terminate correctly.
   */
  async spawnNextOccurrence(task: Task): Promise<Task | null> {
    if (!task.recurrence) return null
    const anchor = task.startDate ?? task.dueDate ?? task.createdAt
    const next = nextOccurrence(task.recurrence, new Date(anchor))
    if (!next) return null

    const shift = next.getTime() - new Date(anchor).getTime()
    const shifted = (value: string | null) =>
      value ? toISO(new Date(new Date(value).getTime() + shift)) : null

    const clone = createTask(task.workspaceId, {
      projectId: task.projectId,
      goalId: task.goalId,
      title: task.title,
      description: task.description,
      status: 'planned',
      priority: task.priority,
      tags: [...task.tags],
      startDate: task.startDate ? shifted(task.startDate) : null,
      dueDate: task.dueDate ? shifted(task.dueDate) : null,
      estimatedDuration: task.estimatedDuration,
      scoreWeight: task.scoreWeight,
      recurrence: { ...task.recurrence, generated: task.recurrence.generated + 1 },
      links: task.links.map((l) => ({ ...l, id: newId() })),
      notes: task.notes,
      recurrenceSourceId: task.recurrenceSourceId ?? task.id,
    })
    await db.tasks.add(clone)
    // The finished instance stops recurring; the new row owns the rule now.
    await db.tasks.update(task.id, { recurrence: null })
    await logActivity(
      task.workspaceId,
      'task_created',
      'task',
      clone.id,
      `Recurring task “${clone.title}” scheduled for ${toDayKey(clone.startDate ?? clone.dueDate ?? clone.createdAt)}`,
    )
    return clone
  },

  /** Deep copy including subtasks, links and dependency edges. */
  async duplicate(id: ID): Promise<Task | undefined> {
    const source = await db.tasks.get(id)
    if (!source) return undefined
    const copy = createTask(source.workspaceId, {
      ...source,
      id: newId(),
      title: `${source.title} (copy)`,
      status: source.status === 'completed' ? 'planned' : source.status,
      completedAt: null,
      actualDuration: 0,
      manualProgress: null,
      links: source.links.map((l) => ({ ...l, id: newId() })),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      order: Date.now(),
    })
    await db.tasks.add(copy)

    const subs = await taskRepo.subtasks(source.workspaceId, source.id)
    for (const sub of subs) {
      await db.tasks.add(
        createTask(sub.workspaceId, {
          ...sub,
          id: newId(),
          parentTaskId: copy.id,
          completedAt: null,
          actualDuration: 0,
          manualProgress: null,
          status: sub.status === 'completed' ? 'planned' : sub.status,
          links: sub.links.map((l) => ({ ...l, id: newId() })),
          createdAt: nowISO(),
          updatedAt: nowISO(),
        }),
      )
    }
    await logActivity(
      copy.workspaceId,
      'task_created',
      'task',
      copy.id,
      `Duplicated “${source.title}”`,
    )
    return copy
  },

  /**
   * Delete a task and everything that only exists because of it. Returns a
   * summary so the confirmation dialog can state the blast radius up front.
   */
  async remove(id: ID): Promise<{ tasks: number; attachments: number; timeEntries: number }> {
    const task = await db.tasks.get(id)
    if (!task) return { tasks: 0, attachments: 0, timeEntries: 0 }

    const ids = await taskRepo.collectSubtree(task.workspaceId, id)
    let attachments = 0
    let timeEntries = 0

    for (const tid of ids) {
      attachments += await attachmentRepo.removeForTask(tid)
      timeEntries += await db.timeEntries.where('taskId').equals(tid).delete()
      // Focus sessions are historical facts about the user's day, not artefacts
      // of the task, so they survive with a null task reference.
      await db.focusSessions.where('taskId').equals(tid).modify({ taskId: null })
    }
    await db.tasks.bulkDelete(ids)

    // Drop dependency edges that now point at nothing.
    const dependents = await db.tasks.where('workspaceId').equals(task.workspaceId).toArray()
    for (const dep of dependents) {
      const filtered = dep.dependencies.filter((d) => !ids.includes(d))
      if (filtered.length !== dep.dependencies.length) {
        await db.tasks.update(dep.id, { dependencies: filtered, updatedAt: nowISO() })
      }
    }

    await logActivity(
      task.workspaceId,
      'task_deleted',
      'task',
      id,
      `Deleted “${task.title}”${ids.length > 1 ? ` and ${ids.length - 1} subtask(s)` : ''}`,
    )
    return { tasks: ids.length, attachments, timeEntries }
  },

  /** Ids of a task plus all descendants, breadth-first. */
  async collectSubtree(workspaceId: ID, rootId: ID): Promise<ID[]> {
    const all = await db.tasks.where('workspaceId').equals(workspaceId).toArray()
    const childrenOf = new Map<ID, ID[]>()
    for (const t of all) {
      if (!t.parentTaskId) continue
      const list = childrenOf.get(t.parentTaskId)
      if (list) list.push(t.id)
      else childrenOf.set(t.parentTaskId, [t.id])
    }
    const out: ID[] = []
    const queue = [rootId]
    const seen = new Set<ID>()
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      for (const child of childrenOf.get(id) ?? []) queue.push(child)
    }
    return out
  },

  /** Persist an explicit ordering (drag-to-reorder in list views). */
  async reorder(ids: ID[]): Promise<void> {
    await db.transaction('rw', db.tasks, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.tasks.update(ids[i], { order: i, updatedAt: nowISO() })
      }
    })
  },

  /** Recompute `actualDuration` from time entries — the single source of truth. */
  async syncActualDuration(taskId: ID): Promise<number> {
    const entries = await db.timeEntries.where('taskId').equals(taskId).toArray()
    const total = entries.reduce((acc, e) => acc + e.duration, 0)
    await db.tasks.update(taskId, { actualDuration: total, updatedAt: nowISO() })
    return total
  },

  async completedOn(workspaceId: ID, day: DayKey): Promise<Task[]> {
    const rows = await db.tasks.where('workspaceId').equals(workspaceId).toArray()
    return rows.filter((t) => t.completedAt && toDayKey(t.completedAt) === day)
  },

  async allTags(workspaceId: ID): Promise<string[]> {
    const rows = await db.tasks.where('workspaceId').equals(workspaceId).toArray()
    const set = new Set<string>()
    for (const t of rows) for (const tag of t.tags) set.add(tag)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  },
}

/**
 * Default task ordering: open before closed, then explicit order, then urgency.
 * Keeping this in one place means every list in the app agrees on "first".
 */
export function compareTasks(a: Task, b: Task): number {
  const aClosed = CLOSED_TASK_STATUSES.includes(a.status)
  const bClosed = CLOSED_TASK_STATUSES.includes(b.status)
  if (aClosed !== bClosed) return aClosed ? 1 : -1
  if (a.order !== b.order) return a.order - b.order
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return a.createdAt.localeCompare(b.createdAt)
}
