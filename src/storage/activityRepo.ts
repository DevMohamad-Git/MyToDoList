import { db } from '@/database/db'
import type { ActivityRecord, ActivityType, EntityKind, ID } from '@/types'
import { nowISO, toDayKey } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Activity log. Summaries are rendered at write time so the history feed never
 * needs to join against records that may since have been deleted — a deleted
 * project's completion still reads correctly a month later.
 */
export async function logActivity(
  workspaceId: ID,
  type: ActivityType,
  entityKind: EntityKind,
  entityId: ID,
  summary: string,
  meta: ActivityRecord['meta'] = {},
): Promise<void> {
  const createdAt = nowISO()
  await db.activity.add({
    id: newId(),
    workspaceId,
    type,
    entityKind,
    entityId,
    summary,
    meta,
    createdAt,
    day: toDayKey(createdAt),
  })
}

export const activityRepo = {
  async forEntity(workspaceId: ID, entityId: ID): Promise<ActivityRecord[]> {
    const rows = await db.activity.where('[workspaceId+entityId]').equals([workspaceId, entityId]).toArray()
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async recent(workspaceId: ID, limit = 50): Promise<ActivityRecord[]> {
    const rows = await db.activity.where('workspaceId').equals(workspaceId).toArray()
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
  },

  async between(workspaceId: ID, startDay: string, endDay: string): Promise<ActivityRecord[]> {
    return db.activity
      .where('[workspaceId+day]')
      .between([workspaceId, startDay], [workspaceId, endDay], true, true)
      .toArray()
  },

  async clearForWorkspace(workspaceId: ID): Promise<void> {
    await db.activity.where('workspaceId').equals(workspaceId).delete()
  },
}
