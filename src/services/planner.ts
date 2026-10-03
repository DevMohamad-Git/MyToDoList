import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { PRIORITY_WEIGHT } from '@/config/constants'
import type { DayKey, PlanningSettings, Task, WeekDay } from '@/types'
import { dayAtMinutes, fromDayKey, minutesIntoDay, toDayKey, toISO } from '@/utils/date'
import { clamp } from '@/utils/math'

/**
 * Planning engine.
 *
 * Owns three concerns that both the planner UI and the AI layer depend on:
 *  1. laying tasks out on a day's timeline (with overlap detection),
 *  2. measuring a day's load against configured capacity,
 *  3. a deterministic auto-scheduler used for "Auto-plan day" and as the
 *     fallback/validator for AI-produced plans.
 *
 * Everything is pure: a day is described by its scheduled tasks and the planning
 * settings, never read from the database here.
 */

export interface ScheduledBlock {
  task: Task
  /** Minutes from local midnight. */
  start: number
  end: number
  /** Ids of other blocks this one overlaps. */
  conflictsWith: string[]
}

export interface DayPlan {
  day: DayKey
  blocks: ScheduledBlock[]
  /** Tasks due today (or overdue) that have no scheduled time. */
  unscheduled: Task[]
  scheduledMinutes: number
  capacityMinutes: number
  /** Scheduled minutes as a share of capacity, can exceed 100. */
  loadPercent: number
  overbooked: boolean
  conflictCount: number
  isWorkday: boolean
  workStart: number
  workEnd: number
}

export function effectiveDuration(task: Task, settings: PlanningSettings): number {
  return Math.max(5, task.estimatedDuration ?? settings.defaultTaskDuration)
}

/**
 * Lay scheduled tasks onto a day and flag overlaps. Two blocks conflict when
 * their intervals intersect; the UI uses this to draw them side by side and warn.
 */
export function buildDayPlan(
  day: DayKey,
  scheduledTasks: Task[],
  unscheduledCandidates: Task[],
  settings: PlanningSettings,
): DayPlan {
  const date = fromDayKey(day)
  const isWorkday = settings.workingHours.days.includes(date.getDay() as WeekDay)

  const blocks: ScheduledBlock[] = scheduledTasks
    .filter((t) => t.startDate && toDayKey(t.startDate) === day)
    .map((task) => {
      const start = minutesIntoDay(task.startDate!)
      return {
        task,
        start,
        end: start + effectiveDuration(task, settings),
        conflictsWith: [] as string[],
      }
    })
    .sort((a, b) => a.start - b.start || a.task.title.localeCompare(b.task.title))

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]
      const b = blocks[j]
      // Completed work cannot "conflict" — the overlap is historical, not a problem.
      if (CLOSED_TASK_STATUSES.includes(a.task.status) || CLOSED_TASK_STATUSES.includes(b.task.status)) continue
      if (a.start < b.end && b.start < a.end) {
        a.conflictsWith.push(b.task.id)
        b.conflictsWith.push(a.task.id)
      }
    }
  }

  const openBlocks = blocks.filter((b) => !CLOSED_TASK_STATUSES.includes(b.task.status))
  const scheduledMinutes = openBlocks.reduce((acc, b) => acc + (b.end - b.start), 0)
  const capacityMinutes = isWorkday
    ? Math.min(settings.dailyCapacityMinutes, settings.workingHours.end - settings.workingHours.start)
    : settings.dailyCapacityMinutes

  return {
    day,
    blocks,
    unscheduled: unscheduledCandidates,
    scheduledMinutes,
    capacityMinutes,
    loadPercent: capacityMinutes > 0 ? Math.round((scheduledMinutes / capacityMinutes) * 100) : 0,
    overbooked: scheduledMinutes > capacityMinutes,
    conflictCount: blocks.filter((b) => b.conflictsWith.length > 0).length,
    isWorkday,
    workStart: settings.workingHours.start,
    workEnd: settings.workingHours.end,
  }
}

/* --------------------------------------------------------------- free slots -- */

export interface FreeSlot {
  start: number
  end: number
  minutes: number
}

