import { db } from '@/database/db'
import { createGoal } from '@/database/factories'
import { logActivity } from '@/storage/activityRepo'
import type { Goal, GoalStatus, ID, Milestone } from '@/types'
import { nowISO } from '@/utils/date'
import { byOrderThenCreated } from '@/utils/math'

export const goalRepo = {
  get(id: ID) {
    return db.goals.get(id)
  },

  async list(workspaceId: ID, statuses?: GoalStatus[]): Promise<Goal[]> {
    const rows = await db.goals.where('workspaceId').equals(workspaceId).toArray()
    const filtered = statuses?.length ? rows.filter((g) => statuses.includes(g.status)) : rows
    return filtered.sort(byOrderThenCreated)
  },

  async create(workspaceId: ID, input: Partial<Goal> = {}): Promise<Goal> {
    const goal = createGoal(workspaceId, input)
    await db.goals.add(goal)
    await logActivity(workspaceId, 'goal_created', 'goal', goal.id, `Created goal “${goal.title}”`)
    return goal
  },

  async update(id: ID, patch: Partial<Goal>): Promise<Goal | undefined> {
    const before = await db.goals.get(id)
    if (!before) return undefined
    const achieving = patch.status === 'achieved' && before.status !== 'achieved'
    const next: Goal = {
      ...before,
      ...patch,
      achievedAt: achieving ? nowISO() : patch.status && patch.status !== 'achieved' ? null : before.achievedAt,
      updatedAt: nowISO(),
    }
    await db.goals.put(next)
    await logActivity(
      next.workspaceId,
      achieving ? 'goal_achieved' : 'goal_updated',
      'goal',
      id,
      achieving ? `Achieved goal “${next.title}”` : `Updated goal “${next.title}”`,
    )
    return next
  },

  async setMilestones(id: ID, milestones: Milestone[]): Promise<void> {
    await db.goals.update(id, { milestones, updatedAt: nowISO() })
  },

  async toggleMilestone(id: ID, milestoneId: ID): Promise<void> {
    const goal = await db.goals.get(id)
    if (!goal) return
    const milestones = goal.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? nowISO() : null }
        : m,
    )
    await db.goals.update(id, { milestones, updatedAt: nowISO() })
  },

  async linkProject(goalId: ID, projectId: ID): Promise<void> {
    const goal = await db.goals.get(goalId)
    if (!goal || goal.linkedProjectIds.includes(projectId)) return
    await db.goals.update(goalId, {
      linkedProjectIds: [...goal.linkedProjectIds, projectId],
      updatedAt: nowISO(),
    })
  },

  async unlinkProject(goalId: ID, projectId: ID): Promise<void> {
    const goal = await db.goals.get(goalId)
    if (!goal) return
    await db.goals.update(goalId, {
      linkedProjectIds: goal.linkedProjectIds.filter((p) => p !== projectId),
      updatedAt: nowISO(),
    })
  },

  /** Deleting a goal detaches its tasks; it never deletes user work. */
  async remove(id: ID): Promise<void> {
    const goal = await db.goals.get(id)
    if (!goal) return
    const tasks = await db.tasks.where('[workspaceId+goalId]').equals([goal.workspaceId, id]).toArray()
    for (const task of tasks) {
      await db.tasks.update(task.id, { goalId: null, updatedAt: nowISO() })
    }
    await db.goals.delete(id)
    await logActivity(
      goal.workspaceId,
      'goal_updated',
      'goal',
      id,
      `Deleted goal “${goal.title}”${tasks.length ? ` (${tasks.length} task(s) unlinked)` : ''}`,
    )
  },

  async reorder(ids: ID[]): Promise<void> {
    await db.transaction('rw', db.goals, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.goals.update(ids[i], { order: i, updatedAt: nowISO() })
      }
    })
  },
}
