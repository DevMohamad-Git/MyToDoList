import { db } from '@/database/db'
import { logActivity } from '@/storage/activityRepo'
import { taskRepo } from '@/storage/taskRepo'
import type { DayKey, FocusMode, FocusSession, ID, SessionType, TimeEntry } from '@/types'
import { nowISO, toDayKey, toISO } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Time and focus persistence.
 *
 * `TimeEntry` is the ledger that answers "how long did this take" — it is what
 * `task.actualDuration`, project time totals and the time-efficiency score read.
 * `FocusSession` records *behaviour* (pomodoro cycles, interruptions) and feeds
 * the focus-time score and session history. A pomodoro produces both: one focus
 * session and one time entry, so neither view is missing data.
 */

export interface LogTimeInput {
  workspaceId: ID
  taskId: ID | null
  projectId?: ID | null
  start: Date
  end: Date
  sessionType?: SessionType
  note?: string
}

export const timeRepo = {
  /** Append a time entry and refresh the owning task's denormalised total. */
  async log(input: LogTimeInput): Promise<TimeEntry> {
    const duration = Math.max(0, Math.round((input.end.getTime() - input.start.getTime()) / 60_000))
    // If the task belongs to a project, inherit it so project totals work even
    // when the caller did not supply one.
    let projectId = input.projectId ?? null
    if (!projectId && input.taskId) {
      const task = await taskRepo.get(input.taskId)
      projectId = task?.projectId ?? null
    }

    const entry: TimeEntry = {
      id: newId(),
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      projectId,
      startTime: toISO(input.start),
      endTime: toISO(input.end),
      duration,
      sessionType: input.sessionType ?? 'focus',
      note: input.note ?? '',
      day: toDayKey(input.start),
      createdAt: nowISO(),
    }
    await db.timeEntries.add(entry)
    if (entry.taskId) await taskRepo.syncActualDuration(entry.taskId)
    await logActivity(
      input.workspaceId,
      'time_logged',
      'task',
      entry.taskId ?? entry.id,
      `Logged ${duration}m of work`,
      { duration, sessionType: entry.sessionType },
    )
    return entry
  },

  async update(id: ID, patch: Partial<TimeEntry>): Promise<void> {
    const before = await db.timeEntries.get(id)
    if (!before) return
    const next: TimeEntry = { ...before, ...patch }
    // Keep duration and the day bucket consistent with the timestamps.
    if (patch.startTime || patch.endTime) {
      next.duration = Math.max(
        0,
        Math.round((new Date(next.endTime).getTime() - new Date(next.startTime).getTime()) / 60_000),
      )
      next.day = toDayKey(next.startTime)
    }
    await db.timeEntries.put(next)
    if (next.taskId) await taskRepo.syncActualDuration(next.taskId)
    if (before.taskId && before.taskId !== next.taskId) await taskRepo.syncActualDuration(before.taskId)
  },

  async remove(id: ID): Promise<void> {
    const entry = await db.timeEntries.get(id)
    if (!entry) return
    await db.timeEntries.delete(id)
    if (entry.taskId) await taskRepo.syncActualDuration(entry.taskId)
  },

  forTask(taskId: ID) {
    return db.timeEntries.where('taskId').equals(taskId).toArray()
  },

  forWorkspace(workspaceId: ID) {
    return db.timeEntries.where('workspaceId').equals(workspaceId).toArray()
  },

  forDay(workspaceId: ID, day: DayKey) {
    return db.timeEntries.where('[workspaceId+day]').equals([workspaceId, day]).toArray()
  },

  between(workspaceId: ID, startDay: DayKey, endDay: DayKey) {
    return db.timeEntries
      .where('[workspaceId+day]')
      .between([workspaceId, startDay], [workspaceId, endDay], true, true)
      .toArray()
  },

  async totalForProject(projectId: ID): Promise<number> {
    const rows = await db.timeEntries.where('projectId').equals(projectId).toArray()
    return rows.reduce((acc, r) => acc + r.duration, 0)
  },
}

export interface SaveFocusInput {
  workspaceId: ID
  taskId: ID | null
  projectId?: ID | null
  start: Date
  end: Date
  mode: FocusMode
  plannedDuration: number
  /** Focused minutes excluding pauses. */
  focusedMinutes: number
  pomodoroCycle: number | null
  completed: boolean
  interruptions: number
}

export const focusRepo = {
  /**
   * Persist a finished focus interval. Also writes the matching time entry so
   * focus work counts toward the task's actual duration without double entry.
   */
  async save(input: SaveFocusInput): Promise<FocusSession> {
    let projectId = input.projectId ?? null
    if (!projectId && input.taskId) {
      const task = await taskRepo.get(input.taskId)
      projectId = task?.projectId ?? null
    }

    const session: FocusSession = {
      id: newId(),
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      projectId,
      startTime: toISO(input.start),
      endTime: toISO(input.end),
      duration: Math.max(0, Math.round(input.focusedMinutes)),
      mode: input.mode,
      pomodoroCycle: input.pomodoroCycle,
      plannedDuration: input.plannedDuration,
      completed: input.completed,
      interruptions: input.interruptions,
      day: toDayKey(input.start),
      createdAt: nowISO(),
    }
    await db.focusSessions.add(session)

    if (session.duration > 0) {
      const entry: TimeEntry = {
        id: newId(),
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        projectId,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        sessionType: 'focus',
        note: input.mode === 'pomodoro' ? `Pomodoro cycle ${input.pomodoroCycle ?? 1}` : 'Focus session',
        day: session.day,
        createdAt: nowISO(),
      }
      await db.timeEntries.add(entry)
      if (input.taskId) await taskRepo.syncActualDuration(input.taskId)
    }

    await logActivity(
      input.workspaceId,
      'focus_completed',
      'focus',
      session.id,
      `${input.completed ? 'Completed' : 'Ended'} a ${session.duration}m focus session`,
      { mode: session.mode, duration: session.duration, completed: session.completed },
    )
    return session
  },

  forWorkspace(workspaceId: ID) {
    return db.focusSessions.where('workspaceId').equals(workspaceId).toArray()
  },

  forDay(workspaceId: ID, day: DayKey) {
    return db.focusSessions.where('[workspaceId+day]').equals([workspaceId, day]).toArray()
  },

  between(workspaceId: ID, startDay: DayKey, endDay: DayKey) {
    return db.focusSessions
      .where('[workspaceId+day]')
      .between([workspaceId, startDay], [workspaceId, endDay], true, true)
      .toArray()
  },

  async recent(workspaceId: ID, limit = 20): Promise<FocusSession[]> {
    const rows = await db.focusSessions.where('workspaceId').equals(workspaceId).toArray()
    return rows.sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, limit)
  },

  forTask(taskId: ID) {
    return db.focusSessions.where('taskId').equals(taskId).toArray()
  },

  async remove(id: ID): Promise<void> {
    await db.focusSessions.delete(id)
  },
}
