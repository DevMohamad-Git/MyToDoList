import { db } from '@/database/db'
import { logActivity } from '@/storage/activityRepo'
import { exportWorkspace, importBundle, serializeBundle, type ExportBundle } from '@/services/importExport'
import type { ID, Task } from '@/types'
import { nowISO } from '@/utils/date'

export interface StorageBreakdown {
  tasksCount: number
  projectsCount: number
  goalsCount: number
  habitsCount: number
  habitEntriesCount: number
  timeEntriesCount: number
  focusSessionsCount: number
  reviewsCount: number
  activityLogsCount: number
  attachmentsCount: number
  blobsCount: number
  blobsTotalBytes: number
}

export interface DatabaseAnomalies {
  orphanedBlobsCount: number
  orphanedBlobsBytes: number
  brokenAttachmentsCount: number
  danglingParentTasksCount: number
  brokenDependenciesCount: number
  desyncedDurationsCount: number
  orphanedHabitEntriesCount: number
  orphanedTimeEntriesCount: number
  oldActivityLogsCount: number
  staleCompletedTasksCount: number
}

export interface DatabaseDiagnostics {
  healthScore: number
  totalEntities: number
  storageEstimate: { usage: number; quota: number } | null
  breakdown: StorageBreakdown
  anomalies: DatabaseAnomalies
}

export interface OptimizationOptions {
  purgeOrphanBlobs?: boolean
  fixDanglingReferences?: boolean
  resyncDurations?: boolean
  pruneActivityDays?: number | null // e.g. 30, 60, 90 or null to keep all
  archiveCompletedDays?: number | null // e.g. 14, 30 or null
}

export interface OptimizationResult {
  freedBytes: number
  removedOrphanBlobs: number
  fixedBrokenAttachments: number
  fixedParentTasks: number
  fixedDependencies: number
  resyncedDurations: number
  removedOrphanHabitEntries: number
  removedOrphanTimeEntries: number
  prunedActivityLogs: number
  archivedCompletedTasks: number
}

export interface LocalSnapshotMeta {
  savedAt: string
  workspaceName: string
  tasksCount: number
  projectsCount: number
  sizeBytes: number
}

const SNAPSHOT_KEY_PREFIX = 'snapshot_workspace_'

/**
 * Perform a non-destructive audit of database integrity, orphan records, and space usage.
 */
