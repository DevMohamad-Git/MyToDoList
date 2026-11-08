import type { HabitFrequency, ID, ISODateTime, Priority, Project, Task, Goal, Habit } from '@/types'

export type AIProviderId = 'openrouter' | 'gemini' | 'groq' | 'mistral' | 'cerebras' | 'custom'

export type SearchProviderId = 'tavily' | 'exa' | 'serper' | 'jina'

export interface AIProviderState {
  id: AIProviderId
  name: string
  apiKey: string
  selectedModel: string
  availableModels: string[]
  customBaseUrl?: string
  isCustomModel?: boolean
  lastStatus?: 'idle' | 'success' | 'error' | 'quota_exhausted'
  lastError?: string
  freeTierNotes?: string
  keyUrl: string
}

export interface SearchSettings {
  provider: SearchProviderId
  apiKey: string
  enabledDefault: boolean
}

export interface AssistantQuestion {
  id: string
  text: string
  options: string[]
  allowCustom?: boolean
  allowDecideForMe?: boolean
}

export interface AssistantProposalTask {
  id?: string
  title: string
  description?: string
  estimatedDuration?: number
  priority: Priority
  dueDate?: ISODateTime | null
  tags?: string[]
  /** URLs ONLY from verified real search results */
  links?: Array<{ label: string; url: string }>
  subtasks?: Array<{ title: string; estimatedDuration?: number }>
  enabled?: boolean
}

export interface AssistantProposal {
  type: 'create_project_tasks' | 'create_habits' | 'create_goal' | 'bulk_edit' | 'bulk_delete' | 'schedule_planner'
  assumptions: string[]
  project?: {
    name: string
    description?: string
    color?: string
    icon?: string
    deadline?: ISODateTime | null
  }
  tasks?: AssistantProposalTask[]
  habits?: Array<{
    title: string
    description?: string
    target: number
    unit?: string
    frequency: HabitFrequency
    color?: string
    icon?: string
    enabled?: boolean
  }>
  goal?: {
    title: string
    description?: string
    deadline?: ISODateTime | null
    milestones?: string[]
    priority: Priority
  }
  edits?: Array<{
    entityType: 'task' | 'project'
    id: ID
    currentTitle: string
    field: string
    oldValue: unknown
    newValue: unknown
    enabled?: boolean
  }>
  deletions?: Array<{
    entityType: 'task' | 'project' | 'habit' | 'goal'
    id: ID
    title: string
    fullSnapshot?: unknown
  }>
  scheduleSlots?: Array<{
    taskId: ID
    taskTitle: string
    startDate: ISODateTime
    duration: number
    enabled?: boolean
  }>
}

/**
 * Granular rollback log - stores only the specific entities created, modified or deleted
 * so that undo only touches these items and never overwrites unrelated workspace changes.
 */
export interface GranularUndoLog {
  id: string
  proposalType: string
  createdAt: ISODateTime
  createdItems: Array<{ entityType: 'project' | 'task' | 'habit' | 'goal'; id: ID }>
  updatedItems: Array<{
    entityType: 'task' | 'project' | 'habit' | 'goal'
    id: ID
    previousValues: Record<string, unknown>
  }>
  deletedItems: Array<{
    entityType: 'task' | 'project' | 'habit' | 'goal'
    item: Project | Task | Habit | Goal
  }>
}

export interface WebSearchSource {
  title: string
  url: string
  snippet?: string
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: ISODateTime
  questions?: AssistantQuestion[]
  selectedAnswers?: Record<string, string>
  proposal?: AssistantProposal
  actionStatus?: 'pending' | 'executed' | 'cancelled' | 'undone'
  undoLog?: GranularUndoLog
  sources?: WebSearchSource[]
  error?: string
  isRetrying?: boolean
}

export interface AssistantConversation {
  id: string
  workspaceId: ID
  title: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  webSearchEnabled: boolean
  messages: AssistantMessage[]
}

export interface AssistantSettings {
  activeProviderId: AIProviderId
  providers: Record<AIProviderId, AIProviderState>
  search: SearchSettings
  directCreationMode: boolean
  autoSwitchOnQuota: boolean
  customInstructions: string
}
