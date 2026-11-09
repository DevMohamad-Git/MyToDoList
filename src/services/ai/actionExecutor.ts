import { db } from '@/database/db'
import { goalRepo } from '@/storage/goalRepo'
import { habitRepo } from '@/storage/habitRepo'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import type {
  AssistantProposal,
  GranularUndoLog,
} from '@/types/assistant'
import type { Goal, Habit, ID, Project, Task } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'

export interface ExecutionResult {
  success: boolean
  undoLog: GranularUndoLog
  message: string
  createdProjectId?: ID
  createdTaskIds?: ID[]
}

/**
 * Execute proposal and record granular operation log for surgical rollback.
 * Fulfills Requirement #1: Undo only created/modified items, no entire snapshot restoration.
 */
export async function executeProposal(
  workspaceId: ID,
  proposal: AssistantProposal,
): Promise<ExecutionResult> {
  const undoLog: GranularUndoLog = {
    id: `undo_${Date.now()}`,
    proposalType: proposal.type,
    createdAt: nowISO(),
    createdItems: [],
    updatedItems: [],
    deletedItems: [],
  }

  const createdTaskIds: ID[] = []
  let createdProjectId: ID | undefined

  switch (proposal.type) {
    case 'create_project_tasks': {
      // 1. Create Project if specified
      if (proposal.project && proposal.project.name?.trim()) {
        const p = await projectRepo.create(workspaceId, {
          name: proposal.project.name.trim(),
          description: proposal.project.description || '',
          color: proposal.project.color || '#3b82f6',
          icon: proposal.project.icon || 'FolderKanban',
          deadline: proposal.project.deadline || null,
        })
        createdProjectId = p.id
        undoLog.createdItems.push({ entityType: 'project', id: p.id })
      }

      // 2. Create Tasks & Subtasks
      const tasksToCreate = (proposal.tasks || []).filter((t) => t.enabled !== false)
      for (const t of tasksToCreate) {
        const createdTask = await taskRepo.create(workspaceId, {
          title: t.title.trim(),
          description: t.description || '',
          priority: t.priority || 'medium',
          estimatedDuration: t.estimatedDuration || 30,
          dueDate: t.dueDate || null,
          projectId: createdProjectId || null,
          tags: Array.isArray(t.tags) ? t.tags : [],
          links: Array.isArray(t.links)
            ? t.links.map((l) => ({ id: newId(), label: l.label, url: l.url }))
            : [],
        })

        createdTaskIds.push(createdTask.id)
        undoLog.createdItems.push({ entityType: 'task', id: createdTask.id })

        // Create subtasks
        if (Array.isArray(t.subtasks)) {
          for (const st of t.subtasks) {
            if (!st.title?.trim()) continue
            const createdSubtask = await taskRepo.create(workspaceId, {
              title: st.title.trim(),
              estimatedDuration: st.estimatedDuration || 15,
              parentTaskId: createdTask.id,
              projectId: createdProjectId || null,
              priority: createdTask.priority,
            })
            createdTaskIds.push(createdSubtask.id)
            undoLog.createdItems.push({ entityType: 'task', id: createdSubtask.id })
          }
        }
      }

      const countMsg = createdProjectId
        ? `پروژه «${proposal.project?.name}» با ${createdTaskIds.length} کار ایجاد شد.`
        : `${createdTaskIds.length} کار جدید با موفقیت ایجاد شد.`

      return {
        success: true,
        undoLog,
        message: countMsg,
        createdProjectId,
        createdTaskIds,
      }
    }

    case 'create_habits': {
      const habitsToCreate = (proposal.habits || []).filter((h) => h.enabled !== false)
      for (const h of habitsToCreate) {
        const createdHabit = await habitRepo.create(workspaceId, {
          title: h.title.trim(),
          description: h.description || '',
          target: h.target || 1,
          unit: h.unit || 'بار',
          frequency: h.frequency || 'daily',
          color: h.color || '#10b981',
          icon: h.icon || 'Repeat',
        })
        undoLog.createdItems.push({ entityType: 'habit', id: createdHabit.id })
      }
      return {
        success: true,
        undoLog,
        message: `${habitsToCreate.length} عادت جدید با موفقیت ساخته شد.`,
      }
    }

    case 'create_goal': {
      if (!proposal.goal?.title?.trim()) {
        throw new Error('عنوان هدف مشخص نشده است.')
      }
      const createdGoal = await goalRepo.create(workspaceId, {
        title: proposal.goal.title.trim(),
        description: proposal.goal.description || '',
        priority: proposal.goal.priority || 'high',
        deadline: proposal.goal.deadline || null,
        targetType: proposal.goal.targetType || 'standard',
        targetAmount: proposal.goal.targetAmount ?? null,
        currentAmount: proposal.goal.currentAmount ?? 0,
        unit: proposal.goal.unit || 'تومان',
        linkedHabitIds: proposal.goal.linkedHabitIds || [],
        linkedProjectIds: proposal.goal.linkedProjectIds || [],
        milestones: Array.isArray(proposal.goal.milestones)
          ? proposal.goal.milestones.map((m, idx) => ({
              id: newId(),
              title: m,
              completed: false,
              dueDate: null,
              completedAt: null,
              order: idx,
            }))
          : [],
      })
      undoLog.createdItems.push({ entityType: 'goal', id: createdGoal.id })
      return {
        success: true,
        undoLog,
        message: `هدف «${proposal.goal.title}» با موفقیت ایجاد شد.`,
      }
    }

    case 'goal_transaction': {
      const gt = proposal.goalTransaction
      if (!gt?.goalId) {
        throw new Error('شناسه هدف مشخص نشده است.')
      }
      const goal = await db.goals.get(gt.goalId)
      if (!goal) {
        throw new Error('هدف مورد نظر یافت نشد.')
      }

      // Record rollback state
      undoLog.updatedItems.push({
        entityType: 'goal',
        id: goal.id,
        previousValues: {
          currentAmount: goal.currentAmount ?? 0,
          financialTransactions: goal.financialTransactions ? [...goal.financialTransactions] : [],
        },
      })

      const transactions = gt.transactions || []
      let lastGoal = goal
      for (const tx of transactions) {
        const updated = await goalRepo.addTransaction(goal.id, {
          type: tx.type,
          amount: tx.amount,
          note: tx.note,
        })
        if (updated) lastGoal = updated
      }

      const netAmount = (lastGoal.currentAmount ?? 0).toLocaleString()
      const unit = lastGoal.unit || 'تومان'
      return {
        success: true,
        undoLog,
        message: `${transactions.length} تراکنش در هدف «${goal.title}» ثبت شد. موجودی جدید: ${netAmount} ${unit}`,
      }
    }

    case 'bulk_edit': {
      const edits = (proposal.edits || []).filter((e) => e.enabled !== false)
      for (const edit of edits) {
        if (edit.entityType === 'task') {
          const current = await db.tasks.get(edit.id)
          if (current) {
            undoLog.updatedItems.push({
              entityType: 'task',
              id: edit.id,
              previousValues: { [edit.field]: (current as unknown as Record<string, unknown>)[edit.field] },
            })
            await taskRepo.update(edit.id, { [edit.field]: edit.newValue })
          }
        } else if (edit.entityType === 'project') {
          const current = await db.projects.get(edit.id)
          if (current) {
            undoLog.updatedItems.push({
              entityType: 'project',
              id: edit.id,
              previousValues: { [edit.field]: (current as unknown as Record<string, unknown>)[edit.field] },
            })
            await projectRepo.update(edit.id, { [edit.field]: edit.newValue })
          }
        }
      }
      return {
        success: true,
        undoLog,
        message: `${edits.length} تغییر با موفقیت اعمال شد.`,
      }
    }

    case 'bulk_delete': {
      const deletions = proposal.deletions || []
      for (const del of deletions) {
        if (del.entityType === 'task') {
          const current = await db.tasks.get(del.id)
          if (current) {
            undoLog.deletedItems.push({ entityType: 'task', item: current })
            await taskRepo.remove(del.id)
          }
        } else if (del.entityType === 'project') {
          const current = await db.projects.get(del.id)
          if (current) {
            undoLog.deletedItems.push({ entityType: 'project', item: current })
            await projectRepo.remove(del.id, 'delete')
          }
        } else if (del.entityType === 'habit') {
          const current = await db.habits.get(del.id)
          if (current) {
            undoLog.deletedItems.push({ entityType: 'habit', item: current })
            await habitRepo.remove(del.id)
          }
        } else if (del.entityType === 'goal') {
          const current = await db.goals.get(del.id)
          if (current) {
            undoLog.deletedItems.push({ entityType: 'goal', item: current })
            await goalRepo.remove(del.id)
          }
        }
      }
      return {
        success: true,
        undoLog,
        message: `${deletions.length} مورد حذف شد.`,
      }
    }

    case 'schedule_planner': {
      const slots = (proposal.scheduleSlots || []).filter((s) => s.enabled !== false)
      for (const slot of slots) {
        const current = await db.tasks.get(slot.taskId)
        if (current) {
          undoLog.updatedItems.push({
            entityType: 'task',
            id: slot.taskId,
            previousValues: {
              startDate: current.startDate,
              estimatedDuration: current.estimatedDuration,
            },
          })
          await taskRepo.update(slot.taskId, {
            startDate: slot.startDate,
            estimatedDuration: slot.duration,
          })
        }
      }
      return {
        success: true,
        undoLog,
        message: `${slots.length} کار روی برنامه‌ریز زمان‌بندی شد.`,
      }
    }

    default:
      throw new Error('نوع عملیات پشتیبانی نمی‌شود.')
  }
}