export async function diagnoseWorkspace(workspaceId: ID): Promise<DatabaseDiagnostics> {
  const [
    tasks,
    projects,
    goals,
    habits,
    habitEntries,
    timeEntries,
    focusSessions,
    dailyReviews,
    weeklyReviews,
    activityLogs,
    attachments,
    blobs,
  ] = await Promise.all([
    db.tasks.where('workspaceId').equals(workspaceId).toArray(),
    db.projects.where('workspaceId').equals(workspaceId).toArray(),
    db.goals.where('workspaceId').equals(workspaceId).toArray(),
    db.habits.where('workspaceId').equals(workspaceId).toArray(),
    db.habitEntries.where('workspaceId').equals(workspaceId).toArray(),
    db.timeEntries.where('workspaceId').equals(workspaceId).toArray(),
    db.focusSessions.where('workspaceId').equals(workspaceId).toArray(),
    db.dailyReviews.where('workspaceId').equals(workspaceId).toArray(),
    db.weeklyReviews.where('workspaceId').equals(workspaceId).toArray(),
    db.activity.where('workspaceId').equals(workspaceId).toArray(),
    db.attachments.where('workspaceId').equals(workspaceId).toArray(),
    db.blobs.where('workspaceId').equals(workspaceId).toArray(),
  ])

  let storageEstimate: { usage: number; quota: number } | null = null
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate()
      storageEstimate = { usage: est.usage ?? 0, quota: est.quota ?? 0 }
    } catch {
      // Ignore
    }
  }

  const taskMap = new Map<ID, Task>(tasks.map((t) => [t.id, t]))
  const projectIds = new Set(projects.map((p) => p.id))
  const goalIds = new Set(goals.map((g) => g.id))
  const habitIds = new Set(habits.map((h) => h.id))

  // 1. Orphaned Blobs detection
  const referencedBlobKeys = new Set(
    attachments.map((a) => a.blobKey).filter((k): k is string => Boolean(k)),
  )
  let orphanedBlobsCount = 0
  let orphanedBlobsBytes = 0
  let blobsTotalBytes = 0

  for (const b of blobs) {
    const size = b.blob?.size ?? 0
    blobsTotalBytes += size
    if (!referencedBlobKeys.has(b.key)) {
      orphanedBlobsCount++
      orphanedBlobsBytes += size
    }
  }

  // 2. Broken Attachments detection
  const existingBlobKeys = new Set(blobs.map((b) => b.key))
  let brokenAttachmentsCount = 0
  for (const a of attachments) {
    if (a.storage === 'indexeddb' && a.blobKey && !existingBlobKeys.has(a.blobKey)) {
      brokenAttachmentsCount++
    } else if (a.taskId && !taskMap.has(a.taskId)) {
      brokenAttachmentsCount++
    } else if (a.projectId && !projectIds.has(a.projectId)) {
      brokenAttachmentsCount++
    }
  }

  // 3. Task Referential Safety (parentTaskId, dependencies, durations)
  let danglingParentTasksCount = 0
  let brokenDependenciesCount = 0
  let desyncedDurationsCount = 0

  // Pre-calculate task actual duration sum from timeEntries
  const durationByTaskId = new Map<ID, number>()
  for (const te of timeEntries) {
    if (te.taskId) {
      durationByTaskId.set(te.taskId, (durationByTaskId.get(te.taskId) ?? 0) + (te.duration || 0))
    }
  }

  for (const t of tasks) {
    if (t.parentTaskId && (!taskMap.has(t.parentTaskId) || t.parentTaskId === t.id)) {
      danglingParentTasksCount++
    }
    if (t.dependencies?.some((depId) => !taskMap.has(depId)) || (t.goalId && !goalIds.has(t.goalId))) {
      brokenDependenciesCount++
    }
    const realSum = durationByTaskId.get(t.id) ?? 0
    if (t.actualDuration !== realSum) {
      desyncedDurationsCount++
    }
  }

  // 4. Orphaned Habit Entries
  let orphanedHabitEntriesCount = 0
  for (const he of habitEntries) {
    if (!habitIds.has(he.habitId)) {
      orphanedHabitEntriesCount++
    }
  }

  // 5. Orphaned Time Entries & Focus Sessions
  let orphanedTimeEntriesCount = 0
  for (const te of timeEntries) {
    if (te.taskId && !taskMap.has(te.taskId)) {
      orphanedTimeEntriesCount++
    }
    if (te.projectId && !projectIds.has(te.projectId)) {
      orphanedTimeEntriesCount++
    }
  }

  // 6. Old Activity Logs (> 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  let oldActivityLogsCount = 0
  for (const act of activityLogs) {
    if (act.createdAt < thirtyDaysAgo) {
      oldActivityLogsCount++
    }
  }

  // 7. Stale Completed Tasks (> 30 days ago and not archived)
  let staleCompletedTasksCount = 0
  for (const t of tasks) {
    if (!t.archived && t.status === 'completed' && t.completedAt && t.completedAt < thirtyDaysAgo) {
      staleCompletedTasksCount++
    }
  }

  // Compute Health Score: start from 100 and deduct for issues
  let penalty = 0
  penalty += orphanedBlobsCount * 5
  penalty += brokenAttachmentsCount * 4
  penalty += danglingParentTasksCount * 3
  penalty += brokenDependenciesCount * 2
  penalty += desyncedDurationsCount * 2
  penalty += orphanedHabitEntriesCount * 2
  penalty += orphanedTimeEntriesCount * 2
  if (oldActivityLogsCount > 500) penalty += 5
  if (staleCompletedTasksCount > 50) penalty += 5

  const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty)))

  const totalEntities =
    tasks.length +
    projects.length +
    goals.length +
    habits.length +
    habitEntries.length +
    timeEntries.length +
    focusSessions.length +
    dailyReviews.length +
    weeklyReviews.length +
    activityLogs.length +
    attachments.length

  return {
    healthScore,
    totalEntities,
    storageEstimate,
    breakdown: {
      tasksCount: tasks.length,
      projectsCount: projects.length,
      goalsCount: goals.length,
      habitsCount: habits.length,
      habitEntriesCount: habitEntries.length,
      timeEntriesCount: timeEntries.length,
      focusSessionsCount: focusSessions.length,
      reviewsCount: dailyReviews.length + weeklyReviews.length,
      activityLogsCount: activityLogs.length,
      attachmentsCount: attachments.length,
      blobsCount: blobs.length,
      blobsTotalBytes,
    },
    anomalies: {
      orphanedBlobsCount,
      orphanedBlobsBytes,
      brokenAttachmentsCount,
      danglingParentTasksCount,
      brokenDependenciesCount,
      desyncedDurationsCount,
      orphanedHabitEntriesCount,
      orphanedTimeEntriesCount,
      oldActivityLogsCount,
      staleCompletedTasksCount,
    },
  }
}

