import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/database/db'
import { projectStats, type ProjectStats } from '@/services/progress'
import type { Goal, ID, Project, Task, TimeEntry } from '@/types'
import { byOrderThenCreated } from '@/utils/math'

export interface PortfolioSummary {
  total: number
  active: number
  completed: number
  onTrack: number
  atRisk: number
  offTrack: number
  totalTrackedMinutes: number
  avgProgress: number
}

export interface ProjectsData {
  projects: Project[]
  tasks: Task[]
  timeEntries: TimeEntry[]
  goals: Goal[]
  statsById: Map<ID, ProjectStats>
  goalsByProjectId: Map<ID, Goal[]>
  tasksByProjectId: Map<ID, Task[]>
  portfolioSummary: PortfolioSummary
}

/**
 * High-performance, isolated reactive data hook for projects.
 *
 * Instead of loading the entire workspace snapshot (which queries 8 tables),
 * this hook only queries the 4 tables relevant to projects (projects, tasks,
 * timeEntries, goals). It pre-indexes tasks and time entries in O(N) rather than
 * doing O(P x T) filters per project.
 */
export function useProjectsData(workspaceId: ID): {
  loading: boolean
  data: ProjectsData | null
  error?: Error | null
} {
  const raw = useLiveQuery(
    async () => {
      if (!workspaceId) return null
      try {
        const [projects, tasks, timeEntries, goals] = await Promise.all([
          db.projects.where('workspaceId').equals(workspaceId).toArray(),
          db.tasks.where('workspaceId').equals(workspaceId).toArray(),
          db.timeEntries.where('workspaceId').equals(workspaceId).toArray(),
          db.goals.where('workspaceId').equals(workspaceId).toArray(),
        ])

        return {
          projects: (projects ?? []).sort(byOrderThenCreated),
          tasks: tasks ?? [],
          timeEntries: timeEntries ?? [],
          goals: goals ?? [],
        }
      } catch (err) {
        console.error('Failed to load project tables from Dexie:', err)
        return {
          projects: [],
          tasks: [],
          timeEntries: [],
          goals: [],
        }
      }
    },
    [workspaceId],
  )

  const data = useMemo<ProjectsData | null>(() => {
    if (!raw) return null
    const now = new Date()

    try {
      // 1. Group logged minutes by projectId in O(TimeEntries)
      const minutesByProject = new Map<ID, number>()
      for (const entry of raw.timeEntries) {
        if (entry?.projectId) {
          minutesByProject.set(
            entry.projectId,
            (minutesByProject.get(entry.projectId) ?? 0) + (entry.duration ?? 0),
          )
        }
      }

      // 2. Group non-archived tasks by projectId in O(Tasks)
      const tasksByProjectId = new Map<ID, Task[]>()
      for (const task of raw.tasks) {
        if (task?.projectId && !task.archived) {
          let list = tasksByProjectId.get(task.projectId)
          if (!list) {
            list = []
            tasksByProjectId.set(task.projectId, list)
          }
          list.push(task)
        }
      }

      // 3. Map linked goals by projectId in O(Goals)
      const goalsByProjectId = new Map<ID, Goal[]>()
      for (const goal of raw.goals) {
        if (goal && Array.isArray(goal.linkedProjectIds)) {
          for (const pId of goal.linkedProjectIds) {
            let list = goalsByProjectId.get(pId)
            if (!list) {
              list = []
              goalsByProjectId.set(pId, list)
            }
            list.push(goal)
          }
        }
      }

      // 4. Derive stats per project in O(Projects)
      const statsById = new Map<ID, ProjectStats>()
      let onTrack = 0
      let atRisk = 0
      let offTrack = 0
      let totalTrackedMinutes = 0
      let totalProgress = 0

      for (const project of raw.projects) {
        if (!project) continue
        const safeProject: Project = {
          ...project,
          milestones: Array.isArray(project.milestones) ? project.milestones : [],
          tags: Array.isArray(project.tags) ? project.tags : [],
        }

        const pTasks = tasksByProjectId.get(project.id) ?? []
        const pMinutes = minutesByProject.get(project.id) ?? 0
        totalTrackedMinutes += pMinutes

        const stats = projectStats(safeProject, pTasks, pMinutes, now)
        statsById.set(project.id, stats)

        if (project.status === 'active' || project.status === 'planning') {
          if (stats.health === 'on_track') onTrack++
          else if (stats.health === 'at_risk') atRisk++
          else if (stats.health === 'off_track') offTrack++
          totalProgress += stats.progress
        }
      }

      const activeCount = raw.projects.filter(
        (p) => p && (p.status === 'active' || p.status === 'planning' || p.status === 'on_hold'),
      ).length
      const completedCount = raw.projects.filter((p) => p && p.status === 'completed').length

      return {
        projects: raw.projects,
        tasks: raw.tasks,
        timeEntries: raw.timeEntries,
        goals: raw.goals,
        statsById,
        goalsByProjectId,
        tasksByProjectId,
        portfolioSummary: {
          total: raw.projects.length,
          active: activeCount,
          completed: completedCount,
          onTrack,
          atRisk,
          offTrack,
          totalTrackedMinutes,
          avgProgress: activeCount > 0 ? Math.round(totalProgress / activeCount) : 0,
        },
      }
    } catch (err) {
      console.error('Failed to compute projects data stats:', err)
      return {
        projects: raw.projects ?? [],
        tasks: raw.tasks ?? [],
        timeEntries: raw.timeEntries ?? [],
        goals: raw.goals ?? [],
        statsById: new Map(),
        goalsByProjectId: new Map(),
        tasksByProjectId: new Map(),
        portfolioSummary: {
          total: raw.projects?.length ?? 0,
          active: 0,
          completed: 0,
          onTrack: 0,
          atRisk: 0,
          offTrack: 0,
          totalTrackedMinutes: 0,
          avgProgress: 0,
        },
      }
    }
  }, [raw])

  return {
    loading: raw === undefined,
    data,
  }
}
