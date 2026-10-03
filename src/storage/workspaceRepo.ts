import { db } from '@/database/db'
import { createWorkspace } from '@/database/factories'
import { defaultWorkspaceSettings } from '@/config/constants'
import { unlinkFolder } from '@/storage/fileSystem'
import type { ID, Workspace, WorkspaceSettings } from '@/types'
import { nowISO } from '@/utils/date'

const ACTIVE_WORKSPACE_KEY = 'activeWorkspaceId'

/**
 * Workspaces are the isolation boundary: every other table carries a
 * `workspaceId`, so switching workspaces changes every query's scope rather
 * than filtering in the UI. Deleting one must therefore sweep every table.
 */
export const workspaceRepo = {
  get(id: ID) {
    return db.workspaces.get(id)
  },

  async list(): Promise<Workspace[]> {
    const rows = await db.workspaces.toArray()
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async count(): Promise<number> {
    return db.workspaces.count()
  },

  async create(input: Partial<Workspace> = {}): Promise<Workspace> {
    const workspace = createWorkspace(input)
    await db.workspaces.add(workspace)
    return workspace
  },

  async update(id: ID, patch: Partial<Workspace>): Promise<Workspace | undefined> {
    const before = await db.workspaces.get(id)
    if (!before) return undefined
    const next = { ...before, ...patch, updatedAt: nowISO() }
    await db.workspaces.put(next)
    return next
  },

  /** Deep-merge settings so a partial patch never drops sibling sections. */
  async updateSettings(id: ID, patch: DeepPartial<WorkspaceSettings>): Promise<Workspace | undefined> {
    const before = await db.workspaces.get(id)
    if (!before) return undefined
    const settings: WorkspaceSettings = {
      planning: {
        ...before.settings.planning,
        ...patch.planning,
        // `workingHours` is itself an object, so a shallow spread of `patch.planning`
        // would substitute a partial for the whole thing and lose start/end/days.
        workingHours: {
          ...before.settings.planning.workingHours,
          ...patch.planning?.workingHours,
        },
      },
      scoring: {
        weights: { ...before.settings.scoring.weights, ...patch.scoring?.weights },
        thresholds: { ...before.settings.scoring.thresholds, ...patch.scoring?.thresholds },
      },
      pomodoro: { ...before.settings.pomodoro, ...patch.pomodoro },
    }
    const next = { ...before, settings, updatedAt: nowISO() }
    await db.workspaces.put(next)
    return next
  },

  async resetSettings(id: ID): Promise<void> {
    await db.workspaces.update(id, { settings: defaultWorkspaceSettings(), updatedAt: nowISO() })
  },

  /**
   * Remove a workspace and every record scoped to it, including attachment
   * blobs. Runs inside one transaction so a failure cannot leave orphans.
   */
  async remove(id: ID): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.workspaces,
        db.projects,
        db.tasks,
        db.attachments,
        db.blobs,
        db.timeEntries,
        db.focusSessions,
        db.goals,
        db.habits,
        db.habitEntries,
        db.dailyReviews,
        db.weeklyReviews,
        db.achievements,
        db.activity,
      ],
      async () => {
        await db.projects.where('workspaceId').equals(id).delete()
        await db.tasks.where('workspaceId').equals(id).delete()
        await db.attachments.where('workspaceId').equals(id).delete()
        await db.blobs.where('workspaceId').equals(id).delete()
        await db.timeEntries.where('workspaceId').equals(id).delete()
        await db.focusSessions.where('workspaceId').equals(id).delete()
        await db.goals.where('workspaceId').equals(id).delete()
        await db.habits.where('workspaceId').equals(id).delete()
        await db.habitEntries.where('workspaceId').equals(id).delete()
        await db.dailyReviews.where('workspaceId').equals(id).delete()
        await db.weeklyReviews.where('workspaceId').equals(id).delete()
        await db.achievements.where('workspaceId').equals(id).delete()
        await db.activity.where('workspaceId').equals(id).delete()
        await db.workspaces.delete(id)
      },
    )
    // Handles live outside the transaction's table set.
    await unlinkFolder(id)
  },

  /** Delete the workspace's content but keep the workspace itself. */
  async clearContent(id: ID): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.projects,
        db.tasks,
        db.attachments,
        db.blobs,
        db.timeEntries,
        db.focusSessions,
        db.goals,
        db.habits,
        db.habitEntries,
        db.dailyReviews,
        db.weeklyReviews,
        db.achievements,
        db.activity,
      ],
      async () => {
        await db.projects.where('workspaceId').equals(id).delete()
        await db.tasks.where('workspaceId').equals(id).delete()
        await db.attachments.where('workspaceId').equals(id).delete()
        await db.blobs.where('workspaceId').equals(id).delete()
        await db.timeEntries.where('workspaceId').equals(id).delete()
        await db.focusSessions.where('workspaceId').equals(id).delete()
        await db.goals.where('workspaceId').equals(id).delete()
        await db.habits.where('workspaceId').equals(id).delete()
        await db.habitEntries.where('workspaceId').equals(id).delete()
        await db.dailyReviews.where('workspaceId').equals(id).delete()
        await db.weeklyReviews.where('workspaceId').equals(id).delete()
        await db.achievements.where('workspaceId').equals(id).delete()
        await db.activity.where('workspaceId').equals(id).delete()
      },
    )
  },

  /** Record counts for the workspace card and export summary. */
  async stats(id: ID) {
    const [projects, tasks, goals, habits, attachments, focusSessions, timeEntries] = await Promise.all([
      db.projects.where('workspaceId').equals(id).count(),
      db.tasks.where('workspaceId').equals(id).count(),
      db.goals.where('workspaceId').equals(id).count(),
      db.habits.where('workspaceId').equals(id).count(),
      db.attachments.where('workspaceId').equals(id).count(),
      db.focusSessions.where('workspaceId').equals(id).count(),
      db.timeEntries.where('workspaceId').equals(id).count(),
    ])
    return { projects, tasks, goals, habits, attachments, focusSessions, timeEntries }
  },

  async getActiveId(): Promise<ID | null> {
    const row = await db.meta.get(ACTIVE_WORKSPACE_KEY)
    return (row?.value as ID | undefined) ?? null
  },

  async setActiveId(id: ID): Promise<void> {
    await db.meta.put({ key: ACTIVE_WORKSPACE_KEY, value: id })
  },

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await db.meta.get(key)
    return row?.value as T | undefined
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value })
  },
}

/**
 * Recursive partial used for settings patches.
 *
 * Arrays are treated as leaves rather than recursed into: a patch for
 * `workingHours.days` means "use these days", not "merge index-by-index", and
 * recursing would widen the element type to `WeekDay | undefined`.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}
