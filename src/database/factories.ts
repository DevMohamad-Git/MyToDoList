import { defaultWorkspaceSettings, ENTITY_COLORS } from '@/config/constants'
import type {
  Goal,
  Habit,
  ID,
  Milestone,
  Project,
  Recurrence,
  Task,
  Workspace,
} from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Factories exist so that every write path produces a *complete* record. Partial
 * entities are the main source of drift in a schemaless store: a task created by
 * the quick-add bar and one created by the AI planner must have the same shape,
 * or downstream engines have to defend against `undefined` everywhere.
 */

function pickColor(seed: number): string {
  return ENTITY_COLORS[Math.abs(seed) % ENTITY_COLORS.length]
}

export function createWorkspace(input: Partial<Workspace> = {}): Workspace {
  const ts = nowISO()
  return {
    id: newId(),
    name: 'Personal',
    description: '',
    color: pickColor(0),
    icon: 'layers',
    isDemo: false,
    settings: defaultWorkspaceSettings(),
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

export function createProject(workspaceId: ID, input: Partial<Project> = {}): Project {
  const ts = nowISO()
  return {
    id: newId(),
    workspaceId,
    name: 'Untitled project',
    description: '',
    color: pickColor(Date.now()),
    icon: 'folder',
    status: 'active',
    priority: 'medium',
    startDate: null,
    deadline: null,
    manualProgress: null,
    tags: [],
    milestones: [],
    order: Date.now(),
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    ...input,
  }
}

export function createTask(workspaceId: ID, input: Partial<Task> = {}): Task {
  const ts = nowISO()
  return {
    id: newId(),
    workspaceId,
    projectId: null,
    parentTaskId: null,
    goalId: null,
    title: 'Untitled task',
    description: '',
    status: 'inbox',
    priority: 'medium',
    tags: [],
    startDate: null,
    dueDate: null,
    estimatedDuration: null,
    actualDuration: 0,
    manualProgress: null,
    scoreWeight: 1,
    recurrence: null,
    dependencies: [],
    links: [],
    notes: '',
    order: Date.now(),
    archived: false,
    recurrenceSourceId: null,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    ...input,
  }
}

export function createGoal(workspaceId: ID, input: Partial<Goal> = {}): Goal {
  const ts = nowISO()
  return {
    id: newId(),
    workspaceId,
    title: 'Untitled goal',
    description: '',
    status: 'active',
    priority: 'high',
    deadline: null,
    milestones: [],
    linkedProjectIds: [],
    manualProgress: null,
    notes: '',
    color: pickColor(Date.now() + 1),
    order: Date.now(),
    createdAt: ts,
    updatedAt: ts,
    achievedAt: null,
    ...input,
  }
}

export function createHabit(workspaceId: ID, input: Partial<Habit> = {}): Habit {
  const ts = nowISO()
  return {
    id: newId(),
    workspaceId,
    title: 'Untitled habit',
    description: '',
    frequency: 'daily',
    target: 1,
    weekDays: [],
    color: pickColor(Date.now() + 2),
    icon: 'repeat',
    archived: false,
    order: Date.now(),
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

export function createMilestone(input: Partial<Milestone> = {}): Milestone {
  return {
    id: newId(),
    title: 'New milestone',
    completed: false,
    dueDate: null,
    completedAt: null,
    order: Date.now(),
    ...input,
  }
}

export function createRecurrence(input: Partial<Recurrence> = {}): Recurrence {
  return {
    frequency: 'daily',
    interval: 1,
    weekDays: [],
    monthDay: null,
    until: null,
    count: null,
    generated: 0,
    ...input,
  }
}
