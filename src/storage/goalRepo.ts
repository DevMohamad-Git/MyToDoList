import { db } from '@/database/db'
import { createGoal } from '@/database/factories'
import { logActivity } from '@/storage/activityRepo'
import type { FinancialTransaction, Goal, GoalStatus, ID, Milestone } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'
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

  async linkHabit(goalId: ID, habitId: ID): Promise<void> {
    const goal = await db.goals.get(goalId)
    if (!goal) return
    const current = goal.linkedHabitIds ?? []
    if (current.includes(habitId)) return
    await db.goals.update(goalId, {
      linkedHabitIds: [...current, habitId],
      updatedAt: nowISO(),
    })
  },

  async unlinkHabit(goalId: ID, habitId: ID): Promise<void> {
    const goal = await db.goals.get(goalId)
    if (!goal) return
    const current = goal.linkedHabitIds ?? []
    await db.goals.update(goalId, {
      linkedHabitIds: current.filter((h) => h !== habitId),
      updatedAt: nowISO(),
    })
  },

  async addTransaction(
    goalId: ID,
    tx: { type: 'deposit' | 'withdrawal'; amount: number; note?: string; date?: string },
  ): Promise<Goal | undefined> {
    const goal = await db.goals.get(goalId)
    if (!goal) return undefined
    const cleanAmount = Math.max(0, Number(tx.amount) || 0)
    if (cleanAmount <= 0) return goal

    const current = goal.currentAmount ?? 0
    const nextAmount = tx.type === 'deposit' ? current + cleanAmount : Math.max(0, current - cleanAmount)
    const newTx: FinancialTransaction = {
      id: newId(),
      type: tx.type,
      amount: cleanAmount,
      date: tx.date || nowISO(),
      note: tx.note?.trim() || '',
    }
    const transactions = [...(goal.financialTransactions ?? []), newTx]

    const next: Goal = {
      ...goal,
      currentAmount: nextAmount,
      financialTransactions: transactions,
      updatedAt: nowISO(),
    }
    await db.goals.put(next)
    await logActivity(
      goal.workspaceId,
      'goal_updated',
      'goal',
      goalId,
      tx.type === 'deposit'
        ? `واریز ${cleanAmount.toLocaleString()} به هدف «${goal.title}»`
        : `برداشت ${cleanAmount.toLocaleString()} از هدف «${goal.title}»`,
    )
    return next
  },

  async deleteTransaction(goalId: ID, transactionId: ID): Promise<Goal | undefined> {
    const goal = await db.goals.get(goalId)
    if (!goal || !goal.financialTransactions) return undefined
    const tx = goal.financialTransactions.find((t) => t.id === transactionId)
    if (!tx) return goal

    const current = goal.currentAmount ?? 0
    const nextAmount = tx.type === 'deposit' ? Math.max(0, current - tx.amount) : current + tx.amount
    const transactions = goal.financialTransactions.filter((t) => t.id !== transactionId)

    const next: Goal = {
      ...goal,
      currentAmount: nextAmount,
      financialTransactions: transactions,
      updatedAt: nowISO(),
    }
    await db.goals.put(next)
    return next
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