/** Gaps inside working hours not already occupied by an open scheduled block. */
export function freeSlots(day: DayKey, scheduledTasks: Task[], settings: PlanningSettings): FreeSlot[] {
  const busy = scheduledTasks
    .filter((t) => t.startDate && toDayKey(t.startDate) === day && !CLOSED_TASK_STATUSES.includes(t.status))
    .map((t) => {
      const start = minutesIntoDay(t.startDate!)
      return { start, end: start + effectiveDuration(t, settings) }
    })
    .sort((a, b) => a.start - b.start)

  // Merge overlapping busy intervals first so gap detection is straightforward.
  const merged: { start: number; end: number }[] = []
  for (const interval of busy) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }

  const slots: FreeSlot[] = []
  let cursor = settings.workingHours.start
  for (const interval of merged) {
    if (interval.start > cursor) {
      slots.push({ start: cursor, end: Math.min(interval.start, settings.workingHours.end), minutes: 0 })
    }
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < settings.workingHours.end) {
    slots.push({ start: cursor, end: settings.workingHours.end, minutes: 0 })
  }

  return slots
    .map((s) => ({ ...s, end: Math.min(s.end, settings.workingHours.end), minutes: 0 }))
    .filter((s) => s.end > s.start)
    .map((s) => ({ ...s, minutes: s.end - s.start }))
}

/* ----------------------------------------------------------- auto-schedule -- */

export interface PlanProposalItem {
  taskId: string
  title: string
  /** Minutes from midnight on `day`. */
  start: number
  durationMinutes: number
  day: DayKey
  reason: string
}

export interface PlanProposal {
  day: DayKey
  items: PlanProposalItem[]
  /** Tasks that could not be placed, with why. */
  skipped: { taskId: string; title: string; reason: string }[]
  totalMinutes: number
  availableMinutes: number
}

/**
 * Urgency ranking used to decide what gets the day's best hours.
 *
 * Combines priority weight with deadline proximity: an overdue low-priority task
 * still outranks a critical task due next month, because the cost of missing it
 * is immediate. Higher score = schedule earlier.
 */
export function urgencyScore(task: Task, now: Date): number {
  const priority = PRIORITY_WEIGHT[task.priority] * clamp(task.scoreWeight || 1, 0.25, 4)
  if (!task.dueDate) return priority

  const daysToDue = (new Date(task.dueDate).getTime() - now.getTime()) / 86_400_000
  // Overdue: large constant boost that scales with how late it is.
  if (daysToDue < 0) return priority + 20 + Math.min(20, Math.abs(daysToDue))
  // Due soon: hyperbolic boost so tomorrow >> next week >> next month.
  return priority + 12 / (daysToDue + 1)
}

export interface AutoScheduleOptions {
  day: DayKey
  candidates: Task[]
  /** Already-scheduled tasks on that day; their time is treated as taken. */
  existing: Task[]
  settings: PlanningSettings
  now?: Date
  /** Cap total planned minutes (e.g. "I have 6 hours tomorrow"). */
  availableMinutes?: number
  /** Insert a short gap between blocks. */
  bufferMinutes?: number
  /** Full task set, used to honour dependency ordering. */
  allTasks?: Task[]
}

/**
 * Greedy scheduler: sort by urgency, then place each task into the earliest free
 * slot that fits. Deterministic, and the same routine validates AI plans, so a
 * proposal from either source obeys identical constraints.
 */
export function autoSchedule(options: AutoScheduleOptions): PlanProposal {
  const { day, settings } = options
  const now = options.now ?? new Date()
  const buffer = options.bufferMinutes ?? 0
  const byId = new Map((options.allTasks ?? options.candidates).map((t) => [t.id, t]))

  const slots = freeSlots(day, options.existing, settings).map((s) => ({ ...s }))
  const budget =
    options.availableMinutes != null
      ? Math.max(0, options.availableMinutes)
      : slots.reduce((acc, s) => acc + s.minutes, 0)

  const eligible = options.candidates
    .filter((t) => !t.archived && !CLOSED_TASK_STATUSES.includes(t.status))
    .sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now))

  const items: PlanProposalItem[] = []
  const skipped: PlanProposal['skipped'] = []
  let used = 0

  for (const task of eligible) {
    const duration = effectiveDuration(task, settings)

    const blockers = task.dependencies
      .map((id) => byId.get(id))
      .filter((d): d is Task => Boolean(d) && !CLOSED_TASK_STATUSES.includes(d!.status))
    if (blockers.length > 0) {
      skipped.push({
        taskId: task.id,
        title: task.title,
        reason: `Blocked by ${blockers.length} incomplete dependency${blockers.length === 1 ? '' : 'ies'}: ${blockers.map((b) => b.title).join(', ')}`,
      })
      continue
    }

    if (used + duration > budget) {
      skipped.push({
        taskId: task.id,
        title: task.title,
        reason: `Needs ${duration}m but only ${Math.max(0, budget - used)}m of the available time is left`,
      })
      continue
    }

    const slot = slots.find((s) => s.minutes >= duration)
    if (!slot) {
      skipped.push({
        taskId: task.id,
        title: task.title,
        reason: `No remaining gap in working hours is long enough for ${duration}m`,
      })
      continue
    }

    items.push({
      taskId: task.id,
      title: task.title,
      start: slot.start,
      durationMinutes: duration,
      day,
      reason: reasonFor(task, now),
    })

    const consumed = duration + buffer
    slot.start += consumed
    slot.minutes = Math.max(0, slot.end - slot.start)
    used += duration
  }

  return {
    day,
    items,
    skipped,
    totalMinutes: used,
    availableMinutes: budget,
  }
}

