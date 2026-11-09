import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/database/db'
import { goalStats, projectStats, type GoalStats } from '@/services/progress'
import type { Goal, Habit, ID, Project, Task } from '@/types'
import { byOrderThenCreated } from '@/utils/math'

export interface GoalsPortfolioSummary {
  total: number
  active: number
  achieved: number
  onTrack: number
  offTrack: number
  avgProgress: number
  totalMilestones: number
  completedMilestones: number
  totalTasks: number
  completedTasks: number
}

export interface GoalsData {
  goals: Goal[]
  projects: Project[]
  tasks: Task[]
  habits: Habit[]
  projectsById: Map<ID, Project>
  tasksByGoalId: Map<ID, Task[]>
  habitsById: Map<ID, Habit>
  statsById: Map<ID, GoalStats>
  portfolioSummary: GoalsPortfolioSummary
}

/**
 * High-performance, isolated reactive data hook for goals.
 *
 * Instead of loading the entire workspace snapshot (which queries 8 tables),
 * this hook queries the tables relevant to goals (goals, projects, tasks, habits).
 * It pre-indexes tasks, computes project progress for rollup in O(N),
 * and derives real-time portfolio summaries for top render speed.
 */
export function useGoalsData(workspaceId: ID): {
  loading: boolean
  data: GoalsData | null
} {
  const raw = useLiveQuery(
    async () => {
      if (!workspaceId) return null
      const [goals, projects, tasks, habits] = await Promise.all([
        db.goals.where('workspaceId').equals(workspaceId).toArray(),
        db.projects.where('workspaceId').equals(workspaceId).toArray(),
        db.tasks.where('workspaceId').equals(workspaceId).toArray(),
        db.habits.where('workspaceId').equals(workspaceId).toArray(),
      ])

      return {
        goals: goals.sort(byOrderThenCreated),
        projects: projects.sort(byOrderThenCreated),
        tasks,
        habits: habits.filter((h) => !h.archived).sort(byOrderThenCreated),
      }
    },
    [workspaceId],
  )

  const data = useMemo<GoalsData | null>(() => {
    if (!raw) return null
    const now = new Date()

    // 1. Group tasks by projectId for project progress derivation
    const tasksByProjectId = new Map<ID, Task[]>()
    // 2. Group tasks by goalId
    const tasksByGoalId = new Map<ID, Task[]>()

    for (const task of raw.tasks) {
      if (task.projectId && !task.archived) {
        let pList = tasksByProjectId.get(task.projectId)
        if (!pList) {
          pList = []
          tasksByProjectId.set(task.projectId, pList)
        }
        pList.push(task)
      }

      if (task.goalId && !task.archived) {
        let gList = tasksByGoalId.get(task.goalId)
        if (!gList) {
          gList = []
          tasksByGoalId.set(task.goalId, gList)
        }
        gList.push(task)
      }
    }

    // 3. Precompute project progress in O(Projects)
    const projectProgressById = new Map<ID, number>()
    const projectsById = new Map<ID, Project>()
    for (const project of raw.projects) {
      projectsById.set(project.id, project)
      const pTasks = tasksByProjectId.get(project.id) ?? []
      const pStats = projectStats(project, pTasks, 0, now)
      projectProgressById.set(project.id, pStats.progress)
    }

    // 4. Derive stats and portfolio rollup per goal in O(Goals)
    const statsById = new Map<ID, GoalStats>()
    let onTrack = 0
    let offTrack = 0
    let totalProgress = 0
    let totalMilestones = 0
    let completedMilestones = 0
    let totalTasks = 0
    let completedTasks = 0

    for (const goal of raw.goals) {
      const stats = goalStats(goal, raw.projects, raw.tasks, projectProgressById, now)
      statsById.set(goal.id, stats)

      totalMilestones += stats.totalMilestones
      completedMilestones += stats.completedMilestones
      totalTasks += stats.linkedTasks
      completedTasks += stats.completedLinkedTasks

      if (goal.status === 'active') {
        if (stats.onTrack) onTrack++
        else offTrack++
        totalProgress += stats.progress
      }
    }

    const habitsById = new Map<ID, Habit>()
    for (const habit of raw.habits) {
      habitsById.set(habit.id, habit)
    }

    const activeCount = raw.goals.filter((g) => g.status === 'active').length
    const achievedCount = raw.goals.filter((g) => g.status === 'achieved').length

    return {
      goals: raw.goals,
      projects: raw.projects,
      tasks: raw.tasks,
      habits: raw.habits,
      projectsById,
      tasksByGoalId,
      habitsById,
      statsById,
      portfolioSummary: {
        total: raw.goals.length,
        active: activeCount,
        achieved: achievedCount,
        onTrack,
        offTrack,
        avgProgress: activeCount > 0 ? Math.round(totalProgress / activeCount) : 0,
        totalMilestones,
        completedMilestones,
        totalTasks,
        completedTasks,
      },
    }
  }, [raw])

  return {
    loading: raw === undefined,
    data,
  }
}
