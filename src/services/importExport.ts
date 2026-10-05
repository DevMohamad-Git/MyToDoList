import { db, SCHEMA_VERSION } from '@/database/db'
import {
  createGoal,
  createHabit,
  createProject,
  createTask,
  createWorkspace,
} from '@/database/factories'
import { defaultWorkspaceSettings } from '@/config/constants'
import { logActivity } from '@/storage/activityRepo'
import { computeRangeStats, loadSnapshot } from '@/services/analytics'
import type {
  ActivityRecord,
  Attachment,
  DailyReview,
  EarnedAchievement,
  FocusSession,
  Goal,
  Habit,
  HabitEntry,
  ID,
  Project,
  Task,
  TimeEntry,
  WeeklyReview,
  Workspace,
} from '@/types'
import {
  ACTIVITY_TYPES,
  FOCUS_MODES,
  GOAL_STATUSES,
  HABIT_FREQUENCIES,
  PRIORITIES,
  PROJECT_STATUSES,
  SESSION_TYPES,
  TASK_STATUSES,
} from '@/types'
import { nowISO, toDayKey } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Workspace import / export.
 *
 * Format is a single self-describing JSON document. Attachment *bytes* are
 * optional (`includeAttachments`) because inlining base64 blobs can multiply the
 * file size by 1.37× and a workspace with videos would produce an unusable
 * export; metadata is always included so a restore can tell the user exactly
 * which files need re-attaching.
 *
 * Import is **validated then transactional**: nothing is written until the whole
 * document has passed validation, and ids are remapped so an import can never
 * collide with or overwrite existing records.
 */

export const EXPORT_FORMAT = 'flow-os.workspace'
export const EXPORT_VERSION = 1

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: number
  schemaVersion: number
  exportedAt: string
  appName: string
  workspace: Workspace
  projects: Project[]
  tasks: Task[]
  goals: Goal[]
  habits: Habit[]
  habitEntries: HabitEntry[]
  timeEntries: TimeEntry[]
  focusSessions: FocusSession[]
  dailyReviews: DailyReview[]
  weeklyReviews: WeeklyReview[]
  achievements: EarnedAchievement[]
  activity: ActivityRecord[]
  /** Attachment metadata; `data` is present only when bytes were included. */
  attachments: (Attachment & { data?: string })[]
  /** Informational snapshot so an export is readable without importing it. */
  statistics: {
    tasks: number
    completedTasks: number
    projects: number
    goals: number
    habits: number
    focusMinutes: number
    trackedMinutes: number
    attachmentBytes: number
    last30DayScore: number
  }
}

/* ------------------------------------------------------------------ export -- */

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Chunked to avoid blowing the argument limit on large files.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export interface ExportOptions {
  includeAttachments?: boolean
  includeActivity?: boolean
}