/**
 * One-click database vacuum, sanitization, and optimization.
 */
export async function optimizeAndVacuumWorkspace(
  workspaceId: ID,
  options: OptimizationOptions = {},
): Promise<OptimizationResult> {
  const {
    purgeOrphanBlobs = true,
    fixDanglingReferences = true,
    resyncDurations = true,
    pruneActivityDays = null,
    archiveCompletedDays = null,
  } = options

  const result: OptimizationResult = {
    freedBytes: 0,
    removedOrphanBlobs: 0,
    fixedBrokenAttachments: 0,
    fixedParentTasks: 0,
    fixedDependencies: 0,
    resyncedDurations: 0,
    removedOrphanHabitEntries: 0,
    removedOrphanTimeEntries: 0,
    prunedActivityLogs: 0,
    archivedCompletedTasks: 0,
  }

  await db.transaction(
    'rw',
    [
      db.tasks,
      db.projects,
      db.goals,
      db.habits,
      db.habitEntries,
      db.timeEntries,
      db.focusSessions,
      db.attachments,
      db.blobs,
      db.activity,
    ],
    async () => {
      const [tasks, projects, goals, habits, habitEntries, timeEntries, attachments, blobs] =
        await Promise.all([
          db.tasks.where('workspaceId').equals(workspaceId).toArray(),
          db.projects.where('workspaceId').equals(workspaceId).toArray(),
          db.goals.where('workspaceId').equals(workspaceId).toArray(),
          db.habits.where('workspaceId').equals(workspaceId).toArray(),
          db.habitEntries.where('workspaceId').equals(workspaceId).toArray(),
          db.timeEntries.where('workspaceId').equals(workspaceId).toArray(),
          db.attachments.where('workspaceId').equals(workspaceId).toArray(),
          db.blobs.where('workspaceId').equals(workspaceId).toArray(),
        ])

      const taskMap = new Map<ID, Task>(tasks.map((t) => [t.id, t]))
      const projectIds = new Set(projects.map((p) => p.id))
      const goalIds = new Set(goals.map((g) => g.id))
      const habitIds = new Set(habits.map((h) => h.id))

      // 1. Purge Orphaned Blobs
      if (purgeOrphanBlobs) {
        const referencedBlobKeys = new Set(
          attachments.map((a) => a.blobKey).filter((k): k is string => Boolean(k)),
        )
        const orphanBlobKeysToDelete: string[] = []
        for (const b of blobs) {
          if (!referencedBlobKeys.has(b.key)) {
            orphanBlobKeysToDelete.push(b.key)
            result.freedBytes += b.blob?.size ?? 0
            result.removedOrphanBlobs++
          }
        }
        if (orphanBlobKeysToDelete.length > 0) {
          await db.blobs.bulkDelete(orphanBlobKeysToDelete)
        }
      }

      // 2. Fix broken attachment records
      const existingBlobKeys = new Set(blobs.map((b) => b.key))
      const brokenAttachmentIdsToDelete: ID[] = []
      for (const a of attachments) {
        let isBroken = false
        if (a.storage === 'indexeddb' && a.blobKey && !existingBlobKeys.has(a.blobKey)) {
          isBroken = true
        } else if (a.taskId && !taskMap.has(a.taskId)) {
          isBroken = true
        } else if (a.projectId && !projectIds.has(a.projectId)) {
          isBroken = true
        }
        if (isBroken) {
          brokenAttachmentIdsToDelete.push(a.id)
          result.fixedBrokenAttachments++
        }
      }
      if (brokenAttachmentIdsToDelete.length > 0) {
        await db.attachments.bulkDelete(brokenAttachmentIdsToDelete)
      }

      // 3. Fix dangling parent tasks, circular dependencies, and unlinked foreign keys
      const tasksToUpdate: Task[] = []
      const durationByTaskId = new Map<ID, number>()
      for (const te of timeEntries) {
        if (te.taskId) {
          durationByTaskId.set(te.taskId, (durationByTaskId.get(te.taskId) ?? 0) + (te.duration || 0))
        }
      }

      const now = nowISO()
      const archiveCutoff =
        archiveCompletedDays != null
          ? new Date(Date.now() - archiveCompletedDays * 24 * 60 * 60 * 1000).toISOString()
          : null

      for (const t of tasks) {
        let changed = false
        const next = { ...t }

        if (fixDanglingReferences) {
          // Parent task reference
          if (next.parentTaskId && (!taskMap.has(next.parentTaskId) || next.parentTaskId === next.id)) {
            next.parentTaskId = null
            result.fixedParentTasks++
            changed = true
          }
          // Dependencies
          if (next.dependencies && next.dependencies.length > 0) {
            const validDeps = next.dependencies.filter((depId) => taskMap.has(depId) && depId !== next.id)
            if (validDeps.length !== next.dependencies.length) {
              result.fixedDependencies += next.dependencies.length - validDeps.length
              next.dependencies = validDeps
              changed = true
            }
          }
          // Project link
          if (next.projectId && !projectIds.has(next.projectId)) {
            next.projectId = null
            changed = true
          }
          // Goal link
          if (next.goalId && !goalIds.has(next.goalId)) {
            next.goalId = null
            changed = true
          }
        }

        // Resync actualDuration
        if (resyncDurations) {
          const realSum = durationByTaskId.get(t.id) ?? 0
          if (next.actualDuration !== realSum) {
            next.actualDuration = realSum
            result.resyncedDurations++
            changed = true
          }
        }

        // Auto-archive completed tasks older than threshold
        if (
          archiveCutoff &&
          !next.archived &&
          next.status === 'completed' &&
          next.completedAt &&
          next.completedAt < archiveCutoff
        ) {
          next.archived = true
          result.archivedCompletedTasks++
          changed = true
        }

        if (changed) {
          next.updatedAt = now
          tasksToUpdate.push(next)
        }
      }

      if (tasksToUpdate.length > 0) {
        await db.tasks.bulkPut(tasksToUpdate)
      }

      // 4. Remove Orphaned Habit Entries
      const orphanHabitEntryIds: ID[] = []
      for (const he of habitEntries) {
        if (!habitIds.has(he.habitId)) {
          orphanHabitEntryIds.push(he.id)
          result.removedOrphanHabitEntries++
        }
      }
      if (orphanHabitEntryIds.length > 0) {
        await db.habitEntries.bulkDelete(orphanHabitEntryIds)
      }

      // 5. Clean Orphaned References in Time Entries
      const timeEntriesToUpdate = []
      for (const te of timeEntries) {
        let changed = false
        const next = { ...te }
        if (next.taskId && !taskMap.has(next.taskId)) {
          next.taskId = null
          result.removedOrphanTimeEntries++
          changed = true
        }
        if (next.projectId && !projectIds.has(next.projectId)) {
          next.projectId = null
          changed = true
        }
        if (changed) timeEntriesToUpdate.push(next)
      }
      if (timeEntriesToUpdate.length > 0) {
        await db.timeEntries.bulkPut(timeEntriesToUpdate)
      }

      // 6. Prune old activity logs if requested
      if (pruneActivityDays != null && pruneActivityDays > 0) {
        const cutoffISO = new Date(Date.now() - pruneActivityDays * 24 * 60 * 60 * 1000).toISOString()
        const oldLogIds = await db.activity
          .where('workspaceId')
          .equals(workspaceId)
          .filter((act) => act.createdAt < cutoffISO)
          .primaryKeys()

        if (oldLogIds.length > 0) {
          await db.activity.bulkDelete(oldLogIds)
          result.prunedActivityLogs = oldLogIds.length
        }
      }
    },
  )

  await logActivity(
    workspaceId,
    'task_updated',
    'workspace',
    workspaceId,
    `Database vacuum & optimization completed: ${result.removedOrphanBlobs} orphaned blobs removed, ${result.resyncedDurations} durations resynced, ${result.prunedActivityLogs} logs pruned`,
    {
      freedBytes: result.freedBytes,
      removedOrphanBlobs: result.removedOrphanBlobs,
      resyncedDurations: result.resyncedDurations,
      prunedActivityLogs: result.prunedActivityLogs,
    },
  )

  return result
}

