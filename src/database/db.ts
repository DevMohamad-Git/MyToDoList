import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityRecord,
  AppMeta,
  Attachment,
  BlobRecord,
  DailyReview,
  EarnedAchievement,
  FocusSession,
  Goal,
  Habit,
  HabitEntry,
  LinkedFolder,
  Project,
  Task,
  TimeEntry,
  WeeklyReview,
  Workspace,
} from '@/types'

/**
 * IndexedDB schema for Momentum OS.
 *
 * Indexing strategy: every workspace-scoped table carries a `workspaceId` index
 * plus compound indexes for the access patterns the UI actually issues, because
 * an unindexed scan is what makes a local-first app feel slow once a user has a
 * few thousand tasks. The compound indexes below map 1:1 to the repository
 * queries in `src/storage/repositories`:
 *
 *   tasks     [workspaceId+status]      → board columns, "open tasks"
 *             [workspaceId+projectId]   → project detail
 *             [workspaceId+parentTaskId]→ subtask trees
 *             [workspaceId+dueDate]     → overdue / upcoming deadlines
 *             [workspaceId+startDate]   → planner + calendar day/week windows
 *   timeEntries / focusSessions
 *             [workspaceId+day]         → per-day aggregation for score/analytics
 *   habitEntries
 *             [workspaceId+day], [habitId+day] → grid + streak computation
 *
 * Migrations are additive and versioned; each `.version()` block below is a
 * migration step that must keep working forever for users on older databases.
 */
export class MomentumDB extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>
  projects!: EntityTable<Project, 'id'>
  tasks!: EntityTable<Task, 'id'>
  attachments!: EntityTable<Attachment, 'id'>
  blobs!: EntityTable<BlobRecord, 'key'>
  timeEntries!: EntityTable<TimeEntry, 'id'>
  focusSessions!: EntityTable<FocusSession, 'id'>
  goals!: EntityTable<Goal, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitEntries!: EntityTable<HabitEntry, 'id'>
  dailyReviews!: EntityTable<DailyReview, 'id'>
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>
  achievements!: EntityTable<EarnedAchievement, 'id'>
  activity!: EntityTable<ActivityRecord, 'id'>
  meta!: EntityTable<AppMeta, 'key'>
  folders!: EntityTable<LinkedFolder, 'workspaceId'>

  constructor(name = 'momentum-os') {
    super(name)

    // v1 — initial schema.
    this.version(1).stores({
      workspaces: 'id, name, createdAt, isDemo',
      projects:
        'id, workspaceId, [workspaceId+status], [workspaceId+order], deadline, status, order, createdAt',
      tasks:
        'id, workspaceId, [workspaceId+status], [workspaceId+projectId], [workspaceId+parentTaskId], [workspaceId+dueDate], [workspaceId+startDate], [workspaceId+archived], [workspaceId+goalId], parentTaskId, projectId, goalId, status, dueDate, startDate, order, createdAt, completedAt, recurrenceSourceId',
      attachments: 'id, workspaceId, taskId, projectId, createdAt',
      blobs: 'key, workspaceId',
      timeEntries:
        'id, workspaceId, [workspaceId+day], [workspaceId+taskId], taskId, projectId, day, startTime',
      focusSessions:
        'id, workspaceId, [workspaceId+day], [workspaceId+taskId], taskId, projectId, day, startTime',
      goals: 'id, workspaceId, [workspaceId+status], status, deadline, order, createdAt',
      habits: 'id, workspaceId, [workspaceId+archived], order, createdAt',
      habitEntries:
        'id, workspaceId, [workspaceId+day], [habitId+day], habitId, day',
      dailyReviews: 'id, workspaceId, [workspaceId+day], day, createdAt',
      weeklyReviews: 'id, workspaceId, [workspaceId+weekStart], weekStart, createdAt',
      achievements: 'id, workspaceId, [workspaceId+achievementKey], achievementKey, earnedAt',
      activity: 'id, workspaceId, [workspaceId+day], [workspaceId+entityId], entityId, type, day, createdAt',
      meta: 'key',
      folders: 'workspaceId',
    })
  }
}

export const db = new MomentumDB()

/** Schema version the running code expects; surfaced in Settings → Storage. */
export const SCHEMA_VERSION = 1

/**
 * Open the database, converting the two failure modes that are actually
 * recoverable into something the UI can explain rather than a blank screen:
 * a newer schema written by a newer build, and a corrupted store.
 */
export type DBOpenResult =
  | { ok: true }
  | { ok: false; reason: 'version' | 'blocked' | 'unknown'; message: string }

export async function openDatabase(): Promise<DBOpenResult> {
  try {
    await db.open()
    return { ok: true }
  } catch (error) {
    const err = error as Error & { name?: string }
    if (err.name === 'VersionError') {
      return {
        ok: false,
        reason: 'version',
        message:
          'This browser holds a database created by a newer version of FlowOS. Update the app, or export and reset local data.',
      }
    }
    if (err.name === 'BlockedError' || err.name === 'DatabaseClosedError') {
      return {
        ok: false,
        reason: 'blocked',
        message:
          'The database is locked by another tab. Close other FlowOS tabs and reload.',
      }
    }
    return {
      ok: false,
      reason: 'unknown',
      message: err.message || 'The local database could not be opened.',
    }
  }
}

/** Total bytes the origin is using, when the browser exposes an estimate. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/**
 * Ask the browser to exempt this origin from storage eviction. Without it a
 * local-first app can silently lose data under disk pressure, so we request it
 * once on first launch and report the outcome in Settings.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