/**
 * Rollback the granular actions performed by the assistant.
 * Fulfills Requirement #1: Surgical undo without affecting any other data.
 */
export async function rollbackGranular(undoLog: GranularUndoLog): Promise<void> {
  // 1. Delete items that were created
  for (const item of undoLog.createdItems) {
    if (item.entityType === 'task') {
      await taskRepo.remove(item.id).catch(() => {})
    } else if (item.entityType === 'project') {
      await projectRepo.remove(item.id, 'delete').catch(() => {})
    } else if (item.entityType === 'habit') {
      await habitRepo.remove(item.id).catch(() => {})
    } else if (item.entityType === 'goal') {
      await goalRepo.remove(item.id).catch(() => {})
    }
  }

  // 2. Restore previous values of updated items
  for (const item of undoLog.updatedItems) {
    if (item.entityType === 'task') {
      await taskRepo.update(item.id, item.previousValues).catch(() => {})
    } else if (item.entityType === 'project') {
      await projectRepo.update(item.id, item.previousValues).catch(() => {})
    } else if (item.entityType === 'habit') {
      await habitRepo.update(item.id, item.previousValues).catch(() => {})
    } else if (item.entityType === 'goal') {
      await goalRepo.update(item.id, item.previousValues).catch(() => {})
    }
  }

  // 3. Restore deleted items
  for (const item of undoLog.deletedItems) {
    if (item.entityType === 'task') {
      await db.tasks.put(item.item as Task).catch(() => {})
    } else if (item.entityType === 'project') {
      await db.projects.put(item.item as Project).catch(() => {})
    } else if (item.entityType === 'habit') {
      await db.habits.put(item.item as Habit).catch(() => {})
    } else if (item.entityType === 'goal') {
      await db.goals.put(item.item as Goal).catch(() => {})
    }
  }
}
