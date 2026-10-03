import { db } from '@/database/db'
import { createProject } from '@/database/factories'
import { logActivity } from '@/storage/activityRepo'
import { attachmentRepo } from '@/storage/attachmentRepo'
import type { ID, Milestone, Project, ProjectStatus } from '@/types'
import { nowISO } from '@/utils/date'
import { byOrderThenCreated } from '@/utils/math'

export const projectRepo = {
  get(id: ID) {
    return db.projects.get(id)
  },

  async list(workspaceId: ID, statuses?: ProjectStatus[]): Promise<Project[]> {
    const rows = await db.projects.where('workspaceId').equals(workspaceId).toArray()
    const filtered = statuses?.length ? rows.filter((p) => statuses.includes(p.status)) : rows
    return filtered.sort(byOrderThenCreated)
  },

  async active(workspaceId: ID): Promise<Project[]> {
    return projectRepo.list(workspaceId, ['active', 'planning'])
  },

  async create(workspaceId: ID, input: Partial<Project> = {}): Promise<Project> {
    const project = createProject(workspaceId, input)
    await db.projects.add(project)
    await logActivity(workspaceId, 'project_created', 'project', project.id, `Created project “${project.name}”`)
    return project
  },

  async update(id: ID, patch: Partial<Project>): Promise<Project | undefined> {
    const before = await db.projects.get(id)
    if (!before) return undefined
    const completing = patch.status === 'completed' && before.status !== 'completed'
    const next: Project = {
      ...before,
      ...patch,
      completedAt: completing ? nowISO() : patch.status && patch.status !== 'completed' ? null : before.completedAt,
      updatedAt: nowISO(),
    }
    await db.projects.put(next)
    if (completing) {
      await logActivity(next.workspaceId, 'project_completed', 'project', id, `Completed project “${next.name}”`)
    } else {
      await logActivity(next.workspaceId, 'project_updated', 'project', id, `Updated project “${next.name}”`)
    }
    return next
  },

  /** Add/replace/remove milestones; milestone completion feeds project progress. */
  async setMilestones(id: ID, milestones: Milestone[]): Promise<void> {
    await db.projects.update(id, { milestones, updatedAt: nowISO() })
  },

  async toggleMilestone(id: ID, milestoneId: ID): Promise<void> {
    const project = await db.projects.get(id)
    if (!project) return
    const milestones = project.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? nowISO() : null }
        : m,
    )
    await db.projects.update(id, { milestones, updatedAt: nowISO() })
  },

  /**
   * Report what deleting a project would take with it, so the confirm dialog can
   * state real numbers instead of a generic warning.
   */
  async deletionImpact(id: ID): Promise<{ tasks: number; attachments: number; timeEntries: number }> {
    const project = await db.projects.get(id)
    if (!project) return { tasks: 0, attachments: 0, timeEntries: 0 }
    const tasks = await db.tasks
      .where('[workspaceId+projectId]')
      .equals([project.workspaceId, id])
      .toArray()
    const taskIds = tasks.map((t) => t.id)
    const attachments = (await attachmentRepo.forWorkspace(project.workspaceId)).filter(
      (a) => a.projectId === id || (a.taskId && taskIds.includes(a.taskId)),
    ).length
    const timeEntries = (await db.timeEntries.where('workspaceId').equals(project.workspaceId).toArray()).filter(
      (e) => e.projectId === id,
    ).length
    return { tasks: tasks.length, attachments, timeEntries }
  },

  /**
   * Delete a project. `taskStrategy` decides the fate of its tasks: deleting
   * them, or detaching them into the workspace inbox. Detach is the default in
   * the UI because losing work silently is the worse failure.
   */
  async remove(id: ID, taskStrategy: 'delete' | 'detach' = 'detach'): Promise<void> {
    const project = await db.projects.get(id)
    if (!project) return
    const tasks = await db.tasks
      .where('[workspaceId+projectId]')
      .equals([project.workspaceId, id])
      .toArray()

    if (taskStrategy === 'delete') {
      for (const task of tasks) {
        await attachmentRepo.removeForTask(task.id)
        await db.timeEntries.where('taskId').equals(task.id).delete()
        await db.focusSessions.where('taskId').equals(task.id).modify({ taskId: null })
      }
      await db.tasks.bulkDelete(tasks.map((t) => t.id))
    } else {
      for (const task of tasks) {
        await db.tasks.update(task.id, { projectId: null, updatedAt: nowISO() })
      }
    }

    await attachmentRepo.removeForProject(id)
    await db.timeEntries.where('projectId').equals(id).modify({ projectId: null })
    await db.focusSessions.where('projectId').equals(id).modify({ projectId: null })

    // Unlink from any goals that referenced it.
    const goals = await db.goals.where('workspaceId').equals(project.workspaceId).toArray()
    for (const goal of goals) {
      if (goal.linkedProjectIds.includes(id)) {
        await db.goals.update(goal.id, {
          linkedProjectIds: goal.linkedProjectIds.filter((p) => p !== id),
          updatedAt: nowISO(),
        })
      }
    }

    await db.projects.delete(id)
    await logActivity(
      project.workspaceId,
      'project_deleted',
      'project',
      id,
      `Deleted project “${project.name}” (${taskStrategy === 'delete' ? `${tasks.length} task(s) deleted` : `${tasks.length} task(s) moved to Inbox`})`,
    )
  },

  async reorder(ids: ID[]): Promise<void> {
    await db.transaction('rw', db.projects, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.projects.update(ids[i], { order: i, updatedAt: nowISO() })
      }
    })
  },
}