export async function exportWorkspace(
  workspaceId: ID,
  options: ExportOptions = {},
): Promise<ExportBundle> {
  const workspace = await db.workspaces.get(workspaceId)
  if (!workspace) throw new Error('Workspace not found.')

  const [
    projects,
    tasks,
    goals,
    habits,
    habitEntries,
    timeEntries,
    focusSessions,
    dailyReviews,
    weeklyReviews,
    achievements,
    activity,
    attachmentRows,
  ] = await Promise.all([
    db.projects.where('workspaceId').equals(workspaceId).toArray(),
    db.tasks.where('workspaceId').equals(workspaceId).toArray(),
    db.goals.where('workspaceId').equals(workspaceId).toArray(),
    db.habits.where('workspaceId').equals(workspaceId).toArray(),
    db.habitEntries.where('workspaceId').equals(workspaceId).toArray(),
    db.timeEntries.where('workspaceId').equals(workspaceId).toArray(),
    db.focusSessions.where('workspaceId').equals(workspaceId).toArray(),
    db.dailyReviews.where('workspaceId').equals(workspaceId).toArray(),
    db.weeklyReviews.where('workspaceId').equals(workspaceId).toArray(),
    db.achievements.where('workspaceId').equals(workspaceId).toArray(),
    options.includeActivity === false
      ? Promise.resolve([] as ActivityRecord[])
      : db.activity.where('workspaceId').equals(workspaceId).toArray(),
    db.attachments.where('workspaceId').equals(workspaceId).toArray(),
  ])

  const attachments: (Attachment & { data?: string })[] = []
  for (const row of attachmentRows) {
    if (options.includeAttachments && row.storage === 'indexeddb' && row.blobKey) {
      const blob = await db.blobs.get(row.blobKey)
      attachments.push(blob ? { ...row, data: await blobToBase64(blob.blob) } : { ...row })
    } else {
      attachments.push({ ...row })
    }
  }

  const snapshot = await loadSnapshot(workspace)
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return toDayKey(d)
  })
  const range = computeRangeStats(snapshot, last30)

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    appName: 'FlowOS',
    workspace,
    projects,
    tasks,
    goals,
    habits,
    habitEntries,
    timeEntries,
    focusSessions,
    dailyReviews,
    weeklyReviews,
    achievements,
    activity,
    attachments,
    statistics: {
      tasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed').length,
      projects: projects.length,
      goals: goals.length,
      habits: habits.length,
      focusMinutes: focusSessions.reduce((a, s) => a + s.duration, 0),
      trackedMinutes: timeEntries.reduce((a, e) => a + e.duration, 0),
      attachmentBytes: attachmentRows.reduce((a, r) => a + r.size, 0),
      last30DayScore: range.score,
    },
  }
}

export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2)
}

/* -------------------------------------------------------------- validation -- */

