import { CLOSED_TASK_STATUSES } from '@/config/constants'
import type { Goal, Project, Task } from '@/types'
import { ratio, toPercent } from '@/utils/math'

/**
 * Progress derivation.
 *
 * Progress is *derived* rather than stored wherever possible, so it can never
 * disagree with the underlying work. A manual override is honoured when the user
 * sets one explicitly (`manualProgress`), because sometimes real-world progress
 * is not expressible as a task count.
 *
 * These functions are pure and take their inputs explicitly — that is what makes
 * the whole scoring/analytics stack testable without a database.
 */

/**
 * Task progress. Precedence:
 *  1. terminal status → 100 (completed) / 0 (cancelled)
 *  2. explicit manual override
 *  3. weighted subtask completion (a subtask with subtasks of its own counts by
 *     its own derived progress, so deep trees roll up correctly)
 *  4. status heuristic: in_progress reads as 50%, anything else 0%
 */
export function taskProgress(task: Task, subtasks: Task[] = [], allTasks?: Task[]): number {
  if (task.status === 'completed') return 100
  if (task.status === 'cancelled') return 0
  if (task.manualProgress != null) return toPercent(task.manualProgress)

  const children = subtasks.filter((s) => s.parentTaskId === task.id)
  if (children.length > 0) {
    const total = children.reduce((acc, child) => {
      const grandChildren = allTasks ? allTasks.filter((t) => t.parentTaskId === child.id) : []
      return acc + taskProgress(child, grandChildren, allTasks)
    }, 0)
    return toPercent(total / children.length)
  }

  return task.status === 'in_progress' ? 50 : 0
}

export interface ProjectStats {
  totalTasks: number
  completedTasks: number
  openTasks: number
  cancelledTasks: number
  overdueTasks: number
  blockedTasks: number
  progress: number
  milestoneProgress: number
  totalMilestones: number
  completedMilestones: number
  estimatedMinutes: number
  /** Estimate remaining on open tasks only. */
  remainingEstimateMinutes: number
  actualMinutes: number
  /** `actual / estimated` for completed work; `null` when there is nothing to compare. */
  estimateAccuracy: number | null
  nextDeadline: string | null
  health: ProjectHealth
}

export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track' | 'done' | 'idle'

/**
 * Project progress blends task completion with milestone completion. Tasks carry
 * most of the signal; milestones exist because a project can be 80% done by task
 * count while still missing a defining deliverable, and the blend surfaces that.
 */
export function projectStats(
  project: Project,
  tasks: Task[],
  actualMinutes: number,
  now: Date = new Date(),
): ProjectStats {
  const own = tasks.filter((t) => t.projectId === project.id && !t.archived)
  // Only count top-level tasks toward completion so a task with five subtasks
  // does not outweigh five standalone tasks.
  const topLevel = own.filter((t) => !t.parentTaskId)

  const completedTasks = topLevel.filter((t) => t.status === 'completed').length
  const cancelledTasks = topLevel.filter((t) => t.status === 'cancelled').length
  const countable = topLevel.filter((t) => t.status !== 'cancelled')
  const openTasks = countable.length - completedTasks
  const blockedTasks = topLevel.filter((t) => t.status === 'blocked').length
  const overdueTasks = own.filter(
    (t) => t.dueDate && !CLOSED_TASK_STATUSES.includes(t.status) && new Date(t.dueDate) < now,
  ).length

  const weightedProgress =
    countable.length === 0
      ? 0
      : countable.reduce((acc, t) => acc + taskProgress(t, own, own), 0) / countable.length

  const totalMilestones = project.milestones.length
  const completedMilestones = project.milestones.filter((m) => m.completed).length
  const milestoneProgress = totalMilestones === 0 ? 0 : toPercent(ratio(completedMilestones, totalMilestones) * 100)

  let progress: number
  if (project.manualProgress != null) {
    progress = toPercent(project.manualProgress)
  } else if (project.status === 'completed') {
    progress = 100
  } else if (totalMilestones > 0 && countable.length > 0) {
    progress = toPercent(weightedProgress * 0.7 + milestoneProgress * 0.3)
  } else if (totalMilestones > 0) {
    progress = milestoneProgress
  } else {
    progress = toPercent(weightedProgress)
  }

  const estimatedMinutes = own.reduce((acc, t) => acc + (t.estimatedDuration ?? 0), 0)
  const remainingEstimateMinutes = own
    .filter((t) => !CLOSED_TASK_STATUSES.includes(t.status))
    .reduce((acc, t) => acc + (t.estimatedDuration ?? 0), 0)

  const completedWithEstimate = own.filter(
    (t) => t.status === 'completed' && (t.estimatedDuration ?? 0) > 0 && t.actualDuration > 0,
  )
  const estimateAccuracy =
    completedWithEstimate.length === 0
      ? null
      : completedWithEstimate.reduce((acc, t) => acc + t.actualDuration / (t.estimatedDuration ?? 1), 0) /
        completedWithEstimate.length

  const upcoming = own
    .filter((t) => t.dueDate && !CLOSED_TASK_STATUSES.includes(t.status))
    .map((t) => t.dueDate!)
    .sort()
  const nextDeadline = upcoming[0] ?? null

  return {
    totalTasks: topLevel.length,
    completedTasks,
    openTasks,
    cancelledTasks,
    overdueTasks,
    blockedTasks,
    progress,
    milestoneProgress,
    totalMilestones,
    completedMilestones,
    estimatedMinutes,
    remainingEstimateMinutes,
    actualMinutes,
    estimateAccuracy,
    nextDeadline,
    health: projectHealth(project, progress, overdueTasks, countable.length, now),
  }
}

