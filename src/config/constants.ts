import type {
  AISettings,
  PlanningSettings,
  PomodoroSettings,
  Priority,
  ProjectStatus,
  RatingThresholds,
  ScoringWeights,
  TaskStatus,
  WorkspaceSettings,
} from '@/types'

/* ---------------------------------------------------------------- scoring -- */

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  taskCompletion: 30,
  priorityCompletion: 25,
  deadlineDiscipline: 15,
  timeEfficiency: 10,
  focusTime: 10,
  consistency: 10,
}

export const DEFAULT_RATING_THRESHOLDS: RatingThresholds = {
  excellent: 90,
  veryGood: 80,
  good: 70,
  fair: 60,
}

/**
 * Priority → scoring multiplier. Completing a critical task is worth 4× a low
 * one in the priority-weighted component, which is what stops the score from
 * rewarding a pile of trivial checkboxes.
 */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/* --------------------------------------------------------------- planning -- */

export const DEFAULT_PLANNING: PlanningSettings = {
  workingHours: { start: 9 * 60, end: 18 * 60, days: [1, 2, 3, 4, 5] },
  defaultTaskDuration: 45,
  weekStartsOn: 1,
  defaultCalendarView: 'month',
  dailyFocusTarget: 180,
  dailyCapacityMinutes: 8 * 60,
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartNextWork: false,
  soundEnabled: true,
}

export function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    planning: { ...DEFAULT_PLANNING, workingHours: { ...DEFAULT_PLANNING.workingHours, days: [1, 2, 3, 4, 5] } },
    scoring: {
      weights: { ...DEFAULT_SCORING_WEIGHTS },
      thresholds: { ...DEFAULT_RATING_THRESHOLDS },
    },
    pomodoro: { ...DEFAULT_POMODORO },
  }
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  activeProviderId: null,
  providers: [],
  customInstructions: '',
  redactContent: false,
  requireConfirmation: true,
}

/** Starting points offered in Settings → AI so the user does not hand-type URLs. */
export const AI_PROVIDER_PRESETS = [
  {
    name: 'Anthropic',
    protocol: 'anthropic' as const,
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-6',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    hint: 'Requires a browser-access-enabled key. Sent with the anthropic-dangerous-direct-browser-access header.',
  },
  {
    name: 'OpenAI-compatible',
    protocol: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: [],
    hint: 'Works with any OpenAI-compatible /chat/completions endpoint.',
  },
  {
    name: 'Ollama (local)',
    protocol: 'openai' as const,
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    models: [],
    hint: 'Runs entirely on your machine. Start Ollama with OLLAMA_ORIGINS set to allow this app.',
  },
  {
    name: 'LM Studio (local)',
    protocol: 'openai' as const,
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    models: [],
    hint: 'Enable the local server in LM Studio, then pick the loaded model.',
  },
]

/* ----------------------------------------------------------------- labels -- */

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  planned: 'Planned',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
}

/**
 * Semantic colour tokens. Priority uses a single hue ramp (red → amber → blue →
 * slate) so severity reads at a glance; status uses distinct hues because the
 * values are categorical rather than ordered.
 */
export const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  high: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  medium: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  low: 'text-muted-foreground bg-muted/60 border-border',
}

export const PRIORITY_DOT: Record<Priority, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-400',
}

export const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  inbox: 'text-muted-foreground bg-muted/60 border-border',
  planned: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  in_progress: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  blocked: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  cancelled: 'text-muted-foreground bg-muted/40 border-border line-through',
}

export const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  active: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  on_hold: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  archived: 'text-muted-foreground bg-muted/50 border-border',
}

/** Palette offered when picking a project/goal/habit colour. */
export const ENTITY_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
  '#a855f7',
]

export const ACCENT_COLORS = [
  { key: 'indigo', label: 'Indigo', hue: '243 75% 59%' },
  { key: 'violet', label: 'Violet', hue: '262 83% 58%' },
  { key: 'blue', label: 'Blue', hue: '217 91% 60%' },
  { key: 'teal', label: 'Teal', hue: '173 80% 40%' },
  { key: 'emerald', label: 'Emerald', hue: '160 84% 39%' },
  { key: 'amber', label: 'Amber', hue: '38 92% 50%' },
  { key: 'rose', label: 'Rose', hue: '347 77% 50%' },
] as const

export type AccentKey = (typeof ACCENT_COLORS)[number]['key']

/** Statuses that mean "this task no longer needs doing". */
export const CLOSED_TASK_STATUSES: TaskStatus[] = ['completed', 'cancelled']

/** Attachment size guard. Beyond this a single blob makes IndexedDB writes slow. */
export const MAX_INLINE_ATTACHMENT_BYTES = 64 * 1024 * 1024

/** Total attachment size cap per task. Prevents any single task from monopolizing storage. */
export const MAX_TASK_ATTACHMENTS_TOTAL_BYTES = 256 * 1024 * 1024