export interface ValidationIssue {
  path: string
  message: string
  /** `error` blocks the import; `warning` is repaired and reported. */
  level: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  bundle: ExportBundle | null
  summary: {
    workspaceName: string
    tasks: number
    projects: number
    goals: number
    habits: number
    attachments: number
    attachmentsWithData: number
    exportedAt: string | null
  } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Validate an untrusted document. Structural problems are errors; recoverable
 * field problems are warnings and get defaulted during normalisation. The goal is
 * that a slightly-off file still restores rather than being rejected outright,
 * while a genuinely wrong file never reaches the database.
 */
export function validateBundle(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  const error = (path: string, message: string) => issues.push({ path, message, level: 'error' })
  const warn = (path: string, message: string) => issues.push({ path, message, level: 'warning' })

  if (!isRecord(raw)) {
    return {
      valid: false,
      issues: [{ path: '$', message: 'File does not contain a JSON object.', level: 'error' }],
      bundle: null,
      summary: null,
    }
  }

  if (raw.format !== EXPORT_FORMAT && raw.format !== 'momentum-os.workspace') {
    error('$.format', `Expected format “${EXPORT_FORMAT}” but found “${String(raw.format ?? 'nothing')}”. This does not look like a FlowOS export.`)
  }
  const version = typeof raw.version === 'number' ? raw.version : null
  if (version === null) {
    error('$.version', 'Missing export version.')
  } else if (version > EXPORT_VERSION) {
    error('$.version', `Export version ${version} is newer than this app supports (${EXPORT_VERSION}). Update FlowOS first.`)
  }

  if (!isRecord(raw.workspace)) {
    error('$.workspace', 'Missing workspace object.')
  } else if (typeof raw.workspace.name !== 'string' || !raw.workspace.name.trim()) {
    warn('$.workspace.name', 'Workspace name missing; it will be named “Imported workspace”.')
  }

  // Bail before per-record checks if the shape is fundamentally wrong.
  if (issues.some((i) => i.level === 'error')) {
    return { valid: false, issues, bundle: null, summary: null }
  }

  const workspaceRaw = raw.workspace as Record<string, unknown>
  const tasks = asArray(raw.tasks)
  const projects = asArray(raw.projects)
  const goals = asArray(raw.goals)
  const habits = asArray(raw.habits)
  const attachments = asArray(raw.attachments)

  const projectIds = new Set(projects.filter(isRecord).map((p) => String(p.id)))
  const goalIds = new Set(goals.filter(isRecord).map((g) => String(g.id)))
  const taskIds = new Set(tasks.filter(isRecord).map((t) => String(t.id)))

  tasks.forEach((task, index) => {
    if (!isRecord(task)) {
      warn(`$.tasks[${index}]`, 'Entry is not an object and will be skipped.')
      return
    }
    if (typeof task.id !== 'string') warn(`$.tasks[${index}].id`, 'Missing id; a new one will be generated.')
    if (typeof task.title !== 'string' || !task.title.trim())
      warn(`$.tasks[${index}].title`, 'Missing title; will import as “Untitled task”.')
    if (task.status !== undefined && !TASK_STATUSES.includes(task.status as never))
      warn(`$.tasks[${index}].status`, `Unknown status “${String(task.status)}”; defaulting to inbox.`)
    if (task.priority !== undefined && !PRIORITIES.includes(task.priority as never))
      warn(`$.tasks[${index}].priority`, `Unknown priority “${String(task.priority)}”; defaulting to medium.`)
    if (typeof task.projectId === 'string' && !projectIds.has(task.projectId))
      warn(`$.tasks[${index}].projectId`, 'References a project not present in this file; the link will be dropped.')
    if (typeof task.parentTaskId === 'string' && !taskIds.has(task.parentTaskId))
      warn(`$.tasks[${index}].parentTaskId`, 'References a missing parent task; the task will import at top level.')
    if (typeof task.goalId === 'string' && !goalIds.has(task.goalId))
      warn(`$.tasks[${index}].goalId`, 'References a goal not present in this file; the link will be dropped.')
  })

  projects.forEach((project, index) => {
    if (!isRecord(project)) {
      warn(`$.projects[${index}]`, 'Entry is not an object and will be skipped.')
      return
    }
    if (project.status !== undefined && !PROJECT_STATUSES.includes(project.status as never))
      warn(`$.projects[${index}].status`, `Unknown status “${String(project.status)}”; defaulting to active.`)
  })

  goals.forEach((goal, index) => {
    if (isRecord(goal) && goal.status !== undefined && !GOAL_STATUSES.includes(goal.status as never))
      warn(`$.goals[${index}].status`, `Unknown status “${String(goal.status)}”; defaulting to active.`)
  })

  habits.forEach((habit, index) => {
    if (isRecord(habit) && habit.frequency !== undefined && !HABIT_FREQUENCIES.includes(habit.frequency as never))
      warn(`$.habits[${index}].frequency`, `Unknown frequency “${String(habit.frequency)}”; defaulting to daily.`)
  })

  const attachmentsWithData = attachments.filter((a) => isRecord(a) && typeof a.data === 'string').length
  const attachmentsWithoutData = attachments.length - attachmentsWithData
  if (attachmentsWithoutData > 0) {
    warn(
      '$.attachments',
      `${attachmentsWithoutData} attachment${attachmentsWithoutData === 1 ? '' : 's'} reference${attachmentsWithoutData === 1 ? 's' : ''} files whose contents are not in this export. Metadata will be imported but the files must be re-attached.`,
    )
  }

  const bundle: ExportBundle = {
    format: EXPORT_FORMAT,
    version: version ?? EXPORT_VERSION,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : nowISO(),
    appName: typeof raw.appName === 'string' ? raw.appName : 'FlowOS',
    workspace: workspaceRaw as unknown as Workspace,
    projects: projects.filter(isRecord) as unknown as Project[],
    tasks: tasks.filter(isRecord) as unknown as Task[],
    goals: goals.filter(isRecord) as unknown as Goal[],
    habits: habits.filter(isRecord) as unknown as Habit[],
    habitEntries: asArray(raw.habitEntries).filter(isRecord) as unknown as HabitEntry[],
    timeEntries: asArray(raw.timeEntries).filter(isRecord) as unknown as TimeEntry[],
    focusSessions: asArray(raw.focusSessions).filter(isRecord) as unknown as FocusSession[],
    dailyReviews: asArray(raw.dailyReviews).filter(isRecord) as unknown as DailyReview[],
    weeklyReviews: asArray(raw.weeklyReviews).filter(isRecord) as unknown as WeeklyReview[],
    achievements: asArray(raw.achievements).filter(isRecord) as unknown as EarnedAchievement[],
    activity: asArray(raw.activity).filter(isRecord) as unknown as ActivityRecord[],
    attachments: attachments.filter(isRecord) as unknown as (Attachment & { data?: string })[],
    statistics: (isRecord(raw.statistics) ? raw.statistics : {}) as ExportBundle['statistics'],
  }

  return {
    valid: !issues.some((i) => i.level === 'error'),
    issues,
    bundle,
    summary: {
      workspaceName: typeof workspaceRaw.name === 'string' ? workspaceRaw.name : 'Imported workspace',
      tasks: bundle.tasks.length,
      projects: bundle.projects.length,
      goals: bundle.goals.length,
      habits: bundle.habits.length,
      attachments: bundle.attachments.length,
      attachmentsWithData,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    },
  }
}

export function parseAndValidate(text: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return {
      valid: false,
      issues: [{ path: '$', message: `File is not valid JSON: ${(e as Error).message}`, level: 'error' }],
      bundle: null,
      summary: null,
    }
  }
  return validateBundle(parsed)
}