function reasonFor(task: Task, now: Date): string {
  if (task.dueDate) {
    const days = Math.ceil((new Date(task.dueDate).getTime() - now.getTime()) / 86_400_000)
    if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
    if (days === 0) return 'Due today'
    if (days === 1) return 'Due tomorrow'
    if (days <= 7) return `Due in ${days} days, ${task.priority} priority`
  }
  return `${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)} priority`
}

/** Turn a proposal into task patches ready for the repository layer. */
export function proposalToPatches(proposal: PlanProposal): { id: string; startDate: string; status?: 'planned' }[] {
  return proposal.items.map((item) => ({
    id: item.taskId,
    startDate: toISO(dayAtMinutes(item.day, item.start)),
    status: 'planned' as const,
  }))
}

/* ------------------------------------------------------------- rescheduling -- */

export interface BehindScheduleReport {
  behindMinutes: number
  /** Open blocks whose window has already passed. */
  missedBlocks: ScheduledBlock[]
  remainingMinutes: number
  remainingCapacity: number
  feasible: boolean
}

/**
 * How far behind the user is right now: the total duration of today's open blocks
 * whose scheduled window has already elapsed. Drives the "you are 90 minutes
 * behind" prompt and the rescheduler.
 */
export function behindScheduleReport(plan: DayPlan, now: Date, settings: PlanningSettings): BehindScheduleReport {
  const nowMinutes = minutesIntoDay(now)
  const open = plan.blocks.filter((b) => !CLOSED_TASK_STATUSES.includes(b.task.status))

  const missedBlocks = open.filter((b) => b.end <= nowMinutes)
  const behindMinutes = missedBlocks.reduce((acc, b) => acc + (b.end - b.start), 0)

  const remaining = open.filter((b) => b.end > nowMinutes)
  const remainingMinutes = remaining.reduce((acc, b) => acc + (b.end - b.start), 0)
  const remainingCapacity = Math.max(0, settings.workingHours.end - Math.max(nowMinutes, settings.workingHours.start))

  return {
    behindMinutes,
    missedBlocks,
    remainingMinutes,
    remainingCapacity,
    feasible: behindMinutes + remainingMinutes <= remainingCapacity,
  }
}

export type RescheduleStrategy = 'compact_today' | 'defer_low_priority' | 'push_to_tomorrow'

export interface RescheduleAction {
  taskId: string
  title: string
  fromDay: DayKey
  toDay: DayKey
  fromStart: number | null
  toStart: number
  durationMinutes: number
  reason: string
}

export interface ReschedulePlan {
  strategy: RescheduleStrategy
  label: string
  description: string
  actions: RescheduleAction[]
  /** Tasks intentionally left alone, e.g. protected deadlines. */
  protectedTasks: { taskId: string; title: string; reason: string }[]
}

/**
 * Deterministic rescheduling proposals. Each strategy returns a preview only —
 * nothing is written until the user confirms, which is the same contract the AI
 * rescheduler uses.
 */
