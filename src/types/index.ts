/**
 * Domain model for Momentum OS.
 *
 * Every persisted record is a plain, structured-clone-safe object so it can be
 * written straight into IndexedDB and serialised into an export bundle without
 * a translation step. Dates are stored as ISO-8601 strings (not `Date`) so that
 * exports are stable, diffable and timezone-explicit; durations are always
 * **minutes** unless the field name says otherwise.
 */

export type ID = string

/** ISO-8601 instant, e.g. `2026-08-26T09:30:00.000Z`. */
export type ISODateTime = string
/** Calendar day key in local time, e.g. `2026-08-26`. Used for day-bucketed data. */
export type DayKey = string

/* ------------------------------------------------------------------ enums -- */

export const TASK_STATUSES = [
  'inbox',
  'planned',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const GOAL_STATUSES = ['active', 'achieved', 'paused', 'abandoned'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const SESSION_TYPES = ['focus', 'short_break', 'long_break', 'manual'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const FOCUS_MODES = ['pomodoro', 'stopwatch', 'countdown'] as const
export type FocusMode = (typeof FOCUS_MODES)[number]

export const HABIT_FREQUENCIES = ['daily', 'weekly', 'custom'] as const
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number]

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** `0` = Sunday … `6` = Saturday, matching `Date.prototype.getDay`. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

/* ------------------------------------------------------------- workspace -- */

export interface WorkingHours {
  /** Minutes from local midnight, e.g. `540` = 09:00. */
  start: number
  /** Minutes from local midnight, e.g. `1080` = 18:00. */
  end: number
  /** Days considered workdays. */
  days: WeekDay[]
}

export interface ScoringWeights {
  taskCompletion: number
  priorityCompletion: number
  deadlineDiscipline: number
  timeEfficiency: number
  focusTime: number
  consistency: number
}

export interface RatingThresholds {
  excellent: number
  veryGood: number
  good: number
  fair: number
}

export interface PomodoroSettings {
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
  autoStartBreaks: boolean
  autoStartNextWork: boolean
  /** Play a short synthesised chime when an interval ends. */
  soundEnabled: boolean
}

export interface PlanningSettings {
  workingHours: WorkingHours
  /** Minutes assumed for a task with no estimate. */
  defaultTaskDuration: number
  weekStartsOn: WeekDay
  defaultCalendarView: 'month' | 'week' | 'day'
  /** Daily focus-time target in minutes; feeds the focus component of the score. */
  dailyFocusTarget: number
  /** Warn when a day's scheduled work exceeds this many minutes. */
  dailyCapacityMinutes: number
}

export interface WorkspaceSettings {
  planning: PlanningSettings
  scoring: {
    weights: ScoringWeights
    thresholds: RatingThresholds
  }
  pomodoro: PomodoroSettings
}

export interface Workspace {
  id: ID
  name: string
  description: string
  /** Tailwind-independent hex colour used for the workspace chip. */
  color: string
  icon: string
  isDemo: boolean
  settings: WorkspaceSettings
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/* --------------------------------------------------------------- project -- */

export interface Milestone {
  id: ID
  title: string
  completed: boolean
  dueDate: ISODateTime | null
  completedAt: ISODateTime | null
  order: number
}

export interface Project {
  id: ID
  workspaceId: ID
  name: string
  description: string
  color: string
  icon: string
  status: ProjectStatus
  priority: Priority
  startDate: ISODateTime | null
  deadline: ISODateTime | null
  /** Manual override in 0–100; when `null` progress is derived from tasks. */
  manualProgress: number | null
  tags: string[]
  milestones: Milestone[]
  order: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  completedAt: ISODateTime | null
}

/* ------------------------------------------------------------------ task -- */

export interface Recurrence {
  frequency: RecurrenceFrequency
  /** Repeat every N periods. */
  interval: number
  /** For weekly recurrence: which weekdays. Empty means "same weekday as due date". */
  weekDays: WeekDay[]
  /** For monthly recurrence: day of month (1–31). `null` uses the due date's day. */
  monthDay: number | null
  /** Stop generating occurrences after this instant. */
  until: ISODateTime | null
  /** Stop after this many occurrences. `null` = unlimited. */
  count: number | null
  /** How many occurrences have been generated so far. */
  generated: number
}

export interface TaskLink {
  id: ID
  label: string
  url: string
}

export interface Task {
  id: ID
  workspaceId: ID
  projectId: ID | null
  parentTaskId: ID | null
  goalId: ID | null
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  tags: string[]
  /** Scheduled start. Presence of `startDate` is what makes a task "scheduled". */
  startDate: ISODateTime | null
  dueDate: ISODateTime | null
  estimatedDuration: number | null
  /** Denormalised sum of time-entry durations; recomputed by the time service. */
  actualDuration: number
  /** Manual progress override 0–100; `null` derives progress from subtasks/status. */
  manualProgress: number | null
  /** Relative importance multiplier used by the scoring engine (0.25–4). */
  scoreWeight: number
  recurrence: Recurrence | null
  /** Task ids that must complete before this one can start. */
  dependencies: ID[]
  links: TaskLink[]
  notes: string
  order: number
  archived: boolean
  /** Set when this task was generated from a recurring template. */
  recurrenceSourceId: ID | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  completedAt: ISODateTime | null
}

/* ------------------------------------------------------------ attachment -- */

export type AttachmentStorage = 'indexeddb' | 'filesystem'

export interface Attachment {
  id: ID
  workspaceId: ID
  /** Owning task, or `null` when attached directly to a project. */
  taskId: ID | null
  projectId: ID | null
  filename: string
  mimeType: string
  /** Size in bytes. */
  size: number
  storage: AttachmentStorage
  /** Key into the `blobs` table when `storage === 'indexeddb'`. */
  blobKey: string | null
  /** Relative path inside the linked local workspace folder. */
  filePath: string | null
  createdAt: ISODateTime
}

export interface BlobRecord {
  key: string
  workspaceId: ID
  blob: Blob
}

/* ------------------------------------------------------------ time entry -- */

export interface TimeEntry {
  id: ID
  workspaceId: ID
  taskId: ID | null
  projectId: ID | null
  startTime: ISODateTime
  endTime: ISODateTime
  /** Minutes. Stored explicitly so paused time can be excluded. */
  duration: number
  sessionType: SessionType
  note: string
  /** Day bucket of `startTime`, indexed for fast per-day aggregation. */
  day: DayKey
  createdAt: ISODateTime
}

export interface FocusSession {
  id: ID
  workspaceId: ID
  taskId: ID | null
  projectId: ID | null
  startTime: ISODateTime
  endTime: ISODateTime
  /** Minutes actually focused (excludes paused time and breaks). */
  duration: number
  mode: FocusMode
  /** Which pomodoro cycle within the session (1-based); `null` outside pomodoro. */
  pomodoroCycle: number | null
  plannedDuration: number
  completed: boolean
  interruptions: number
  day: DayKey
  createdAt: ISODateTime
}

/* ------------------------------------------------------------------ goal -- */

export interface Goal {
  id: ID
  workspaceId: ID
  title: string
  description: string
  status: GoalStatus
  priority: Priority
  deadline: ISODateTime | null
  milestones: Milestone[]
  linkedProjectIds: ID[]
  /** Manual progress override 0–100; `null` derives from milestones + linked work. */
  manualProgress: number | null
  notes: string
  color: string
  order: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  achievedAt: ISODateTime | null
}

/* ----------------------------------------------------------------- habit -- */

export interface Habit {
  id: ID
  workspaceId: ID
  title: string
  description: string
  frequency: HabitFrequency
  /** Completions targeted per period (per day for daily, per week for weekly). */
  target: number
  /** For `custom` frequency: the weekdays the habit is due. */
  weekDays: WeekDay[]
  color: string
  icon: string
  archived: boolean
  order: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface HabitEntry {
  id: ID
  workspaceId: ID
  habitId: ID
  day: DayKey
  /** Number of completions logged on that day. */
  count: number
  note: string
  createdAt: ISODateTime
}

/* ---------------------------------------------------------------- review -- */

export interface DailyReview {
  id: ID
  workspaceId: ID
  day: DayKey
  /** Snapshot of the computed score at review time. */
  score: number
  completedTaskIds: ID[]
  incompleteTaskIds: ID[]
  /** User's own 1–5 rating of the day. */
  selfRating: number | null
  wentWell: string
  blockers: string
  improve: string
  notes: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface WeeklyReview {
  id: ID
  workspaceId: ID
  /** ISO date of the week's first day, per the workspace's `weekStartsOn`. */
  weekStart: DayKey
  score: number
  completionRate: number
  focusMinutes: number
  bestDay: DayKey | null
  weakestDay: DayKey | null
  highlights: string
  challenges: string
  nextWeekFocus: string
  notes: string
  /** Cached AI narrative, if the user generated one. */
  aiAnalysis: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/* ----------------------------------------------------------- achievement -- */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface EarnedAchievement {
  id: ID
  workspaceId: ID
  /** Stable key from the achievement catalogue. */
  achievementKey: string
  earnedAt: ISODateTime
  /** The metric value that unlocked it, for display ("100 tasks"). */
  value: number
}

/* -------------------------------------------------------------- activity -- */

export const ACTIVITY_TYPES = [
  'task_created',
  'task_updated',
  'task_completed',
  'task_reopened',
  'task_deleted',
  'task_rescheduled',
  'task_deadline_changed',
  'task_archived',
  'subtask_created',
  'project_created',
  'project_updated',
  'project_completed',
  'project_deleted',
  'goal_created',
  'goal_updated',
  'goal_achieved',
  'habit_created',
  'habit_logged',
  'focus_completed',
  'time_logged',
  'review_saved',
  'achievement_earned',
  'ai_plan_applied',
  'data_imported',
  'attachment_added',
  'attachment_removed',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type EntityKind = 'task' | 'project' | 'goal' | 'habit' | 'focus' | 'review' | 'workspace'

export interface ActivityRecord {
  id: ID
  workspaceId: ID
  type: ActivityType
  entityKind: EntityKind
  entityId: ID
  /** Human-readable summary, pre-rendered so history never needs a join to read. */
  summary: string
  /** Small structured payload for richer rendering (from/to values, etc.). */
  meta: Record<string, string | number | boolean | null>
  createdAt: ISODateTime
  day: DayKey
}

/* -------------------------------------------------------------- ai types -- */

export interface AIProviderConfig {
  id: ID
  /** Display label, e.g. "Anthropic", "OpenAI", "Local (Ollama)". */
  name: string
  /** Wire protocol. Both are OpenAI-compatible-ish; see `src/ai/adapters`. */
  protocol: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
  /** Extra headers some gateways require. */
  headers: Record<string, string>
  temperature: number
  maxTokens: number
}

export interface AISettings {
  enabled: boolean
  activeProviderId: ID | null
  providers: AIProviderConfig[]
  /** Free-form user guidance appended to every system prompt. */
  customInstructions: string
  /** Never send task titles/notes to the provider — only counts and durations. */
  redactContent: boolean
  /** Require an explicit confirm step before applying any AI proposal. */
  requireConfirmation: boolean
}

/* ------------------------------------------------------------ app state -- */

export interface AppMeta {
  key: string
  value: unknown
}

/** A local folder the user linked via the File System Access API. */
export interface LinkedFolder {
  workspaceId: ID
  /** Directory handle, persisted structurally in IndexedDB. */
  handle: FileSystemDirectoryHandle
  name: string
  linkedAt: ISODateTime
}
