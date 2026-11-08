import { db } from '@/database/db'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import type { ID } from '@/types'
import { formatDuration, toDayKey } from '@/utils/date'
import { formatJalali } from '@/utils/jalali'

export interface WorkspaceDataSummary {
  todayJalali: string
  todayGregorian: string
  tasks: {
    total: number
    open: number
    inbox: number
    overdue: number
    completedToday: number
    blocked: number
    topOpenTasks: Array<{
      id: ID
      title: string
      priority: string
      dueDateJalali: string | null
      projectName?: string
      tags: string[]
    }>
    overdueTasks: Array<{
      id: ID
      title: string
      priority: string
      dueDateJalali: string | null
    }>
  }
  focus: {
    todayMinutes: number
    todayFormatted: string
    past7DaysMinutes: number
    past7DaysFormatted: string
    recentSessions: Array<{
      dayJalali: string
      durationMinutes: number
      taskTitle?: string
    }>
  }
  habits: {
    total: number
    habitsToday: Array<{
      id: ID
      title: string
      target: number
      completedToday: number
      done: boolean
    }>
  }
  projects: Array<{
    id: ID
    name: string
    status: string
    deadlineJalali: string | null
    tags: string[]
  }>
  existingTags: string[]
}

/**
 * Read-only querying tool for the AI assistant to inspect live tasks, focus stats,
 * habits and projects without modifying any data.
 */
export async function queryWorkspaceData(workspaceId: ID): Promise<WorkspaceDataSummary> {
  const now = new Date()
  const todayDayKey = toDayKey(now)
  const todayJalali = formatJalali(now)
  const todayGregorian = todayDayKey

  // Fetch all entities for this workspace
  const [tasks, projects, focusSessions, habits, habitEntries] = await Promise.all([
    db.tasks.where('workspaceId').equals(workspaceId).toArray(),
    db.projects.where('workspaceId').equals(workspaceId).toArray(),
    db.focusSessions.where('workspaceId').equals(workspaceId).toArray(),
    db.habits.where('workspaceId').equals(workspaceId).toArray(),
    db.habitEntries.where('workspaceId').equals(workspaceId).toArray(),
  ])

  const projectMap = new Map<ID, string>()
  const existingTagsSet = new Set<string>()

  for (const p of projects) {
    projectMap.set(p.id, p.name)
    p.tags.forEach((t) => existingTagsSet.add(t))
  }

  // Tasks aggregation
  let totalTasks = 0
  let openTasks = 0
  let inboxTasks = 0
  let overdueTasksCount = 0
  let completedTodayCount = 0
  let blockedTasksCount = 0

  const topOpen: WorkspaceDataSummary['tasks']['topOpenTasks'] = []
  const overdueList: WorkspaceDataSummary['tasks']['overdueTasks'] = []

  for (const t of tasks) {
    if (t.archived) continue
    totalTasks++
    t.tags.forEach((tag) => existingTagsSet.add(tag))

    const isClosed = CLOSED_TASK_STATUSES.includes(t.status)
    if (t.status === 'inbox') inboxTasks++
    if (t.status === 'blocked') blockedTasksCount++

    if (t.status === 'completed' && t.completedAt && toDayKey(new Date(t.completedAt)) === todayDayKey) {
      completedTodayCount++
    }

    if (!isClosed) {
      openTasks++
      const due = t.dueDate ? new Date(t.dueDate) : null
      const isOverdue = due ? due < now : false

      if (isOverdue) {
        overdueTasksCount++
        overdueList.push({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueDateJalali: due ? formatJalali(due) : null,
        })
      }

      if (topOpen.length < 25) {
        topOpen.push({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueDateJalali: due ? formatJalali(due) : null,
          projectName: t.projectId ? projectMap.get(t.projectId) : undefined,
          tags: t.tags,
        })
      }
    }
  }

  // Focus sessions aggregation
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let todayFocusMinutes = 0
  let past7DaysMinutes = 0
  const recentSessions: WorkspaceDataSummary['focus']['recentSessions'] = []

  const taskMap = new Map<ID, string>(tasks.map((t) => [t.id, t.title]))

  for (const s of focusSessions) {
    const sessionDate = new Date(s.startTime)
    if (s.day === todayDayKey) {
      todayFocusMinutes += s.duration
    }
    if (sessionDate >= sevenDaysAgo) {
      past7DaysMinutes += s.duration
    }
  }

  const sortedSessions = [...focusSessions].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 5)
  for (const s of sortedSessions) {
    recentSessions.push({
      dayJalali: formatJalali(new Date(s.startTime)),
      durationMinutes: s.duration,
      taskTitle: s.taskId ? taskMap.get(s.taskId) : undefined,
    })
  }

  // Habits aggregation
  const todayEntriesByHabit = new Map<ID, number>()
  for (const e of habitEntries) {
    if (e.day === todayDayKey) {
      todayEntriesByHabit.set(e.habitId, (todayEntriesByHabit.get(e.habitId) ?? 0) + e.count)
    }
  }

  const habitsToday: WorkspaceDataSummary['habits']['habitsToday'] = habits
    .filter((h) => !h.archived)
    .map((h) => {
      const completed = todayEntriesByHabit.get(h.id) ?? 0
      return {
        id: h.id,
        title: h.title,
        target: h.target,
        completedToday: completed,
        done: completed >= h.target,
      }
    })

  const projectsList = projects
    .filter((p) => p.status !== 'archived')
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      deadlineJalali: p.deadline ? formatJalali(new Date(p.deadline)) : null,
      tags: p.tags,
    }))

  return {
    todayJalali,
    todayGregorian,
    tasks: {
      total: totalTasks,
      open: openTasks,
      inbox: inboxTasks,
      overdue: overdueTasksCount,
      completedToday: completedTodayCount,
      blocked: blockedTasksCount,
      topOpenTasks: topOpen,
      overdueTasks: overdueList,
    },
    focus: {
      todayMinutes: todayFocusMinutes,
      todayFormatted: formatDuration(todayFocusMinutes),
      past7DaysMinutes: past7DaysMinutes,
      past7DaysFormatted: formatDuration(past7DaysMinutes),
      recentSessions,
    },
    habits: {
      total: habits.filter((h) => !h.archived).length,
      habitsToday,
    },
    projects: projectsList,
    existingTags: Array.from(existingTagsSet),
  }
}