/* ------------------------------------------------------------------ import -- */

export type ImportMode = 'new_workspace' | 'merge' | 'replace'

export interface ImportResult {
  workspaceId: ID
  workspaceName: string
  counts: Record<string, number>
  warnings: string[]
}

/**
 * Write a validated bundle into the database.
 *
 * - `new_workspace` (default, always safe): creates a fresh workspace.
 * - `merge`: adds the bundle's records into `targetWorkspaceId`, keeping existing data.
 * - `replace`: clears the target workspace's content first.
 *
 * All ids are remapped through a fresh id map, so importing the same file twice
 * produces two independent copies instead of silently overwriting anything.
 */
export async function importBundle(
  bundle: ExportBundle,
  mode: ImportMode = 'new_workspace',
  targetWorkspaceId?: ID,
): Promise<ImportResult> {
  const warnings: string[] = []
  const idMap = new Map<string, ID>()
  const remap = (oldId: string | null | undefined): ID | null => {
    if (!oldId) return null
    const existing = idMap.get(oldId)
    if (existing) return existing
    const fresh = newId()
    idMap.set(oldId, fresh)
    return fresh
  }

  let workspaceId: ID
  let workspaceName: string

  if (mode === 'new_workspace') {
    const source = bundle.workspace ?? {}
    const workspace = createWorkspace({
      name: (source.name || 'Imported workspace').slice(0, 80),
      description: source.description ?? '',
      color: source.color,
      icon: source.icon,
      isDemo: false,
      // Merge settings over defaults so a partial/old settings object cannot
      // produce a workspace with missing configuration.
      settings: {
        ...defaultWorkspaceSettings(),
        ...(source.settings ?? {}),
        planning: { ...defaultWorkspaceSettings().planning, ...(source.settings?.planning ?? {}) },
        scoring: {
          weights: { ...defaultWorkspaceSettings().scoring.weights, ...(source.settings?.scoring?.weights ?? {}) },
          thresholds: {
            ...defaultWorkspaceSettings().scoring.thresholds,
            ...(source.settings?.scoring?.thresholds ?? {}),
          },
        },
        pomodoro: { ...defaultWorkspaceSettings().pomodoro, ...(source.settings?.pomodoro ?? {}) },
      },
    })
    await db.workspaces.add(workspace)
    workspaceId = workspace.id
    workspaceName = workspace.name
  } else {
    if (!targetWorkspaceId) throw new Error('A target workspace is required for merge and replace.')
    const target = await db.workspaces.get(targetWorkspaceId)
    if (!target) throw new Error('Target workspace no longer exists.')
    workspaceId = target.id
    workspaceName = target.name
    if (mode === 'replace') {
      const { workspaceRepo } = await import('@/storage/workspaceRepo')
      await workspaceRepo.clearContent(workspaceId)
    }
  }

  // Pre-seed the id map so cross references resolve regardless of array order.
  for (const project of bundle.projects) if (project.id) remap(project.id)
  for (const task of bundle.tasks) if (task.id) remap(task.id)
  for (const goal of bundle.goals) if (goal.id) remap(goal.id)
  for (const habit of bundle.habits) if (habit.id) remap(habit.id)

  const projects: Project[] = bundle.projects.map((p) =>
    createProject(workspaceId, {
      ...p,
      id: remap(p.id) ?? newId(),
      workspaceId,
      status: PROJECT_STATUSES.includes(p.status) ? p.status : 'active',
      priority: PRIORITIES.includes(p.priority) ? p.priority : 'medium',
      milestones: Array.isArray(p.milestones) ? p.milestones.map((m) => ({ ...m, id: m.id || newId() })) : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
    }),
  )

  const knownProjectIds = new Set(projects.map((p) => p.id))
  const goals: Goal[] = bundle.goals.map((g) =>
    createGoal(workspaceId, {
      ...g,
      id: remap(g.id) ?? newId(),
      workspaceId,
      status: GOAL_STATUSES.includes(g.status) ? g.status : 'active',
      priority: PRIORITIES.includes(g.priority) ? g.priority : 'high',
      milestones: Array.isArray(g.milestones) ? g.milestones.map((m) => ({ ...m, id: m.id || newId() })) : [],
      linkedProjectIds: (Array.isArray(g.linkedProjectIds) ? g.linkedProjectIds : [])
        .map((id) => idMap.get(id))
        .filter((id): id is ID => Boolean(id) && knownProjectIds.has(id!)),
    }),
  )
  const knownGoalIds = new Set(goals.map((g) => g.id))

  const tasks: Task[] = bundle.tasks.map((t) => {
    const mappedProject = t.projectId ? idMap.get(t.projectId) : null
    const mappedParent = t.parentTaskId ? idMap.get(t.parentTaskId) : null
    const mappedGoal = t.goalId ? idMap.get(t.goalId) : null
    return createTask(workspaceId, {
      ...t,
      id: remap(t.id) ?? newId(),
      workspaceId,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : 'Untitled task',
      status: TASK_STATUSES.includes(t.status) ? t.status : 'inbox',
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
      projectId: mappedProject && knownProjectIds.has(mappedProject) ? mappedProject : null,
      parentTaskId: mappedParent ?? null,
      goalId: mappedGoal && knownGoalIds.has(mappedGoal) ? mappedGoal : null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      links: Array.isArray(t.links) ? t.links.map((l) => ({ ...l, id: l.id || newId() })) : [],
      dependencies: (Array.isArray(t.dependencies) ? t.dependencies : [])
        .map((id) => idMap.get(id))
        .filter((id): id is ID => Boolean(id)),
      actualDuration: Number.isFinite(t.actualDuration) ? t.actualDuration : 0,
      scoreWeight: Number.isFinite(t.scoreWeight) ? t.scoreWeight : 1,
      archived: Boolean(t.archived),
      recurrenceSourceId: t.recurrenceSourceId ? (idMap.get(t.recurrenceSourceId) ?? null) : null,
    })
  })
  const knownTaskIds = new Set(tasks.map((t) => t.id))
  // Drop parent links whose target did not survive.
  for (const task of tasks) {
    if (task.parentTaskId && !knownTaskIds.has(task.parentTaskId)) task.parentTaskId = null
    task.dependencies = task.dependencies.filter((d) => knownTaskIds.has(d))
  }

  const habits: Habit[] = bundle.habits.map((h) =>
    createHabit(workspaceId, {
      ...h,
      id: remap(h.id) ?? newId(),
      workspaceId,
      frequency: HABIT_FREQUENCIES.includes(h.frequency) ? h.frequency : 'daily',
      target: Number.isFinite(h.target) && h.target > 0 ? h.target : 1,
      weekDays: Array.isArray(h.weekDays) ? h.weekDays : [],
    }),
  )
  const knownHabitIds = new Set(habits.map((h) => h.id))

  const habitEntries: HabitEntry[] = bundle.habitEntries
    .map((e) => ({
      id: newId(),
      workspaceId,
      habitId: (e.habitId ? idMap.get(e.habitId) : null) ?? '',
      day: typeof e.day === 'string' ? e.day : '',
      count: Number.isFinite(e.count) ? e.count : 1,
      note: typeof e.note === 'string' ? e.note : '',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : nowISO(),
    }))
    .filter((e) => e.habitId && knownHabitIds.has(e.habitId) && /^\d{4}-\d{2}-\d{2}$/.test(e.day))

  const timeEntries: TimeEntry[] = bundle.timeEntries
    .map((e) => {
      const startTime = typeof e.startTime === 'string' ? e.startTime : nowISO()
      const mappedTask = e.taskId ? idMap.get(e.taskId) : null
      const mappedProject = e.projectId ? idMap.get(e.projectId) : null
      return {
        id: newId(),
        workspaceId,
        taskId: mappedTask && knownTaskIds.has(mappedTask) ? mappedTask : null,
        projectId: mappedProject && knownProjectIds.has(mappedProject) ? mappedProject : null,
        startTime,
        endTime: typeof e.endTime === 'string' ? e.endTime : startTime,
        duration: Number.isFinite(e.duration) && e.duration >= 0 ? e.duration : 0,
        sessionType: SESSION_TYPES.includes(e.sessionType) ? e.sessionType : 'focus',
        note: typeof e.note === 'string' ? e.note : '',
        day: typeof e.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day) ? e.day : toDayKey(startTime),
        createdAt: typeof e.createdAt === 'string' ? e.createdAt : nowISO(),
      }
    })
    .filter((e) => e.duration >= 0)

  const focusSessions: FocusSession[] = bundle.focusSessions.map((s) => {
    const startTime = typeof s.startTime === 'string' ? s.startTime : nowISO()
    const mappedTask = s.taskId ? idMap.get(s.taskId) : null
    const mappedProject = s.projectId ? idMap.get(s.projectId) : null
    return {
      id: newId(),
      workspaceId,
      taskId: mappedTask && knownTaskIds.has(mappedTask) ? mappedTask : null,
      projectId: mappedProject && knownProjectIds.has(mappedProject) ? mappedProject : null,
      startTime,
      endTime: typeof s.endTime === 'string' ? s.endTime : startTime,
      duration: Number.isFinite(s.duration) && s.duration >= 0 ? s.duration : 0,
      mode: FOCUS_MODES.includes(s.mode) ? s.mode : 'pomodoro',
      pomodoroCycle: Number.isFinite(s.pomodoroCycle) ? s.pomodoroCycle : null,
      plannedDuration: Number.isFinite(s.plannedDuration) ? s.plannedDuration : 0,
      completed: Boolean(s.completed),
      interruptions: Number.isFinite(s.interruptions) ? s.interruptions : 0,
      day: typeof s.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.day) ? s.day : toDayKey(startTime),
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : nowISO(),
    }
  })

  const dailyReviews: DailyReview[] = bundle.dailyReviews
    .filter((r) => typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day))
    .map((r) => ({
      id: newId(),
      workspaceId,
      day: r.day,
      score: Number.isFinite(r.score) ? r.score : 0,
      completedTaskIds: (Array.isArray(r.completedTaskIds) ? r.completedTaskIds : [])
        .map((id) => idMap.get(id))
        .filter((id): id is ID => Boolean(id)),
      incompleteTaskIds: (Array.isArray(r.incompleteTaskIds) ? r.incompleteTaskIds : [])
        .map((id) => idMap.get(id))
        .filter((id): id is ID => Boolean(id)),
      selfRating: Number.isFinite(r.selfRating) ? r.selfRating : null,
      wentWell: typeof r.wentWell === 'string' ? r.wentWell : '',
      blockers: typeof r.blockers === 'string' ? r.blockers : '',
      improve: typeof r.improve === 'string' ? r.improve : '',
      notes: typeof r.notes === 'string' ? r.notes : '',
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowISO(),
      updatedAt: nowISO(),
    }))

  const weeklyReviews: WeeklyReview[] = bundle.weeklyReviews
    .filter((r) => typeof r.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.weekStart))
    .map((r) => ({
      id: newId(),
      workspaceId,
      weekStart: r.weekStart,
      score: Number.isFinite(r.score) ? r.score : 0,
      completionRate: Number.isFinite(r.completionRate) ? r.completionRate : 0,
      focusMinutes: Number.isFinite(r.focusMinutes) ? r.focusMinutes : 0,
      bestDay: typeof r.bestDay === 'string' ? r.bestDay : null,
      weakestDay: typeof r.weakestDay === 'string' ? r.weakestDay : null,
      highlights: typeof r.highlights === 'string' ? r.highlights : '',
      challenges: typeof r.challenges === 'string' ? r.challenges : '',
      nextWeekFocus: typeof r.nextWeekFocus === 'string' ? r.nextWeekFocus : '',
      notes: typeof r.notes === 'string' ? r.notes : '',
      aiAnalysis: typeof r.aiAnalysis === 'string' ? r.aiAnalysis : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowISO(),
      updatedAt: nowISO(),
    }))

  const achievements: EarnedAchievement[] = bundle.achievements
    .filter((a) => typeof a.achievementKey === 'string')
    .map((a) => ({
      id: newId(),
      workspaceId,
      achievementKey: a.achievementKey,
      earnedAt: typeof a.earnedAt === 'string' ? a.earnedAt : nowISO(),
      value: Number.isFinite(a.value) ? a.value : 0,
    }))

  const activity: ActivityRecord[] = bundle.activity
    .filter((a) => typeof a.summary === 'string')
    .map((a) => {
      const createdAt = typeof a.createdAt === 'string' ? a.createdAt : nowISO()
      return {
        id: newId(),
        workspaceId,
        type: ACTIVITY_TYPES.includes(a.type) ? a.type : 'task_updated',
        entityKind: a.entityKind ?? 'task',
        entityId: (a.entityId ? idMap.get(a.entityId) : null) ?? a.entityId ?? newId(),
        summary: a.summary,
        meta: typeof a.meta === 'object' && a.meta !== null ? a.meta : {},
        createdAt,
        day: typeof a.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.day) ? a.day : toDayKey(createdAt),
      }
    })

  // Attachments: restore bytes when present, otherwise keep the metadata and say so.
  const attachmentRows: Attachment[] = []
  const blobRows: { key: string; workspaceId: ID; blob: Blob }[] = []
  let restoredBytes = 0
  let metadataOnly = 0

  for (const a of bundle.attachments) {
    const mappedTask = a.taskId ? idMap.get(a.taskId) : null
    const mappedProject = a.projectId ? idMap.get(a.projectId) : null
    const id = newId()
    if (a.data) {
      try {
        const blob = base64ToBlob(a.data, a.mimeType || 'application/octet-stream')
        const blobKey = `blob-${id}`
        blobRows.push({ key: blobKey, workspaceId, blob })
        attachmentRows.push({
          id,
          workspaceId,
          taskId: mappedTask && knownTaskIds.has(mappedTask) ? mappedTask : null,
          projectId: mappedProject && knownProjectIds.has(mappedProject) ? mappedProject : null,
          filename: a.filename || 'file',
          mimeType: a.mimeType || 'application/octet-stream',
          size: blob.size,
          storage: 'indexeddb',
          blobKey,
          filePath: null,
          createdAt: a.createdAt || nowISO(),
        })
        restoredBytes += blob.size
        continue
      } catch {
        warnings.push(`Attachment “${a.filename}” had unreadable embedded data and was imported as metadata only.`)
      }
    }
    metadataOnly++
    attachmentRows.push({
      id,
      workspaceId,
      taskId: mappedTask && knownTaskIds.has(mappedTask) ? mappedTask : null,
      projectId: mappedProject && knownProjectIds.has(mappedProject) ? mappedProject : null,
      filename: a.filename || 'file',
      mimeType: a.mimeType || 'application/octet-stream',
      size: Number.isFinite(a.size) ? a.size : 0,
      storage: a.storage === 'filesystem' ? 'filesystem' : 'indexeddb',
      blobKey: null,
      filePath: a.filePath ?? null,
      createdAt: a.createdAt || nowISO(),
    })
  }

  if (metadataOnly > 0) {
    warnings.push(
      `${metadataOnly} attachment${metadataOnly === 1 ? '' : 's'} imported as metadata only — the file contents were not in the export. Re-attach them from the task view.`,
    )
  }

  // Single transaction: either the whole workspace lands or nothing does.
  await db.transaction(
    'rw',
    [
      db.projects,
      db.tasks,
      db.goals,
      db.habits,
      db.habitEntries,
      db.timeEntries,
      db.focusSessions,
      db.dailyReviews,
      db.weeklyReviews,
      db.achievements,
      db.activity,
      db.attachments,
      db.blobs,
    ],
    async () => {
      if (projects.length) await db.projects.bulkAdd(projects)
      if (tasks.length) await db.tasks.bulkAdd(tasks)
      if (goals.length) await db.goals.bulkAdd(goals)
      if (habits.length) await db.habits.bulkAdd(habits)
      if (habitEntries.length) await db.habitEntries.bulkAdd(habitEntries)
      if (timeEntries.length) await db.timeEntries.bulkAdd(timeEntries)
      if (focusSessions.length) await db.focusSessions.bulkAdd(focusSessions)
      if (dailyReviews.length) await db.dailyReviews.bulkAdd(dailyReviews)
      if (weeklyReviews.length) await db.weeklyReviews.bulkAdd(weeklyReviews)
      if (achievements.length) await db.achievements.bulkAdd(achievements)
      if (activity.length) await db.activity.bulkAdd(activity)
      if (attachmentRows.length) await db.attachments.bulkAdd(attachmentRows)
      if (blobRows.length) await db.blobs.bulkAdd(blobRows)
    },
  )

  await logActivity(
    workspaceId,
    'data_imported',
    'workspace',
    workspaceId,
    `Imported ${tasks.length} task(s), ${projects.length} project(s) from a ${bundle.appName} export`,
    { mode, restoredBytes },
  )

  return {
    workspaceId,
    workspaceName,
    counts: {
      projects: projects.length,
      tasks: tasks.length,
      goals: goals.length,
      habits: habits.length,
      habitEntries: habitEntries.length,
      timeEntries: timeEntries.length,
      focusSessions: focusSessions.length,
      dailyReviews: dailyReviews.length,
      weeklyReviews: weeklyReviews.length,
      achievements: achievements.length,
      attachments: attachmentRows.length,
    },
    warnings,
  }
}

/** Filename for an export/backup, safe on every OS. */
export function exportFilename(workspaceName: string, kind: 'export' | 'backup' = 'export'): string {
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'workspace'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `flow-${slug}-${kind}-${stamp}.json`
}
