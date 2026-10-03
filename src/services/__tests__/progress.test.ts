import { describe, expect, it } from 'vitest'
import { goalStats, blockingDependencies, isTaskOverdue, projectHealth, projectStats, taskProgress } from '@/services/progress'
import { at, goal, localDate, project, task } from '@/test/fixtures'

describe('taskProgress', () => {
  it('reports 100 for a completed task regardless of subtasks', () => {
    const parent = task({ id: 'p', status: 'completed' })
    const child = task({ id: 'c', parentTaskId: 'p', status: 'inbox' })
    expect(taskProgress(parent, [child])).toBe(100)
  })

  it('reports 0 for a cancelled task', () => {
    expect(taskProgress(task({ status: 'cancelled', manualProgress: 80 }))).toBe(0)
  })

  it('honours a manual override ahead of the status heuristic', () => {
    expect(taskProgress(task({ status: 'in_progress', manualProgress: 35 }))).toBe(35)
  })

  it('derives progress from subtask completion', () => {
    const parent = task({ id: 'p' })
    const subtasks = [
      task({ id: 'a', parentTaskId: 'p', status: 'completed' }),
      task({ id: 'b', parentTaskId: 'p', status: 'completed' }),
      task({ id: 'c', parentTaskId: 'p', status: 'inbox' }),
      task({ id: 'd', parentTaskId: 'p', status: 'inbox' }),
    ]
    expect(taskProgress(parent, subtasks)).toBe(50)
  })

  it('counts an in-progress subtask as half done', () => {
    const parent = task({ id: 'p' })
    const subtasks = [
      task({ id: 'a', parentTaskId: 'p', status: 'completed' }),
      task({ id: 'b', parentTaskId: 'p', status: 'in_progress' }),
    ]
    expect(taskProgress(parent, subtasks)).toBe(75)
  })

  it('rolls nested subtask trees up through their parents', () => {
    const root = task({ id: 'root' })
    const mid = task({ id: 'mid', parentTaskId: 'root' })
    const leafA = task({ id: 'leafA', parentTaskId: 'mid', status: 'completed' })
    const leafB = task({ id: 'leafB', parentTaskId: 'mid', status: 'inbox' })
    const all = [mid, leafA, leafB]
    // mid is 50% (one of two leaves), so root — whose only child is mid — is 50%.
    expect(taskProgress(root, all, all)).toBe(50)
  })

  it('falls back to the status heuristic with no subtasks', () => {
    expect(taskProgress(task({ status: 'in_progress' }))).toBe(50)
    expect(taskProgress(task({ status: 'planned' }))).toBe(0)
  })
})