export function buildReschedulePlans(
  plan: DayPlan,
  now: Date,
  settings: PlanningSettings,
  tomorrow: DayKey,
): ReschedulePlan[] {
  const nowMinutes = minutesIntoDay(now)
  const open = plan.blocks.filter((b) => !CLOSED_TASK_STATUSES.includes(b.task.status))
  const stale = open.filter((b) => b.end <= nowMinutes)
  const cursorStart = Math.max(nowMinutes, settings.workingHours.start)

  const plans: ReschedulePlan[] = []

  // 1. Compact everything still undone into the rest of today.
  {
    const actions: RescheduleAction[] = []
    let cursor = cursorStart
    for (const block of [...stale].sort((a, b) => urgencyScore(b.task, now) - urgencyScore(a.task, now))) {
      const duration = block.end - block.start
      if (cursor + duration > settings.workingHours.end) break
      actions.push({
        taskId: block.task.id,
        title: block.task.title,
        fromDay: plan.day,
        toDay: plan.day,
        fromStart: block.start,
        toStart: cursor,
        durationMinutes: duration,
        reason: 'Moved into the next free stretch of today',
      })
      cursor += duration
    }
    plans.push({
      strategy: 'compact_today',
      label: 'Compact into today',
      description: `Pull ${actions.length} missed task${actions.length === 1 ? '' : 's'} forward into the remaining working hours, most urgent first.`,
      actions,
      protectedTasks: [],
    })
  }

  // 2. Defer low-priority work to tomorrow, protecting anything due today.
  {
    const actions: RescheduleAction[] = []
    const protectedTasks: ReschedulePlan['protectedTasks'] = []
    let cursor = settings.workingHours.start
    for (const block of stale) {
      const dueToday = block.task.dueDate && toDayKey(block.task.dueDate) === plan.day
      const important = block.task.priority === 'critical' || block.task.priority === 'high'
      if (dueToday || important) {
        protectedTasks.push({
          taskId: block.task.id,
          title: block.task.title,
          reason: dueToday ? 'Deadline is today' : `${block.task.priority} priority`,
        })
        continue
      }
      const duration = block.end - block.start
      actions.push({
        taskId: block.task.id,
        title: block.task.title,
        fromDay: plan.day,
        toDay: tomorrow,
        fromStart: block.start,
        toStart: cursor,
        durationMinutes: duration,
        reason: 'Low priority and not due today',
      })
      cursor += duration
    }
    plans.push({
      strategy: 'defer_low_priority',
      label: 'Defer low priority',
      description: `Move ${actions.length} lower-priority task${actions.length === 1 ? '' : 's'} to tomorrow and keep today's deadlines in place.`,
      actions,
      protectedTasks,
    })
  }

  // 3. Push everything missed to tomorrow morning.
  {
    const actions: RescheduleAction[] = []
    let cursor = settings.workingHours.start
    for (const block of [...stale].sort((a, b) => urgencyScore(b.task, now) - urgencyScore(a.task, now))) {
      const duration = block.end - block.start
      actions.push({
        taskId: block.task.id,
        title: block.task.title,
        fromDay: plan.day,
        toDay: tomorrow,
        fromStart: block.start,
        toStart: cursor,
        durationMinutes: duration,
        reason: 'Rolled over to tomorrow',
      })
      cursor += duration
    }
    plans.push({
      strategy: 'push_to_tomorrow',
      label: 'Push to tomorrow',
      description: `Roll all ${actions.length} missed task${actions.length === 1 ? '' : 's'} into tomorrow, ordered by urgency.`,
      actions,
      protectedTasks: [],
    })
  }

  return plans.filter((p) => p.actions.length > 0)
}

/** Convert reschedule actions into repository patches. */
export function rescheduleToPatches(actions: RescheduleAction[]): { id: string; startDate: string }[] {
  return actions.map((a) => ({
    id: a.taskId,
    startDate: toISO(dayAtMinutes(a.toDay, a.toStart)),
  }))
}

/**
 * Split a large task into N sequential chunks. Returns the parent patch plus the
 * subtask drafts; used by both the "split task" affordance and AI suggestions.
 */
export function splitTaskPlan(
  task: Task,
  parts: number,
  settings: PlanningSettings,
): { title: string; estimatedDuration: number; order: number }[] {
  const count = clamp(Math.floor(parts), 2, 8)
  const total = effectiveDuration(task, settings)
  const base = Math.floor(total / count)
  const remainder = total - base * count
  return Array.from({ length: count }, (_, i) => ({
    title: `${task.title} — part ${i + 1}/${count}`,
    estimatedDuration: base + (i < remainder ? 1 : 0),
    order: i,
  }))
}