/**
 * Creates an instant, local snapshot in browser IndexedDB (db.meta) for rapid one-click undo/restore.
 */
export async function createLocalSnapshot(workspaceId: ID): Promise<LocalSnapshotMeta> {
  const bundle = await exportWorkspace(workspaceId, { includeAttachments: false, includeActivity: true })
  const serialized = serializeBundle(bundle)
  const meta: LocalSnapshotMeta = {
    savedAt: nowISO(),
    workspaceName: bundle.workspace.name,
    tasksCount: bundle.tasks.length,
    projectsCount: bundle.projects.length,
    sizeBytes: new Blob([serialized]).size,
  }

  await db.meta.put({
    key: `${SNAPSHOT_KEY_PREFIX}${workspaceId}`,
    value: { meta, bundle },
  })

  return meta
}

/**
 * Read the current local snapshot info if one exists.
 */
export async function getLatestSnapshot(workspaceId: ID): Promise<LocalSnapshotMeta | null> {
  const row = await db.meta.get(`${SNAPSHOT_KEY_PREFIX}${workspaceId}`)
  if (!row || typeof row.value !== 'object') return null
  const snapshotData = row.value as { meta?: LocalSnapshotMeta }
  return snapshotData.meta ?? null
}

/**
 * Restore workspace state from the local snapshot.
 */
export async function restoreFromSnapshot(workspaceId: ID): Promise<boolean> {
  const row = await db.meta.get(`${SNAPSHOT_KEY_PREFIX}${workspaceId}`)
  if (!row || typeof row.value !== 'object') return false
  const snapshotData = row.value as { bundle?: ExportBundle }
  if (!snapshotData.bundle) return false

  await importBundle(snapshotData.bundle, 'replace', workspaceId)
  return true
}

/**
 * Clear the saved local snapshot to free up memory.
 */
export async function deleteSnapshot(workspaceId: ID): Promise<void> {
  await db.meta.delete(`${SNAPSHOT_KEY_PREFIX}${workspaceId}`)
}