describe('projectStats', () => {
  const now = localDate(2026, 6, 15)

  it('counts only top-level tasks toward completion', () => {
    const p = project({ id: 'proj' })
    const tasks = [
      task({ id: 't1', projectId: 'proj', status: 'completed' }),
      task({ id: 't2', projectId: 'proj', status: 'inbox' }),
      // Subtasks must not inflate the denominator.
      task({ id: 's1', projectId: 'proj', parentTaskId: 't2', status: 'inbox' }),
      task({ id: 's2', projectId: 'proj', parentTaskId: 't2', status: 'inbox' }),
    ]
    const stats = projectStats(p, tasks, 0, now)
    expect(stats.totalTasks).toBe(2)
    expect(stats.completedTasks).toBe(1)
    expect(stats.progress).toBe(50)
  })

  it('excludes cancelled tasks from the completion denominator', () => {
    const p = project({ id: 'proj' })
    const tasks = [
      task({ id: 't1', projectId: 'proj', status: 'completed' }),
      task({ id: 't2', projectId: 'proj', status: 'cancelled' }),
    ]
    const stats = projectStats(p, tasks, 0, now)
    expect(stats.cancelledTasks).toBe(1)
    expect(stats.progress).toBe(100)
  })

  it('blends milestone progress with task progress when both exist', () => {
    const p = project({
      id: 'proj',
      milestones: [
        { id: 'm1', title: 'A', completed: true, dueDate: null, completedAt: null, order: 0 },
        { id: 'm2', title: 'B', completed: false, dueDate: null, completedAt: null, order: 1 },
      ],
    })
    const tasks = [
      task({ id: 't1', projectId: 'proj', status: 'completed' }),
      task({ id: 't2', projectId: 'proj', status: 'completed' }),
      task({ id: 't3', projectId: 'proj', status: 'inbox' }),
      task({ id: 't4', projectId: 'proj', status: 'inbox' }),
    ]
    // tasks 50% * 0.7 + milestones 50% * 0.3 = 50
    expect(projectStats(p, tasks, 0, now).progress).toBe(50)
  })

  it('respects a manual progress override', () => {
    const p = project({ id: 'proj', manualProgress: 82 })
    expect(projectStats(p, [], 0, now).progress).toBe(82)
  })

  it('computes remaining estimate from open tasks only', () => {
    const p = project({ id: 'proj' })
    const tasks = [
      task({ id: 't1', projectId: 'proj', status: 'completed', estimatedDuration: 60 }),
      task({ id: 't2', projectId: 'proj', status: 'inbox', estimatedDuration: 90 }),
      task({ id: 't3', projectId: 'proj', status: 'in_progress', estimatedDuration: 30 }),
    ]
    const stats = projectStats(p, tasks, 0, now)
    expect(stats.estimatedMinutes).toBe(180)
    expect(stats.remainingEstimateMinutes).toBe(120)
  })

  it('reports estimate accuracy across completed tracked tasks', () => {
    const p = project({ id: 'proj' })
    const tasks = [
      task({ id: 't1', projectId: 'proj', status: 'completed', estimatedDuration: 60, actualDuration: 90 }),
      task({ id: 't2', projectId: 'proj', status: 'completed', estimatedDuration: 60, actualDuration: 30 }),
    ]
    // ratios 1.5 and 0.5 → mean 1.0
    expect(projectStats(p, tasks, 0, now).estimateAccuracy).toBeCloseTo(1, 5)
  })

  it('surfaces the nearest open deadline', () => {
    const p = project({ id: 'proj' })
    const tasks = [
      task({ id: 't1', projectId: 'proj', dueDate: at(2026, 7, 1) }),
      task({ id: 't2', projectId: 'proj', dueDate: at(2026, 6, 20) }),
      task({ id: 't3', projectId: 'proj', dueDate: at(2026, 6, 18), status: 'completed' }),
    ]
    expect(projectStats(p, tasks, 0, now).nextDeadline).toBe(at(2026, 6, 20))
  })
})

describe('projectHealth', () => {
  it('is done for a completed project', () => {
    expect(projectHealth(project({ status: 'completed' }), 40, 0, 5)).toBe('done')
  })

  it('is idle with no tasks', () => {
    expect(projectHealth(project({ status: 'active' }), 0, 0, 0)).toBe('idle')
  })

  it('is off_track past the deadline while incomplete', () => {
    const p = project({
      status: 'active',
      startDate: at(2026, 1, 1),
      deadline: at(2026, 2, 1),
    })
    expect(projectHealth(p, 60, 0, 5, localDate(2026, 3, 1))).toBe('off_track')
  })

  it('is on_track when progress keeps pace with elapsed schedule', () => {
    const p = project({ status: 'active', startDate: at(2026, 1, 1), deadline: at(2026, 3, 1) })
    // Halfway through the window with 50% done.
    expect(projectHealth(p, 50, 0, 5, localDate(2026, 1, 31))).toBe('on_track')
  })

  it('is at_risk when progress lags the schedule', () => {
    const p = project({ status: 'active', startDate: at(2026, 1, 1), deadline: at(2026, 3, 1) })
    // ~50% elapsed, only 30% done → 20-point gap.
    expect(projectHealth(p, 30, 0, 5, localDate(2026, 1, 31))).toBe('at_risk')
  })

  it('flags projects with several overdue tasks even without a deadline', () => {
    expect(projectHealth(project({ status: 'active' }), 50, 3, 8)).toBe('off_track')
  })
})