/**
 * Project health compares elapsed schedule against delivered progress. A project
 * that is 40% through its calendar but 10% done is off track, which is a much
 * more useful signal than raw percentage.
 */
export function projectHealth(
  project: Project,
  progress: number,
  overdueTasks: number,
  taskCount: number,
  now: Date = new Date(),
): ProjectHealth {
  if (project.status === 'completed') return 'done'
  if (project.status === 'archived' || project.status === 'on_hold') return 'idle'
  if (taskCount === 0) return 'idle'

  if (!project.deadline) {
    if (overdueTasks >= 3) return 'off_track'
    if (overdueTasks > 0) return 'at_risk'
    return 'on_track'
  }

  const deadline = new Date(project.deadline).getTime()
  const start = project.startDate ? new Date(project.startDate).getTime() : new Date(project.createdAt).getTime()
  const span = deadline - start
  if (span <= 0) return now.getTime() > deadline && progress < 100 ? 'off_track' : 'on_track'

  const elapsed = (now.getTime() - start) / span
  if (elapsed > 1 && progress < 100) return 'off_track'

  // Allow a 15-point grace band before flagging: real projects are not linear.
  const expected = Math.max(0, Math.min(1, elapsed)) * 100
  const gap = expected - progress
  if (gap > 30 || overdueTasks >= 3) return 'off_track'
  if (gap > 15 || overdueTasks > 0) return 'at_risk'
  return 'on_track'
}

export interface GoalStats {
  progress: number
  totalMilestones: number
  completedMilestones: number
  linkedProjects: number
  linkedTasks: number
  completedLinkedTasks: number
  daysRemaining: number | null
  onTrack: boolean
}

/**
 * Goal progress combines its own milestones with the real work linked to it —
 * linked projects' progress and linked tasks' completion. A goal with no linked
 * work falls back to milestones alone, and a goal with neither reports 0 rather
 * than a fabricated number.
 */
export function goalStats(
  goal: Goal,
  linkedProjects: Project[],
  linkedTasks: Task[],
  projectProgressById: Map<string, number>,
  now: Date = new Date(),
): GoalStats {
  const totalMilestones = goal.milestones.length
  const completedMilestones = goal.milestones.filter((m) => m.completed).length
  const milestonePct = totalMilestones ? ratio(completedMilestones, totalMilestones) * 100 : null

  const relevantProjects = linkedProjects.filter((p) => goal.linkedProjectIds.includes(p.id))
  const projectPct = relevantProjects.length
    ? relevantProjects.reduce((acc, p) => acc + (projectProgressById.get(p.id) ?? 0), 0) / relevantProjects.length
    : null

  const ownTasks = linkedTasks.filter((t) => t.goalId === goal.id && !t.archived && t.status !== 'cancelled')
  const completedLinkedTasks = ownTasks.filter((t) => t.status === 'completed').length
  const taskPct = ownTasks.length ? ratio(completedLinkedTasks, ownTasks.length) * 100 : null

  let progress: number
  if (goal.manualProgress != null) {
    progress = toPercent(goal.manualProgress)
  } else if (goal.status === 'achieved') {
    progress = 100
  } else {
    // Average whichever signals actually exist, so an unused dimension does not
    // drag the number toward zero.
    const parts = [milestonePct, projectPct, taskPct].filter((p): p is number => p !== null)
    progress = parts.length === 0 ? 0 : toPercent(parts.reduce((a, b) => a + b, 0) / parts.length)
  }

  const daysRemaining = goal.deadline
    ? Math.ceil((new Date(goal.deadline).getTime() - now.getTime()) / 86_400_000)
    : null

  // "On track" = progress keeping pace with elapsed time toward the deadline.
  let onTrack = true
  if (goal.deadline && goal.status === 'active') {
    const start = new Date(goal.createdAt).getTime()
    const end = new Date(goal.deadline).getTime()
    const span = end - start
    if (span > 0) {
      const elapsed = Math.max(0, Math.min(1, (now.getTime() - start) / span)) * 100
      onTrack = progress >= elapsed - 15
    } else {
      onTrack = progress >= 100
    }
  }

  return {
    progress,
    totalMilestones,
    completedMilestones,
    linkedProjects: relevantProjects.length,
    linkedTasks: ownTasks.length,
    completedLinkedTasks,
    daysRemaining,
    onTrack,
  }
}

/**
 * A task is blocked by dependencies when any prerequisite is still open. Used by
 * the planner (to avoid scheduling unstartable work) and the task list (to
 * explain why something cannot begin).
 */
export function blockingDependencies(task: Task, byId: Map<string, Task>): Task[] {
  return task.dependencies
    .map((id) => byId.get(id))
    .filter((dep): dep is Task => Boolean(dep) && !CLOSED_TASK_STATUSES.includes(dep!.status))
}

export function isTaskOverdue(task: Task, now: Date = new Date()): boolean {
  if (!task.dueDate || CLOSED_TASK_STATUSES.includes(task.status)) return false
  return new Date(task.dueDate) < now
}

export function isTaskOpen(task: Task): boolean {
  return !task.archived && !CLOSED_TASK_STATUSES.includes(task.status)
}
