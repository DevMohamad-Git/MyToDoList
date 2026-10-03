import { createGoal, createHabit, createProject, createTask } from '@/database/factories'
import type { Goal, Habit, Project, Task } from '@/types'

/**
 * Test fixture builders. They wrap the production factories so a test only states
 * the fields it cares about while still producing a complete, valid record —
 * which means the tests exercise the same shapes the app writes.
 */

export const WS = 'ws-test'

export function task(overrides: Partial<Task> = {}): Task {
  return createTask(WS, overrides)
}

export function project(overrides: Partial<Project> = {}): Project {
  return createProject(WS, overrides)
}

export function goal(overrides: Partial<Goal> = {}): Goal {
  return createGoal(WS, overrides)
}

export function habit(overrides: Partial<Habit> = {}): Habit {
  return createHabit(WS, overrides)
}

/** Local ISO instant for a given date + time, avoiding UTC drift in assertions. */
export function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

export function localDate(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}