describe('goalStats', () => {
  const now = localDate(2026, 6, 15)

  it('averages only the signals that exist', () => {
    const g = goal({
      id: 'g',
      milestones: [
        { id: 'm1', title: 'A', completed: true, dueDate: null, completedAt: null, order: 0 },
        { id: 'm2', title: 'B', completed: false, dueDate: null, completedAt: null, order: 1 },
      ],
    })
    // Milestones only → 50, not diluted by absent project/task signals.
    expect(goalStats(g, [], [], new Map(), now).progress).toBe(50)
  })

  it('includes linked project progress and linked task completion', () => {
    const g = goal({ id: 'g', linkedProjectIds: ['p1'] })
    const p1 = project({ id: 'p1' })
    const tasks = [
      task({ id: 't1', goalId: 'g', status: 'completed' }),
      task({ id: 't2', goalId: 'g', status: 'inbox' }),
    ]
    const progressById = new Map([['p1', 80]])
    // project 80, tasks 50 → mean 65
    const stats = goalStats(g, [p1], tasks, progressById, now)
    expect(stats.progress).toBe(65)
    expect(stats.linkedProjects).toBe(1)
    expect(stats.linkedTasks).toBe(2)
    expect(stats.completedLinkedTasks).toBe(1)
  })

  it('reports 0 rather than inventing a number when nothing is linked', () => {
    expect(goalStats(goal({ id: 'g' }), [], [], new Map(), now).progress).toBe(0)
  })

  it('reports 100 for an achieved goal', () => {
    expect(goalStats(goal({ id: 'g', status: 'achieved' }), [], [], new Map(), now).progress).toBe(100)
  })

  it('ignores cancelled linked tasks', () => {
    const g = goal({ id: 'g' })
    const tasks = [
      task({ id: 't1', goalId: 'g', status: 'completed' }),
      task({ id: 't2', goalId: 'g', status: 'cancelled' }),
    ]
    expect(goalStats(g, [], tasks, new Map(), now).progress).toBe(100)
  })

  it('computes days remaining from the deadline', () => {
    const g = goal({ id: 'g', deadline: at(2026, 6, 25) })
    expect(goalStats(g, [], [], new Map(), now).daysRemaining).toBe(10)
  })
})

describe('deadline logic', () => {
  const now = localDate(2026, 6, 15, 12)

  it('marks an open past-due task overdue', () => {
    expect(isTaskOverdue(task({ dueDate: at(2026, 6, 14) }), now)).toBe(true)
  })

  it('does not mark completed or cancelled tasks overdue', () => {
    expect(isTaskOverdue(task({ dueDate: at(2026, 6, 14), status: 'completed' }), now)).toBe(false)
    expect(isTaskOverdue(task({ dueDate: at(2026, 6, 14), status: 'cancelled' }), now)).toBe(false)
  })

  it('does not mark future or undated tasks overdue', () => {
    expect(isTaskOverdue(task({ dueDate: at(2026, 6, 16) }), now)).toBe(false)
    expect(isTaskOverdue(task({ dueDate: null }), now)).toBe(false)
  })
})

describe('blockingDependencies', () => {
  it('returns only dependencies that are still open', () => {
    const a = task({ id: 'a', status: 'completed' })
    const b = task({ id: 'b', status: 'in_progress' })
    const c = task({ id: 'c', status: 'cancelled' })
    const subject = task({ id: 'x', dependencies: ['a', 'b', 'c'] })
    const byId = new Map([a, b, c].map((t) => [t.id, t]))
    expect(blockingDependencies(subject, byId).map((t) => t.id)).toEqual(['b'])
  })

  it('ignores dependencies pointing at missing tasks', () => {
    const subject = task({ id: 'x', dependencies: ['ghost'] })
    expect(blockingDependencies(subject, new Map())).toEqual([])
  })
})
